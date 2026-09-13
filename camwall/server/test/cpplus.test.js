import test from 'node:test';
import assert from 'node:assert/strict';
import { rtspUrl, safeRtspUrl } from '../src/lib/cpplus.js';
import { login, canSee } from '../src/lib/auth.js';
import bcrypt from 'bcryptjs';

const site = {
  id: 's1',
  recorder: { host: '10.0.0.5', rtspPort: 554, username: 'admin', password: 'p@ss word', vendor: 'cpplus' },
};
const camera = { channel: 3 };

test('CP Plus RTSP URLs use the Dahua realmonitor path', () => {
  assert.equal(
    rtspUrl(site, camera, 'main'),
    'rtsp://admin:p%40ss%20word@10.0.0.5:554/cam/realmonitor?channel=3&subtype=0',
  );
  // The grid must never pull the main stream.
  assert.match(rtspUrl(site, camera, 'sub'), /subtype=1$/);
});

test('credentials are URL-encoded so special characters do not break the URL', () => {
  const url = rtspUrl({ ...site, recorder: { ...site.recorder, password: 'a/b@c:d' } }, camera);
  assert.ok(url.includes('a%2Fb%40c%3Ad'));
});

test('Hikvision channels map to the Streaming path', () => {
  const hik = { ...site, recorder: { ...site.recorder, vendor: 'hikvision' } };
  assert.match(rtspUrl(hik, camera, 'main'), /\/Streaming\/Channels\/301$/);
  assert.match(rtspUrl(hik, camera, 'sub'), /\/Streaming\/Channels\/302$/);
});

test('a per-camera host override wins over the recorder host', () => {
  assert.match(rtspUrl(site, { channel: 1, host: '10.0.0.99' }), /@10\.0\.0\.99:554/);
});

test('the masked URL never leaks the password', () => {
  const masked = safeRtspUrl(site, camera);
  assert.ok(!masked.includes('p%40ss'));
  assert.match(masked, /admin:\*\*\*@/);
});

const config = {
  server: { jwtSecret: 'test-secret', sessionHours: 1 },
  users: [
    { username: 'admin', passwordHash: bcrypt.hashSync('right', 4), role: 'admin' },
    { username: 'branch', passwordHash: bcrypt.hashSync('right', 4), role: 'viewer', sites: ['s1'] },
  ],
};

test('login rejects a wrong password and an unknown user alike', () => {
  assert.equal(login(config, 'admin', 'wrong'), null);
  assert.equal(login(config, 'nobody', 'right'), null);
});

test('login issues a token carrying the role and site scope', () => {
  const result = login(config, 'branch', 'right');
  assert.equal(result.user.role, 'viewer');
  assert.deepEqual(result.user.sites, ['s1']);
  assert.ok(result.token.length > 20);
});

test('site scoping confines a user to their own sites', () => {
  const branch = login(config, 'branch', 'right').user;
  assert.equal(canSee(branch, 's1'), true);
  assert.equal(canSee(branch, 's2'), false);
  // An unrestricted user sees everything.
  assert.equal(canSee(login(config, 'admin', 'right').user, 's2'), true);
});
