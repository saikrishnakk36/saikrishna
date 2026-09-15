import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

const DEFAULTS = {
  port: 8080,
  mediaRoot: './media',
  idleTimeout: 30,
  maxConcurrentStreams: 32,
  jwtSecret: 'change-me-in-production',
  sessionHours: 12,
};

/** Expand ${ENV:NAME} placeholders anywhere in the parsed config. */
function expandEnv(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{ENV:([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] ?? '');
  }
  if (Array.isArray(value)) return value.map(expandEnv);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandEnv(v)]));
  }
  return value;
}

function configPath() {
  if (process.env.CAMWALL_CONFIG) return path.resolve(process.env.CAMWALL_CONFIG);
  const real = path.join(ROOT, 'config', 'cameras.yaml');
  return fs.existsSync(real) ? real : path.join(ROOT, 'config', 'cameras.example.yaml');
}

/**
 * A site can hold several recorders - a campus with three DVRs is one site,
 * not three. Recorders are always normalized to a list so the rest of the
 * server has one shape to handle.
 *
 * The single-recorder shorthand (`recorder:` plus site-level `cameras:`)
 * stays valid and becomes a lone recorder with the id `main`.
 */
function normalizeRecorders(site) {
  if (Array.isArray(site.recorders)) {
    return site.recorders.map((rec, i) => ({
      ...rec,
      id: rec.id ?? `dvr${i + 1}`,
      name: rec.name ?? `DVR ${i + 1}`,
      cameras: rec.cameras ?? [],
    }));
  }
  if (site.recorder) {
    return [{ ...site.recorder, id: 'main', name: site.name, cameras: site.cameras ?? [] }];
  }
  return [];
}

/**
 * Flatten sites+recorders+cameras into a stable, addressable camera list.
 * Camera id is `<siteId>:<recorderId>:<channel>` - it survives renames,
 * reorders, and adding a recorder to an existing site.
 */
function buildCameras(sites) {
  const cameras = [];
  for (const site of sites) {
    if (site.kind === 'remote') continue; // federated cameras are fetched at runtime
    for (const rec of site.recorders) {
      for (const cam of rec.cameras) {
        cameras.push({
          id: `${site.id}:${rec.id}:${cam.channel}`,
          siteId: site.id,
          siteName: site.name,
          recorderId: rec.id,
          recorderName: rec.name,
          channel: cam.channel,
          name: cam.name ?? `Channel ${cam.channel}`,
          ptz: Boolean(cam.ptz),
          enabled: cam.enabled !== false,
          host: cam.host ?? rec.host,
          audio: Boolean(cam.audio),
          // Optional escape hatch: any ffmpeg-readable input, for cameras that
          // do not follow the CP Plus URL scheme.
          source: cam.source ?? null,
          sourceFormat: cam.sourceFormat ?? null,
        });
      }
    }
  }
  return cameras;
}

let cached = null;

export function loadConfig({ force = false } = {}) {
  if (cached && !force) return cached;

  const file = configPath();
  const raw = expandEnv(YAML.parse(fs.readFileSync(file, 'utf8')) ?? {});

  const server = { ...DEFAULTS, ...(raw.server ?? {}) };
  if (process.env.PORT) server.port = Number(process.env.PORT);
  if (process.env.CAMWALL_JWT_SECRET) server.jwtSecret = process.env.CAMWALL_JWT_SECRET;
  server.mediaRoot = path.resolve(ROOT, server.mediaRoot);

  const sites = (raw.sites ?? []).map((s) => ({ ...s, recorders: normalizeRecorders(s) }));

  cached = {
    file,
    server,
    users: raw.users ?? [],
    sites,
    cameras: buildCameras(sites),
    site: (id) => sites.find((s) => s.id === id),
    camera: (id) => cached.cameras.find((c) => c.id === id),
    /** The recorder a camera actually lives on - what speaks RTSP and CGI. */
    recorder: (siteId, recorderId) =>
      sites.find((s) => s.id === siteId)?.recorders.find((r) => r.id === recorderId),
    recorderFor: (camera) => cached.recorder(camera.siteId, camera.recorderId),
    /** Every recorder across every direct site, for health probing. */
    recorders: () =>
      sites
        .filter((s) => s.kind !== 'remote')
        .flatMap((s) => s.recorders.map((r) => ({ ...r, siteId: s.id, siteName: s.name }))),
  };

  if (server.jwtSecret === DEFAULTS.jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to start in production with the default jwtSecret. Set CAMWALL_JWT_SECRET.');
  }
  return cached;
}

export { ROOT };
