/**
 * API client. `base` is empty in the browser (same origin / vite proxy) and a
 * full URL in Electron and on mobile, where the UI is not served by the API.
 */
const STORAGE_KEY = 'camwall.session';

export const state = {
  base: localStorage.getItem('camwall.base') ?? '',
  token: null,
  user: null,
};

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  if (saved) Object.assign(state, saved);
} catch { /* corrupt storage - start logged out */ }

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user }));
  localStorage.setItem('camwall.base', state.base);
}

export function setBase(base) {
  state.base = base.replace(/\/$/, '');
  persist();
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${state.base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    logout();
    throw new ApiError('session expired', 401);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new ApiError(detail.error ?? `HTTP ${res.status}`, res.status);
  }
  return raw ? res : res.json();
}

export async function login(username, password) {
  const res = await fetch(`${state.base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new ApiError('Invalid username or password', res.status);
  const data = await res.json();
  state.token = data.token;
  state.user = data.user;
  persist();
  return data.user;
}

export function logout() {
  state.token = null;
  state.user = null;
  persist();
}

export const isLoggedIn = () => Boolean(state.token);

export const getSites = () => request('/api/sites');
export const getCameras = () => request('/api/cameras');
export const getStreams = () => request('/api/streams');
export const getDiagnostics = () => request('/api/diagnostics');

export const startStream = (cameraId, quality, viewerId) =>
  request(`/api/streams/${encodeURIComponent(cameraId)}/start?quality=${quality}`, {
    method: 'POST',
    body: { viewerId },
  });

export const stopStream = (cameraId, quality, viewerId) =>
  request(`/api/streams/${encodeURIComponent(cameraId)}/stop?quality=${quality}`, {
    method: 'POST',
    body: { viewerId },
  });

export const heartbeat = (viewerId, tiles) =>
  request('/api/streams/heartbeat', { method: 'POST', body: { viewerId, tiles } });

export const ptz = (cameraId, payload) =>
  request(`/api/cameras/${encodeURIComponent(cameraId)}/ptz`, { method: 'POST', body: payload });

/** Media and snapshot URLs carry the token in the query - <video>/<img> cannot set headers. */
export const mediaUrl = (playlist) =>
  `${state.base}${playlist}?token=${encodeURIComponent(state.token)}`;

export const snapshotUrl = (cameraId, bust = Date.now()) =>
  `${state.base}/api/cameras/${encodeURIComponent(cameraId)}/snapshot?token=${encodeURIComponent(state.token)}&t=${bust}`;

/** Live status feed: stream state changes and camera/site health. */
export function connectEvents(onMessage) {
  const wsBase = (state.base || location.origin).replace(/^http/, 'ws');
  let ws;
  let closed = false;
  let retry = 0;

  const open = () => {
    ws = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(state.token)}`);
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
    };
    ws.onopen = () => { retry = 0; };
    ws.onclose = () => {
      if (closed) return;
      retry += 1;
      setTimeout(open, Math.min(1000 * 2 ** retry, 15_000));
    };
  };
  open();

  return () => { closed = true; ws?.close(); };
}
