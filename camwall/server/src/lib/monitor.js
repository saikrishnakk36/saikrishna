/**
 * Health monitor.
 *
 * Recorders are pinged over the CGI API; cameras are checked by pulling a
 * snapshot. Camera checks are staggered across the interval so we never hit a
 * recorder with 32 simultaneous requests - CP Plus boxes handle that badly.
 */
import { EventEmitter } from 'node:events';
import { deviceInfo, snapshot } from './cpplus.js';

export class Monitor extends EventEmitter {
  constructor(config, { siteIntervalMs = 30_000, cameraIntervalMs = 120_000 } = {}) {
    super();
    this.config = config;
    this.siteIntervalMs = siteIntervalMs;
    this.cameraIntervalMs = cameraIntervalMs;
    this.sites = new Map();
    this.cameras = new Map();
    this.timers = [];
  }

  start() {
    const directSites = this.config.sites.filter((s) => s.kind !== 'remote');
    for (const site of directSites) {
      this.#checkSite(site);
      this.timers.push(setInterval(() => this.#checkSite(site), this.siteIntervalMs));
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

  async #checkSite(site) {
    const started = Date.now();
    try {
      const info = await deviceInfo(site);
      this.#setSite(site.id, {
        online: true,
        latencyMs: Date.now() - started,
        model: info.deviceType ?? info.serialNumber ?? null,
        error: null,
      });
    } catch (err) {
      this.#setSite(site.id, { online: false, latencyMs: null, error: err.message });
    }
  }

  async #checkCamera(cam) {
    const site = this.config.site(cam.siteId);
    try {
      const buf = await snapshot(site, cam);
      this.#setCamera(cam.id, { online: buf.length > 0, error: null });
    } catch (err) {
      this.#setCamera(cam.id, { online: false, error: err.message });
    }
  }

  #setSite(id, next) {
    const prev = this.sites.get(id);
    const value = { ...next, checkedAt: Date.now() };
    this.sites.set(id, value);
    if (prev?.online !== value.online) this.emit('site', { siteId: id, ...value });
  }

  #setCamera(id, next) {
    const prev = this.cameras.get(id);
    const value = { ...next, checkedAt: Date.now() };
    this.cameras.set(id, value);
    if (prev?.online !== value.online) this.emit('camera', { cameraId: id, ...value });
  }

  snapshotState() {
    return {
      sites: Object.fromEntries(this.sites),
      cameras: Object.fromEntries(this.cameras),
    };
  }

  stop() {
    for (const t of this.timers) { clearInterval(t); clearTimeout(t); }
    this.timers = [];
  }
}
