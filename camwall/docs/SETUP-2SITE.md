# Setup: Hyderabad + Bengaluru (6 cameras)

The concrete path for two CP Plus DVRs, three cameras each, one central server.
Start with `config/cameras.2site-6cam.yaml`.

At this size both sites pull centrally — roughly 3 Mbps sustained upload each,
which any fibre line carries. Federation is not needed until a site's upload
can no longer sustain `cameras x 1 Mbps`.

## What you need before starting

Per site: the DVR's LAN IP, an admin login to create a user, the router's admin
page, and a note of what each of the three channels actually sees.

## 1. Server

Any 2 vCPU / 4 GB VPS in a Mumbai region, or a spare always-on office machine.
Keep it in India — Hyderabad↔Bengaluru RTSP over a domestic hop is a few ms.

```bash
git clone <repo> && cd camwall
cp config/cameras.2site-6cam.yaml config/cameras.yaml
cp .env.example .env
openssl rand -hex 32          # paste as CAMWALL_JWT_SECRET in .env
```

Add the two DVR passwords to `.env` as `CAMWALL_HYD_PASS` and
`CAMWALL_BLR_PASS`, then generate the login hashes:

```bash
npm install
npm -w server run hash -- 'your-admin-password'
npm -w server run hash -- 'your-viewer-password'
```

Paste each into the matching `passwordHash` in `config/cameras.yaml`.

## 2. Network: WireGuard hub

The server has to reach both DVRs. One hub on the VPS, one client per site.

On the VPS:

```bash
apt install wireguard
wg genkey | tee server.key | wg pubkey > server.pub
```

`/etc/wireguard/wg0.conf` on the hub:

```ini
[Interface]
Address = 10.99.0.1/24
ListenPort = 51820
PrivateKey = <server.key>

[Peer]                      # Hyderabad
PublicKey = <hyd client pubkey>
AllowedIPs = 10.99.0.2/32, 10.20.1.0/24

[Peer]                      # Bengaluru
PublicKey = <blr client pubkey>
AllowedIPs = 10.99.0.3/32, 10.30.1.0/24
```

At each site, a Raspberry Pi (or the router, if it runs OpenWRT/MikroTik) on
the same LAN as the DVR:

```ini
[Interface]
Address = 10.99.0.2/24       # .3 for Bengaluru
PrivateKey = <site key>

[Peer]
PublicKey = <server.pub>
Endpoint = <vps-ip>:51820
AllowedIPs = 10.99.0.0/24
PersistentKeepalive = 25
```

Enable IP forwarding on the site client so it routes to the DVR's subnet:

```bash
sysctl -w net.ipv4.ip_forward=1
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

Verify from the VPS before going further:

```bash
ping 10.20.1.10        # Hyderabad DVR
ping 10.30.1.10        # Bengaluru DVR
```

Both must answer. Nothing else works until they do.

## 3. Prepare each DVR

On the DVR itself (monitor + mouse, or its web UI):

1. **Account → Add User** — username `camwall`, live view + playback only.
2. **Camera → Encode → Sub Stream**, for all three channels:
   codec **H.264**, D1 or CIF, 10–15 fps, 384–512 kbps CBR.
   H.265 here forces a per-tile CPU transcode for no visible gain at CIF.
3. **Network → Port** — confirm RTSP is 554.
4. **System → General** — timezone Asia/Kolkata, NTP enabled.

Then prove one channel works, from the server:

```bash
ffprobe -rtsp_transport tcp \
  "rtsp://camwall:PASS@10.20.1.10:554/cam/realmonitor?channel=1&subtype=1"
```

Expect `Video: h264 ... 704x576`. A hang means a blocked 554, a wrong channel
number (CP Plus channels are 1-based), or the DVR's RTSP session cap already
being used by another client — older CP Plus DVRs allow only 8–16 at once
across all clients.

## 4. Fill in the config and start

Replace every `<<< ... >>>` marker in `config/cameras.yaml` with the real DVR
IPs and camera names, then:

```bash
docker compose up -d --build
curl localhost:8080/healthz          # expect {"ok":true,...,"cameras":6}
```

Put Caddy or nginx in front for TLS before anyone outside the VPN uses it.

## 5. Clients

- **Browser** — the server URL, sign in. Nothing to install.
- **Desktop** — `npm run desktop:dist`, install the .exe/.dmg; enter the server
  address at sign-in.
- **Mobile** — `cd mobile && npx expo start` with Expo Go, or `eas build` for a
  real APK.
- **Reception screen** — desktop app, F11, then `r` to auto-rotate pages.

With six cameras the `6` layout shows every camera at both sites on one screen
with nothing paged off.

## Order of work

Do Hyderabad alone first — VPN, DVR prep, config, confirm three live tiles.
Only then add Bengaluru. Bringing both up together means a failure could be the
VPN, the credentials, the codec or the DVR, and you won't know which.

## When something fails

`docs/OPERATIONS.md` has the full failure table. The three you are most likely
to hit here:

| Symptom | Cause |
|---|---|
| Tile shows `401` | Wrong DVR credentials, or the env var is unset |
| Tile marked `transcoding` | Sub stream is still H.265 — fix it on the DVR |
| Everything stalls past a few tiles | DVR's own RTSP session cap, not CamWall |
