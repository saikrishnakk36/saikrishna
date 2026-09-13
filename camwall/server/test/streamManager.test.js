/**
 * Integration test for the stream lifecycle: spawn -> live -> idle teardown.
 *
 * Uses a synthetic ffmpeg source so it needs no camera, but exercises the real
 * ffmpeg invocation, the real HLS output and the real lease sweeper.
 *
 *   node --test server/test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StreamManager } from '../src/lib/streamManager.js';

const CAMERA = {
  id: 'test:1',
  siteId: 'test',
  channel: 1,
  name: 'Test pattern',
  source: 'testsrc=size=320x240:rate=15',
  sourceFormat: 'lavfi',
};

function makeConfig(overrides = {}) {
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'camwall-test-'));
  return {
    server: {
      mediaRoot,
      idleTimeout: 1,
      maxConcurrentStreams: 4,
      ...overrides,
    },
    site: () => ({ id: 'test', recorder: {} }),
    camera: () => CAMERA,
    cameras: [CAMERA],
  };
}

const waitFor = async (predicate, timeoutMs = 25_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timed out waiting for condition');
};

test('a stream starts, goes live and writes a playable HLS playlist', async (t) => {
  const config = makeConfig();
  const streams = new StreamManager(config);
  t.after(() => streams.shutdown());

  const info = await streams.acquire(CAMERA, 'sub', 'viewer-1');
  assert.equal(info.cameraId, 'test:1');
  assert.equal(info.viewers, 1);
  assert.equal(info.playlist, '/media/test:1__sub/index.m3u8');

  const live = await waitFor(() => {
    const s = streams.list()[0];
    return s?.status === 'live' ? s : null;
  });
  assert.equal(live.status, 'live');

  const playlist = fs.readFileSync(
    path.join(config.server.mediaRoot, 'test:1__sub', 'index.m3u8'),
    'utf8',
  );
  assert.match(playlist, /#EXTM3U/);
  assert.match(playlist, /\.ts/);
  // A live playlist must not be terminated, or players stop at the first segment.
  assert.ok(!playlist.includes('#EXT-X-ENDLIST'));
});

test('the last viewer leaving tears the stream down', async (t) => {
  const config = makeConfig();
  const streams = new StreamManager(config);
  t.after(() => streams.shutdown());

  await streams.acquire(CAMERA, 'sub', 'viewer-1');
  await waitFor(() => streams.list()[0]?.status === 'live');

  streams.release('test:1', 'sub', 'viewer-1');
  await waitFor(() => streams.list().length === 0);

  assert.equal(streams.list().length, 0);
  assert.ok(!fs.existsSync(path.join(config.server.mediaRoot, 'test:1__sub')));
});

test('two viewers share one ffmpeg process', async (t) => {
  const config = makeConfig();
  const streams = new StreamManager(config);
  t.after(() => streams.shutdown());

  await streams.acquire(CAMERA, 'sub', 'viewer-1');
  const second = await streams.acquire(CAMERA, 'sub', 'viewer-2');

  assert.equal(streams.list().length, 1);
  assert.equal(second.viewers, 2);

  // One viewer leaving must not disturb the other.
  streams.release('test:1', 'sub', 'viewer-1');
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal(streams.list().length, 1);
});

test('the concurrent stream limit is enforced', async (t) => {
  const config = makeConfig({ maxConcurrentStreams: 1 });
  const streams = new StreamManager(config);
  t.after(() => streams.shutdown());

  await streams.acquire(CAMERA, 'sub', 'viewer-1');
  await waitFor(() => streams.list()[0]?.status === 'live');

  const other = { ...CAMERA, id: 'test:2', channel: 2 };
  await assert.rejects(() => streams.acquire(other, 'sub', 'viewer-2'), /Stream limit reached/);
});

test('renewing a lease keeps an otherwise idle stream alive', async (t) => {
  const config = makeConfig();
  const streams = new StreamManager(config);
  t.after(() => streams.shutdown());

  await streams.acquire(CAMERA, 'sub', 'viewer-1');
  await waitFor(() => streams.list()[0]?.status === 'live');

  for (let i = 0; i < 4; i += 1) {
    assert.equal(streams.renew('test:1', 'sub', 'viewer-1'), true);
    await new Promise((r) => setTimeout(r, 700));
  }
  assert.equal(streams.list().length, 1);
});
