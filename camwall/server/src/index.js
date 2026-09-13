import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { WebSocketServer } from 'ws';

import { loadConfig, ROOT } from './lib/config.js';
import { StreamManager } from './lib/streamManager.js';
import { Monitor } from './lib/monitor.js';
import { apiRouter } from './routes/api.js';
import { verifyToken } from './lib/auth.js';

const config = loadConfig();
const streams = new StreamManager(config);
const monitor = new Monitor(config).start();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) =>
  res.json({ ok: true, streams: streams.list().length, cameras: config.cameras.length }),
);

app.use('/api', apiRouter({ config, streams, monitor }));

// HLS output. Segments are short-lived, so nothing here may be cached.
app.use(
  '/media',
  (req, res, next) => {
    const token = req.query.token ?? (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!verifyToken(config, token)) return res.status(401).end();
    res.set('cache-control', 'no-store');
    next();
  },
  express.static(config.server.mediaRoot, { maxAge: 0, etag: false }),
);

// Serve the built web UI when it exists, so one process covers browser,
// desktop (Electron loads this) and mobile (Expo points at it).
const webDist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const server = http.createServer(app);

// Push stream + health state instead of having every client poll.
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  if (!verifyToken(config, token)) return ws.close(4001, 'unauthorized');
  const send = (type) => (payload) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, payload }));
  };
  const onStream = send('stream');
  const onSite = send('site');
  const onCamera = send('camera');
  streams.on('status', onStream);
  monitor.on('site', onSite);
  monitor.on('camera', onCamera);
  send('snapshot')({ streams: streams.list(), ...monitor.snapshotState() });
  ws.on('close', () => {
    streams.off('status', onStream);
    monitor.off('site', onSite);
    monitor.off('camera', onCamera);
  });
});

server.listen(config.server.port, () => {
  console.log(`CamWall server on http://localhost:${config.server.port}`);
  console.log(`  config : ${config.file}`);
  console.log(`  sites  : ${config.sites.length}  cameras: ${config.cameras.length}`);
  if (fs.existsSync(webDist)) console.log('  web UI : served from web/dist');
});

let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nshutting down...');
    monitor.stop();
    streams.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
