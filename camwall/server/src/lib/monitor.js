/**
 * Health monitor.
 *
 * Every recorder is pinged over the CGI API - a site with three DVRs gets
 * three probes, so one dead DVR is visible rather than hidden behind its
 * siblings. Cameras are checked by pulling a snapshot, staggered across the
 * interval so we never hit a recorder with dozens of simultaneous requests:
 * CP Plus boxes handle that badly.
 */
import { EventEmitter } from 'node:events';
import { deviceInfo, snapshot } from './cpplus.js';

export class Monitor extends EventEmitter {
  constructor(config, { siteIntervalMs = 30_000, cameraIntervalMs = 120_000 } = {}) {
    super();
    this.config = config;
    this.siteIntervalMs = siteIntervalMs;
    this.cameraIntervalMs = cameraIntervalMs;
    this.recorders = new Map(); // `<siteId>:<recorderId>` -> health
    this.cameras = new Map();
    this.timers = [];
  }

  start() {
    for (const rec of this.config.recorders()) {
      this.#checkRecorder(rec);
      this.timers.push(setInterval(() => this.#checkRecorder(rec), this.siteIntervalMs));
    }

    const cams = this.config.cameras.filter((c) => c.enabled);
    const stagger = cams.length ? Math.floor(this.cameraIntervalMs / cams.length) : 0;
    cams.forEach((cam, i) => {
      const kick = setTimeout(() => {
        this.#checkCamera(cam);
        this.timers.push(setInterval(() => this.#checkCamera(cam), this.cameraIntervalMs));
      }, i * stagger);
      this.timers.push(kick);
    });

    for (const t of this.timers) t.unref?.();
    return this;
  }

  async #checkRecorder(rec) {
    const started = Date.now();
    try {
      const info = await deviceInfo(rec);
      this.#setRecorder(rec, {
        online: true,
        latencyMs: Date.now() - started,
        model: info.deviceType ?? info.serialNumber ?? null,
        error: null,
      });
    } catch (err) {
      this.#setRecorder(rec, { online: false, latencyMs: null, error: err.message });
    }
  }

  async #checkCamera(cam) {
    const rec = this.config.recorderFor(cam);
    try {
      const buf = await snapshot(rec, cam);
      this.#setCamera(cam.id, { online: buf.length > 0, error: null });
    } catch (err) {
      this.#setCamera(cam.id, { online: false, error: err.message });
    }
  }

  #setRecorder(rec, next) {
    const key = `${rec.siteId}:${rec.id}`;
    const prev = this.recorders.get(key);
    const value = { ...next, checkedAt: Date.now() };
    this.recorders.set(key, value);
    if (prev?.online !== value.online) {
      this.emit('recorder', { siteId: rec.siteId, recorderId: rec.id, name: rec.name, ...value });
    }
  }

  #setCamera(id, next) {
    const prev = this.cameras.get(id);
    const value = { ...next, checkedAt: Date.now() };
    this.cameras.set(id, value);
    if (prev?.online !== value.online) this.emit('camera', { cameraId: id, ...value });
  }

  snapshotState() {
    return {
      recorders: Object.fromEntries(this.recorders),
      cameras: Object.fromEntries(this.cameras),
    };
  }

  /** A site is healthy only while every one of its recorders answers. */
  siteHealth(siteId) {
    const own = [...this.recorders.entries()].filter(([k]) => k.startsWith(`${siteId}:`));
    if (own.length === 0) return { online: null, recorders: 0, recordersOnline: 0 };
    const up = own.filter(([, v]) => v.online).length;
    return { online: up === own.length, recorders: own.length, recordersOnline: up };
  }

  stop() {
    for (const t of this.timers) { clearInterval(t); clearTimeout(t); }
    this.timers = [];
  }
}
