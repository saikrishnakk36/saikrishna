import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'camwall.session';

export const state = { base: '', token: null, user: null };

export async function restore() {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
    if (saved) Object.assign(state, saved);
  } catch { /* ignore corrupt storage */ }
  return state;
}

async function persist() {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${state.base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    await logout();
    throw Object.assign(new Error('Session expired'), { status: 401 });
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function login(base, username, password) {
  state.base = base.replace(/\/$/, '');
  const res = await fetch(`${state.base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Invalid credentials or server unreachable');
  const data = await res.json();
  state.token = data.token;
  state.user = data.user;
  await persist();
  return data.user;
}

export async function logout() {
  state.token = null;
  state.user = null;
  await persist();
}

export const getSites = () => request('/api/sites');
export const getCameras = () => request('/api/cameras');

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

export const mediaUrl = (playlist) =>
  `${state.base}${playlist}?token=${encodeURIComponent(state.token)}`;

export const snapshotUrl = (cameraId) =>
  `${state.base}/api/cameras/${encodeURIComponent(cameraId)}/snapshot?token=${encodeURIComponent(state.token)}&t=${Date.now()}`;
