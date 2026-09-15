# Setup: Hyderabad + Bengaluru, 3 DVRs per site

The concrete path for six CP Plus DVRs across two sites, one central server.
Start from `config/cameras.2site-6dvr.yaml`.

A site holds all of its recorders. Three DVRs at Madhapur is **one** site with
three entries under `recorders:` — not three sites. That keeps "all Hyderabad
cameras" as a single click in the UI, and gives you per-DVR health so a dead
recorder is visible instead of hidden behind its siblings.

## Before starting — collect this

Per DVR (six times):

| What | Where |
|---|---|
| LAN IP + RTSP port | DVR → Main Menu → Network |
| Channel count actually connected | The DVR's own live grid |
| What each channel sees | Walk the site once, write it down |
| Admin login | To create the CamWall user |

Per site (twice): the broadband **upload** speed, measured on the site LAN, and
admin access to the router.

### The bandwidth question

Central pull costs `cameras × ~1 Mbps` sustained upload, per site, continuously.
Count cameras, not DVRs — three 16-channel DVRs fully populated is 48 cameras
and ~48 Mbps, which most Indian business lines will not sustain.

- Comfortably under the site's upload → pull centrally (this guide).
- Near or over it → run CamWall at that site and federate it from the hub
  (`kind: remote`), so the WAN carries only tiles someone is watching.

Measure before you choose. This is the single decision that determines whether
the wall is smooth or stutters.

## 1. Server

2–4 vCPU / 4 GB in a Mumbai region, or an always-on office machine. Sizing is
driven by **simultaneous tiles**, not total cameras: copy-mode H.264 runs about
4 streams per core, and only tiles on screen run at all.

```bash
git clone <repo> && cd camwall
cp config/cameras.2site-6dvr.yaml config/cameras.yaml
cp .env.example .env
openssl rand -hex 32          # -> CAMWALL_JWT_SECRET in .env
npm install
npm -w server run hash -- 'your-admin-password'
npm -w server run hash -- 'your-viewer-password'
```

Put each hash into the matching `passwordHash`, and each DVR password into
`.env` as `CAMWALL_HYD_DVR1_PASS` … `CAMWALL_BLR_DVR3_PASS`.

## 2. Network: WireGuard hub

One hub on the server, one client per **site** — not per DVR. The site client
routes to the whole DVR subnet, so all three are reachable through it.

Hub `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address = 10.99.0.1/24
ListenPort = 51820
PrivateKey = <server key>

[Peer]                      # Hyderabad - covers all 3 DVRs
PublicKey = <hyd client pubkey>
AllowedIPs = 10.99.0.2/32, 10.20.1.0/24

[Peer]                      # Bengaluru - covers all 3 DVRs
PublicKey = <blr client pubkey>
AllowedIPs = 10.99.0.3/32, 10.30.1.0/24
```

Site client (a Raspberry Pi on the DVR LAN, or the router if it runs
OpenWRT/MikroTik):

```ini
[Interface]
Address = 10.99.0.2/24       # .3 for Bengaluru
PrivateKey = <site key>

[Peer]
PublicKey = <server pubkey>
Endpoint = <server-ip>:51820
AllowedIPs = 10.99.0.0/24
PersistentKeepalive = 25
```

Then let it route to the DVRs:

```bash
sysctl -w net.ipv4.ip_forward=1
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

**Give each DVR a static IP or a DHCP reservation.** Three DVRs on one subnet
picking up new leases after a power cut is the most common way this breaks.

Verify all six from the server before going further:

```bash
for ip in 10.20.1.11 10.20.1.12 10.20.1.13 10.30.1.11 10.30.1.12 10.30.1.13; do
  ping -c1 -W2 $ip >/dev/null && echo "$ip ok" || echo "$ip UNREACHABLE"
done
```

## 3. Prepare each DVR (six times)

1. **Account → Add User** — `camwall`, live view + playback only. Never the
   admin login.
2. **Camera → Encode → Sub Stream**, for every channel in use: **H.264**,
   D1 or CIF, 10–15 fps, 384–512 kbps CBR. H.265 forces a per-tile CPU
   transcode for no visible gain at this resolution. This setting does more for
   capacity than any server upgrade.
3. **Network → Port** — RTSP 554.
4. **System → General** — Asia/Kolkata, NTP on. Six DVRs with drifting clocks
   make cross-site timestamps useless.

Prove one channel per DVR before trusting the config:

```bash
ffprobe -rtsp_transport tcp \
  "rtsp://camwall:PASS@10.20.1.11:554/cam/realmonitor?channel=1&subtype=1"
```

Expect `Video: h264 ... 704x576`.

## 4. Fill in the config and start

Replace every `<<< ... >>>` marker, listing only channels that actually have a
camera on them. Then:

```bash
docker compose up -d --build
docker compose logs | head        # confirms sites / recorders / cameras counts
curl localhost:8080/healthz
```

Put Caddy or nginx in front for TLS before anyone outside the VPN uses it.

## 5. Check per-DVR health

```bash
curl -s localhost:8080/api/sites -H "authorization: Bearer $TOKEN" | jq
```

Each site lists its recorders with individual health, and a site rollup that is
`online: true` only when **all** of its DVRs answer. If one DVR is down you see
exactly which.

## Order of work

1. Hyderabad DVR 1 only — VPN, DVR prep, config, confirm live tiles.
2. Add DVR 2 and 3 at Hyderabad (no new VPN work; same subnet).
3. Bengaluru, same sequence.

Bringing six DVRs up at once means a failure could be VPN, credentials, codec,
IP, or session limits, and you will not know which.

## Most likely failures here

| Symptom | Cause |
|---|---|
| One DVR's cameras all show `401` | Wrong credentials for **that** DVR — check its own env var |
| One DVR unreachable, others fine | Its IP changed — set a DHCP reservation |
| Tiles marked `transcoding` | That DVR's sub stream is still H.265 |
| A DVR stalls past ~8 tiles | Its own RTSP session cap, not CamWall. Older CP Plus boxes allow 8–16 across *all* clients |
| Whole site stutters at peak | Site upload saturated — federate that site |

`docs/OPERATIONS.md` has the full table.
