/**
 * Federation: pull camera lists and streams from CamWall servers running at
 * remote branches.
 *
 * Use this when a site is behind a slow or metered link, or when you would
 * rather not extend the VPN to it. The branch server does its own transcoding;
 * this server only proxies the HLS playlist and segments, so the WAN carries
 * one copy of whatever is actually being watched.
 */
const tokens = new Map(); // siteId -> { token, expiresAt }

async function tokenFor(site) {
  const cached = tokens.get(site.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`${site.remote.baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: site.remote.username, password: site.remote.password }),
  });
  if (!res.ok) throw new Error(`federation login failed for ${site.id}: HTTP ${res.status}`);
  const { token } = await res.json();
  // Refresh well before the remote session expires.
  tokens.set(site.id, { token, expiresAt: Date.now() + 30 * 60_000 });
  return token;
}

export async function remoteFetch(site, path, init = {}) {
  const token = await tokenFor(site);
  const res = await fetch(`${site.remote.baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    tokens.delete(site.id); // stale token - force a re-login on the next call
    throw new Error(`federation auth rejected by ${site.id}`);
  }
  return res;
}

/** Remote cameras, re-namespaced so ids stay unique across the federation. */
export async function remoteCameras(site) {
  const res = await remoteFetch(site, '/api/cameras');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cams = await res.json();
  return cams.map((c) => ({
    ...c,
    id: `${site.id}:${c.id}`,
    siteId: site.id,
    siteName: site.name,
    federated: true,
    remoteId: c.id,
  }));
}
