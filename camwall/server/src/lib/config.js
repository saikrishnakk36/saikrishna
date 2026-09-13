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
 * Flatten sites+cameras into a stable, addressable camera list.
 * Camera id is `<siteId>:<channel>` so it survives renames and reorders.
 */
function buildCameras(sites) {
  const cameras = [];
  for (const site of sites) {
    if (site.kind === 'remote') continue; // federated cameras are fetched at runtime
    for (const cam of site.cameras ?? []) {
      cameras.push({
        id: `${site.id}:${cam.channel}`,
        siteId: site.id,
        siteName: site.name,
        channel: cam.channel,
        name: cam.name ?? `Channel ${cam.channel}`,
        ptz: Boolean(cam.ptz),
        enabled: cam.enabled !== false,
        host: cam.host ?? site.recorder?.host,
        audio: Boolean(cam.audio),
        // Optional escape hatch: any ffmpeg-readable input, for cameras that
        // do not follow the CP Plus URL scheme.
        source: cam.source ?? null,
        sourceFormat: cam.sourceFormat ?? null,
      });
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

  const sites = (raw.sites ?? []).map((s) => ({ ...s, cameras: s.cameras ?? [] }));

  cached = {
    file,
    server,
    users: raw.users ?? [],
    sites,
    cameras: buildCameras(sites),
    site: (id) => sites.find((s) => s.id === id),
    camera: (id) => cached.cameras.find((c) => c.id === id),
  };

  if (server.jwtSecret === DEFAULTS.jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to start in production with the default jwtSecret. Set CAMWALL_JWT_SECRET.');
  }
  return cached;
}

export { ROOT };
