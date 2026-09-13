# CamWall

Every camera, every location, on one screen — web, desktop and mobile, from one
server. Built for CP Plus (Dahua OEM) recorders and cameras, with Hikvision and
generic RTSP supported through the same config.

```
CP Plus NVR (Madhapur) ─┐
CP Plus NVR (Bellandur) ─┼─ RTSP ─▶ CamWall server ─ HLS ─▶ browser / Electron / mobile
Branch CamWall (Penang) ─┘          (Node + ffmpeg)
```

## Why it is built this way

| Decision | Reason |
|---|---|
| Server-side RTSP → HLS | Browsers cannot play RTSP. One transcode feeds every client. |
| Sub stream in the grid, main stream fullscreen | 16 sub streams cost what 2 main streams cost. This is what makes a 40-camera wall viable. |
| On-demand streams with viewer leases | ffmpeg runs only for tiles actually on screen. Close a tab, the load goes away. |
| Copy mode by default | H.264 sub streams are remuxed, not re-encoded — near-zero CPU. Only H.265 is transcoded. |
| One shared React UI | Browser, Electron and the API all serve the same build. One codebase, three surfaces. |

## Quick start

```bash
npm install
cp config/cameras.example.yaml config/cameras.yaml   # then edit it
npm -w server run hash -- 'your-password'            # paste into cameras.yaml
npm run dev                                          # server :8080, web :5173
npm test                                             # stream + protocol tests
```

ffmpeg and ffprobe must be on PATH (`apt install ffmpeg`, `brew install ffmpeg`,
or gyan.dev on Windows). Override with `FFMPEG_PATH` / `FFPROBE_PATH`.

### Production

```bash
cp .env.example .env && edit .env
docker compose up -d --build
```

The container ships ffmpeg and writes HLS to a tmpfs. Put nginx or Caddy in
front for TLS — never expose CamWall to the internet over plain HTTP.

### Desktop app

```bash
npm run build           # build the web UI first
npm run desktop         # run it
npm run desktop:dist    # package .exe / .dmg / AppImage
```

At sign-in the desktop app asks for the server address, so one build works for
every site. `CAMWALL_DEV_URL=http://localhost:5173 npm run desktop` for live reload.

### Mobile app

```bash
cd mobile && npm install && npx expo start
```

Scan the QR with Expo Go, enter the server URL and sign in. For a store build
or a sideloadable APK, use `eas build`.

## Configuration

Everything lives in `config/cameras.yaml` (gitignored — the example file is the
schema). Passwords should come from the environment:

```yaml
recorder:
  host: 10.20.1.10
  username: admin
  password: ${ENV:CAMWALL_HYD_PASS}
  vendor: cpplus
```

Camera ids are `<siteId>:<channel>`, so renaming a camera never breaks layouts,
bookmarks or ACLs.

**Users and roles.** `viewer` can watch; `admin` additionally gets PTZ and
`/api/diagnostics`. A user can be pinned to specific sites with `sites: [...]`,
which is enforced server-side on every endpoint, not just hidden in the UI.

## Connecting your sites

Each office is behind its own ISP router, so the server has to reach the
recorders somehow. In order of preference:

1. **WireGuard hub (recommended).** One small VPS runs CamWall and the WireGuard
   hub; every NVR site runs a WireGuard client (on a Raspberry Pi, the site
   router, or a spare desktop). Recorders then look like LAN devices to the
   server. Nothing is exposed publicly.
2. **Federation.** Run a CamWall server at the branch and add it as a
   `kind: remote` site. The hub proxies only the streams someone is watching, so
   a slow or metered link carries one copy of what's on screen instead of every
   camera. This is the right answer for Penang.
3. **Port forwarding.** Works, and puts your recorders on Shodan within a day.
   Don't — CP Plus/Dahua firmware has a long CVE history.

### Bandwidth per site

A CP Plus sub stream is roughly 0.5–1 Mbps. Central pull costs
`cameras × 1 Mbps` **upstream from each site, continuously** — 16 cameras needs
~16 Mbps up, which most Indian broadband links do not have. Federation instead
costs `tiles on screen × 1 Mbps`, only while someone is watching. Check the
upload figure for each office before choosing option 1 over option 2.

### Server sizing

- Copy mode (H.264): ~4 streams per core. A 4-core VPS handles ~30 tiles.
- Transcode (H.265 → H.264): ~1 stream per core. Reconfigure the recorder's sub
  stream to H.264 instead — it is free and costs nothing in quality at CIF/D1.
- Raise `maxConcurrentStreams` only after watching real CPU under load.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/login` | Exchange credentials for a JWT |
| GET | `/api/sites`, `/api/cameras` | Inventory with live health |
| POST | `/api/streams/:id/start` | Acquire a stream lease, get the HLS playlist |
| POST | `/api/streams/heartbeat` | Renew every on-screen lease in one call |
| POST | `/api/streams/:id/stop` | Release a lease |
| GET | `/api/cameras/:id/snapshot` | JPEG still, straight off the recorder |
| POST | `/api/cameras/:id/ptz` | PTZ move/zoom/preset (admin) |
| GET | `/api/diagnostics` | Streams, health, masked RTSP URLs (admin) |
| WS | `/ws` | Live stream and health events |

## Keyboard (web and desktop)

`1`–`6` layout · `←` `→` page · `f` fullscreen · `r` auto-rotate ·
double-click a tile for the HD view · `Esc` back.

## Security notes

- Set `CAMWALL_JWT_SECRET`. The server refuses to start in production without it.
- Recorder passwords never reach the client; only the server speaks RTSP.
- `/media` playlists and segments require a valid token.
- Give CamWall a dedicated, read-only recorder account, not the `admin` one.
- Keep the whole thing behind the VPN. It is a camera wall, not a public site.

## Not built yet

Recording and playback of recorder archives (the Dahua `loadfile` RTSP path
makes this straightforward), motion-event alerts, and multi-monitor layouts for
the desktop shell. See `docs/ROADMAP.md`.
