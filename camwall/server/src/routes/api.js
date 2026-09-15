import express from 'express';
import { login, requireAuth, canSee, visibleCameras } from '../lib/auth.js';
import { snapshot, ptz, ptzPreset, safeRtspUrl } from '../lib/cpplus.js';
import { remoteCameras, remoteFetch } from '../lib/federation.js';

export function apiRouter({ config, streams, monitor }) {
  const router = express.Router();
  const auth = requireAuth(config);

  // ---- auth -------------------------------------------------------------
  router.post('/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const result = login(config, username, password);
    if (!result) return res.status(401).json({ error: 'invalid credentials' });
    res.json(result);
  });

  router.get('/me', auth, (req, res) => res.json(req.user));

  // ---- inventory --------------------------------------------------------
  router.get('/sites', auth, (req, res) => {
    const state = monitor.snapshotState();
    res.json(
      config.sites
        .filter((s) => canSee(req.user, s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind ?? 'direct',
          timezone: s.timezone ?? null,
          cameraCount: config.cameras.filter((c) => c.siteId === s.id && c.enabled).length,
          // A campus with several DVRs reports each one, so a single dead
          // recorder is visible instead of hidden behind its siblings.
          recorders: s.recorders.map((r) => ({
            id: r.id,
            name: r.name,
            cameraCount: r.cameras.filter((c) => c.enabled !== false).length,
            health: state.recorders[`${s.id}:${r.id}`] ?? { online: null },
          })),
          health: monitor.siteHealth(s.id),
        })),
    );
  });

  router.get('/cameras', auth, async (req, res) => {
    const state = monitor.snapshotState();
    const local = visibleCameras(config, req.user).map((c) => ({
      id: c.id,
      siteId: c.siteId,
      siteName: c.siteName,
      recorderId: c.recorderId,
      recorderName: c.recorderName,
      channel: c.channel,
      name: c.name,
      ptz: c.ptz,
      audio: c.audio,
      health: state.cameras[c.id] ?? { online: null },
    }));

    // Federated branches are best-effort: one unreachable branch must not take
    // down the whole wall.
    const remotes = config.sites.filter((s) => s.kind === 'remote' && canSee(req.user, s.id));
    const fetched = await Promise.allSettled(remotes.map((s) => remoteCameras(s)));
    const remoteCams = fetched.flatMap((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : [{ id: `${remotes[i].id}:unreachable`, siteId: remotes[i].id, siteName: remotes[i].name,
             name: `${remotes[i].name} unreachable`, unreachable: true,
             health: { online: false, error: r.reason?.message } }],
    );

    res.json([...local, ...remoteCams]);
  });

  // ---- streaming --------------------------------------------------------
  const quality = (req) => (req.query.quality === 'main' ? 'main' : 'sub');

  router.post('/streams/:cameraId/start', auth, async (req, res) => {
    const cam = config.camera(req.params.cameraId);
    if (!cam || !canSee(req.user, cam.siteId)) return res.status(404).json({ error: 'camera not found' });
    try {
      const viewerId = req.body?.viewerId ?? req.ip;
      res.json(await streams.acquire(cam, quality(req), viewerId));
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  });

  // One heartbeat for every tile on screen, rather than N requests.
  router.post('/streams/heartbeat', auth, (req, res) => {
    const { viewerId, tiles = [] } = req.body ?? {};
    const missing = tiles.filter((t) => !streams.renew(t.cameraId, t.quality ?? 'sub', viewerId));
    res.json({ ok: true, missing });
  });

  router.post('/streams/:cameraId/stop', auth, (req, res) => {
    streams.release(req.params.cameraId, quality(req), req.body?.viewerId ?? req.ip);
    res.json({ ok: true });
  });

  router.get('/streams', auth, (req, res) => res.json(streams.list()));

  // ---- stills -----------------------------------------------------------
  router.get('/cameras/:cameraId/snapshot', auth, async (req, res) => {
    const cam = config.camera(req.params.cameraId);
    if (!cam || !canSee(req.user, cam.siteId)) return res.status(404).json({ error: 'camera not found' });
    try {
      const jpeg = await snapshot(config.recorderFor(cam), cam);
      res.set('content-type', 'image/jpeg').set('cache-control', 'no-store').send(jpeg);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // ---- PTZ --------------------------------------------------------------
  router.post('/cameras/:cameraId/ptz', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'PTZ requires the admin role' });
    const cam = config.camera(req.params.cameraId);
    if (!cam || !canSee(req.user, cam.siteId)) return res.status(404).json({ error: 'camera not found' });
    const rec = config.recorderFor(cam);
    try {
      const { preset, direction, action = 'start', speed } = req.body ?? {};
      const out = preset != null
        ? await ptzPreset(rec, cam, preset)
        : await ptz(rec, cam, { action, direction, speed });
      res.json({ ok: true, response: out });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // ---- diagnostics ------------------------------------------------------
  router.get('/diagnostics', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
    const state = monitor.snapshotState();
    res.json({
      configFile: config.file,
      streams: streams.list(),
      limits: {
        maxConcurrentStreams: config.server.maxConcurrentStreams,
        idleTimeout: config.server.idleTimeout,
      },
      recorders: state.recorders,
      cameras: visibleCameras(config, req.user).map((c) => ({
        id: c.id,
        name: c.name,
        recorder: `${c.siteId}/${c.recorderId}`,
        rtsp: safeRtspUrl(config.recorderFor(c), c, 'sub'),
        health: state.cameras[c.id] ?? { online: null },
      })),
    });
  });

  // ---- federated media proxy -------------------------------------------
  // /api/federated/<siteId>/<remoteCameraId>/... -> branch server's /media
  router.all('/federated/:siteId/*', auth, async (req, res) => {
    const site = config.site(req.params.siteId);
    if (!site || site.kind !== 'remote' || !canSee(req.user, site.id)) {
      return res.status(404).json({ error: 'site not found' });
    }
    try {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const upstream = await remoteFetch(site, `/${req.params[0]}${qs}`, {
        method: req.method,
        headers: req.method === 'POST' ? { 'content-type': 'application/json' } : {},
        body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
      });
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      if (ct) res.set('content-type', ct);
      res.set('cache-control', 'no-store');
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  return router;
}
