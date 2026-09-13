/**
 * On-demand RTSP -> HLS stream manager.
 *
 * One ffmpeg process per (camera, quality) that has at least one viewer.
 * Viewers hold a lease and heartbeat it; when the last lease expires the
 * process is torn down after `idleTimeout`. That is what lets a 40-camera
 * deployment run on a small box: only what is actually on screen is running.
 *
 * The grid uses the sub stream in copy mode (no CPU cost beyond remuxing).
 * H.265 sub streams are transcoded to H.264 because browsers cannot play
 * HEVC-in-HLS reliably outside Safari.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { rtspUrl, safeRtspUrl } from './cpplus.js';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const LEASE_TTL_MS = 20_000; // a viewer must heartbeat at least this often

export class StreamManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.streams = new Map(); // key -> stream record
    this.codecCache = new Map(); // rtsp url -> video codec name
    fs.mkdirSync(config.server.mediaRoot, { recursive: true });
    this.sweeper = setInterval(() => this.#sweep(), 5000);
    this.sweeper.unref?.();
  }

  static key(cameraId, quality) {
    return `${cameraId}__${quality}`;
  }

  /** Probe the stream's video codec so we know whether we can remux or must transcode. */
  async #videoCodec(url, format) {
    if (format) return null; // synthetic/raw sources are always encoded fresh
    if (this.codecCache.has(url)) return this.codecCache.get(url);
    const codec = await new Promise((resolve) => {
      const p = spawn(FFPROBE, [
        '-v', 'error',
        '-rtsp_transport', 'tcp',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'default=nw=1:nk=1',
        url,
      ]);
      let out = '';
      const timer = setTimeout(() => p.kill('SIGKILL'), 10_000);
      p.stdout.on('data', (d) => (out += d));
      p.on('error', () => { clearTimeout(timer); resolve(null); });
      p.on('close', () => { clearTimeout(timer); resolve(out.trim() || null); });
    });
    if (codec) this.codecCache.set(url, codec);
    return codec;
  }

  #inputArgs(url, format) {
    // Non-RTSP sources (a vendor that only speaks RTMP, an HTTP MJPEG camera,
    // a local capture device) skip the RTSP-specific transport flags.
    if (format) return ['-f', format, '-i', url];
    if (!url.startsWith('rtsp://')) return ['-i', url];
    return [
      '-rtsp_transport', 'tcp',
      '-timeout', '5000000',          // 5s socket timeout (microseconds)
      '-use_wallclock_as_timestamps', '1',
      '-i', url,
    ];
  }

  #ffmpegArgs(url, dir, { copyVideo, audio, format }) {
    const playlist = path.join(dir, 'index.m3u8');
    const args = [
      '-hide_banner', '-loglevel', 'warning',
      ...this.#inputArgs(url, format),
      '-an',
    ];
    if (audio) args.splice(args.indexOf('-an'), 1, '-c:a', 'aac', '-b:a', '32k', '-ac', '1');

    if (copyVideo) {
      args.push('-c:v', 'copy');
    } else {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-pix_fmt', 'yuv420p',
        '-g', '25',
        '-b:v', '800k',
      );
    }

    args.push(
      '-f', 'hls',
      '-hls_time', '1',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+omit_endlist+independent_segments+program_date_time',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', path.join(dir, 'seg%05d.ts'),
      playlist,
    );
    return args;
  }

  /**
   * Ensure a stream is running and return its descriptor.
   * Idempotent: repeated calls just refresh the lease.
   */
  async acquire(camera, quality, viewerId) {
    const key = StreamManager.key(camera.id, quality);
    let s = this.streams.get(key);

    if (!s) {
      const running = [...this.streams.values()].filter((x) => x.proc).length;
      if (running >= this.config.server.maxConcurrentStreams) {
        throw Object.assign(
          new Error(`Stream limit reached (${this.config.server.maxConcurrentStreams}). Close some tiles or raise maxConcurrentStreams.`),
          { status: 503 },
        );
      }
      const site = this.config.site(camera.siteId);
      const dir = path.join(this.config.server.mediaRoot, key);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });

      s = {
        key,
        cameraId: camera.id,
        quality,
        dir,
        // `source` lets a camera bypass the CP Plus URL scheme entirely.
        url: camera.source ?? rtspUrl(site, camera, quality),
        safeUrl: camera.source ?? safeRtspUrl(site, camera, quality),
        format: camera.sourceFormat ?? null,
        audio: camera.audio,
        leases: new Map(),
        proc: null,
        status: 'starting',
        error: null,
        restarts: 0,
        startedAt: Date.now(),
      };
      this.streams.set(key, s);
      this.#start(s).catch((err) => {
        s.status = 'error';
        s.error = err.message;
        this.emit('status', this.describe(s));
      });
    }

    s.leases.set(viewerId, Date.now() + LEASE_TTL_MS);
    s.idleSince = null;
    return this.describe(s);
  }

  renew(cameraId, quality, viewerId) {
    const s = this.streams.get(StreamManager.key(cameraId, quality));
    if (!s) return false;
    s.leases.set(viewerId, Date.now() + LEASE_TTL_MS);
    s.idleSince = null;
    return true;
  }

  release(cameraId, quality, viewerId) {
    const s = this.streams.get(StreamManager.key(cameraId, quality));
    if (!s) return;
    s.leases.delete(viewerId);
    if (s.leases.size === 0) s.idleSince = Date.now();
  }

  async #start(s) {
    const codec = await this.#videoCodec(s.url, s.format);
    // HEVC and MJPEG cannot ride copy-mode HLS into a browser, and a raw
    // source (lavfi, a capture device) has no encoded stream to copy at all.
    const copyVideo = !s.format && (!codec || ['h264', 'avc1'].includes(codec));
    s.codec = codec ?? 'unknown';
    s.mode = copyVideo ? 'copy' : 'transcode';

    const proc = spawn(FFMPEG, this.#ffmpegArgs(s.url, s.dir, { copyVideo, audio: s.audio, format: s.format }), {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    s.proc = proc;
    s.status = 'starting';
    s.error = null;
    this.emit('status', this.describe(s));

    let stderrTail = '';
    proc.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });

    // Consider the stream live once the playlist has real segments.
    const readyTimer = setInterval(() => {
      const pl = path.join(s.dir, 'index.m3u8');
      if (fs.existsSync(pl) && fs.readFileSync(pl, 'utf8').includes('.ts')) {
        clearInterval(readyTimer);
        if (s.status !== 'live') {
          s.status = 'live';
          this.emit('status', this.describe(s));
        }
      }
    }, 500);
    readyTimer.unref?.();

    proc.on('error', (err) => {
      clearInterval(readyTimer);
      s.status = 'error';
      s.fatal = err.code === 'ENOENT';
      s.error = s.fatal ? 'ffmpeg not found - install ffmpeg or set FFMPEG_PATH' : err.message;
      s.proc = null;
      this.emit('status', this.describe(s));
    });

    proc.on('close', (code, signal) => {
      clearInterval(readyTimer);
      s.proc = null;
      if (s.stopping || s.fatal) return;
      s.status = 'error';
      s.error = stderrTail.split('\n').filter(Boolean).pop() || `ffmpeg exited (${signal ?? code})`;
      this.emit('status', this.describe(s));

      // Retry while someone is still watching - cameras drop, links flap.
      if (s.leases.size > 0 && s.restarts < 10) {
        s.restarts += 1;
        const delay = Math.min(1000 * 2 ** s.restarts, 30_000);
        s.retryTimer = setTimeout(() => {
          if (s.leases.size > 0 && !s.stopping) this.#start(s).catch(() => {});
        }, delay);
        s.retryTimer.unref?.();
      }
    });
  }

  stop(key) {
    const s = this.streams.get(key);
    if (!s) return;
    s.stopping = true;
    clearTimeout(s.retryTimer);
    s.proc?.kill('SIGTERM');
    const proc = s.proc;
    if (proc) setTimeout(() => proc.kill('SIGKILL'), 3000).unref?.();
    this.streams.delete(key);
    fs.rm(s.dir, { recursive: true, force: true }, () => {});
    this.emit('status', { ...this.describe(s), status: 'stopped' });
  }

  #sweep() {
    const now = Date.now();
    const idleMs = this.config.server.idleTimeout * 1000;
    for (const s of this.streams.values()) {
      for (const [viewer, expiry] of s.leases) if (expiry < now) s.leases.delete(viewer);
      if (s.leases.size === 0) {
        s.idleSince ??= now;
        if (now - s.idleSince > idleMs) this.stop(s.key);
      } else {
        s.idleSince = null;
      }
    }
  }

  describe(s) {
    return {
      cameraId: s.cameraId,
      quality: s.quality,
      status: s.status,
      error: s.error,
      fatal: Boolean(s.fatal),
      codec: s.codec,
      mode: s.mode,
      viewers: s.leases.size,
      restarts: s.restarts,
      playlist: `/media/${s.key}/index.m3u8`,
      uptimeMs: Date.now() - s.startedAt,
    };
  }

  list() {
    return [...this.streams.values()].map((s) => this.describe(s));
  }

  shutdown() {
    clearInterval(this.sweeper);
    for (const key of [...this.streams.keys()]) this.stop(key);
  }
}
