/**
 * CP Plus / Dahua protocol helpers.
 *
 * CP Plus recorders (Orange, Cosmic, Indigo) and IP cameras ship Dahua OEM
 * firmware, so they expose the Dahua RTSP paths and the /cgi-bin CGI API.
 * Hikvision-style paths are included because mixed sites are common.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const RTSP_PATHS = {
  cpplus: (ch, sub) => `/cam/realmonitor?channel=${ch}&subtype=${sub}`,
  dahua: (ch, sub) => `/cam/realmonitor?channel=${ch}&subtype=${sub}`,
  hikvision: (ch, sub) => `/Streaming/Channels/${ch}${sub === 0 ? '01' : '02'}`,
  generic: (ch, sub) => `/cam/realmonitor?channel=${ch}&subtype=${sub}`,
};

/**
 * Build the RTSP URL for a camera.
 * quality 'sub' => subtype=1 (low-res, used by the grid)
 * quality 'main' => subtype=0 (full-res, used fullscreen / for recording)
 */
export function rtspUrl(site, camera, quality = 'sub') {
  const rec = site.recorder ?? {};
  const vendor = rec.vendor ?? 'cpplus';
  const subtype = quality === 'main' ? 0 : 1;
  const host = camera.host ?? rec.host;
  const port = rec.rtspPort ?? 554;
  const path = (RTSP_PATHS[vendor] ?? RTSP_PATHS.generic)(camera.channel, subtype);
  const auth = rec.username
    ? `${encodeURIComponent(rec.username)}:${encodeURIComponent(rec.password ?? '')}@`
    : '';
  return `rtsp://${auth}${host}:${port}${path}`;
}

/** Same URL with the password masked - safe for logs and API responses. */
export function safeRtspUrl(site, camera, quality = 'sub') {
  return rtspUrl(site, camera, quality).replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
}

function digestHeader({ username, password, method, uri, wwwAuth, nc = '00000001' }) {
  const parts = Object.fromEntries(
    [...wwwAuth.matchAll(/(\w+)=("([^"]*)"|[^,]*)/g)].map((m) => [m[1], m[3] ?? m[2]]),
  );
  const cnonce = crypto.randomBytes(8).toString('hex');
  const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
  const ha1 = md5(`${username}:${parts.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const qop = parts.qop?.split(',')[0];
  const response = qop
    ? md5(`${ha1}:${parts.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${parts.nonce}:${ha2}`);

  let h = `Digest username="${username}", realm="${parts.realm}", nonce="${parts.nonce}", uri="${uri}", response="${response}"`;
  if (parts.opaque) h += `, opaque="${parts.opaque}"`;
  if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return h;
}

/**
 * GET a CGI endpoint with HTTP Digest auth (Dahua/CP Plus require digest).
 * Resolves { status, headers, body:Buffer }.
 */
export function cgiRequest(site, camera, uri, { method = 'GET', timeout = 8000 } = {}) {
  const rec = site.recorder ?? {};
  const host = camera?.host ?? rec.host;
  const port = rec.httpPort ?? 80;

  const send = (authHeader, isRetry) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host, port, path: uri, method, timeout, headers: authHeader ? { Authorization: authHeader } : {} },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks);
            if (res.statusCode === 401 && !isRetry && res.headers['www-authenticate']) {
              const header = digestHeader({
                username: rec.username,
                password: rec.password ?? '',
                method,
                uri,
                wwwAuth: res.headers['www-authenticate'],
              });
              resolve(send(header, true));
              return;
            }
            resolve({ status: res.statusCode, headers: res.headers, body });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`CGI timeout after ${timeout}ms`)));
      req.on('error', reject);
      req.end();
    });

  return send(null, false);
}

/** JPEG snapshot straight off the recorder - cheap enough to poll for previews. */
export async function snapshot(site, camera) {
  const res = await cgiRequest(site, camera, `/cgi-bin/snapshot.cgi?channel=${camera.channel}`);
  if (res.status !== 200) throw new Error(`snapshot failed: HTTP ${res.status}`);
  return res.body;
}

const PTZ_CODES = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  upleft: 'LeftUp', upright: 'RightUp', downleft: 'LeftDown', downright: 'RightDown',
  zoomin: 'ZoomTele', zoomout: 'ZoomWide',
};

/** action: 'start' | 'stop'; direction: key of PTZ_CODES; speed 1-8 */
export async function ptz(site, camera, { action, direction, speed = 4 }) {
  const code = PTZ_CODES[String(direction).toLowerCase()];
  if (!code) throw new Error(`unknown PTZ direction: ${direction}`);
  const uri =
    `/cgi-bin/ptz.cgi?action=${action}&channel=${camera.channel}` +
    `&code=${code}&arg1=0&arg2=${speed}&arg3=0`;
  const res = await cgiRequest(site, camera, uri);
  if (res.status !== 200) throw new Error(`PTZ failed: HTTP ${res.status}`);
  return res.body.toString().trim();
}

/** Go to a stored preset. */
export async function ptzPreset(site, camera, preset) {
  const uri =
    `/cgi-bin/ptz.cgi?action=start&channel=${camera.channel}` +
    `&code=GotoPreset&arg1=0&arg2=${Number(preset)}&arg3=0`;
  const res = await cgiRequest(site, camera, uri);
  if (res.status !== 200) throw new Error(`preset failed: HTTP ${res.status}`);
  return res.body.toString().trim();
}

/** Device identity - also doubles as a credentials/reachability probe. */
export async function deviceInfo(site) {
  const res = await cgiRequest(site, null, '/cgi-bin/magicBox.cgi?action=getSystemInfo');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return Object.fromEntries(
    res.body
      .toString()
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('=').map((s) => s.trim())),
  );
}
