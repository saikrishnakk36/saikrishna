# Operations

## Recorder setup (do this once per site)

On each CP Plus NVR/DVR, before pointing CamWall at it:

1. **Create a dedicated user.** Main Menu → Account → Add User. Give it live
   view + playback, nothing else. Do not hand CamWall the `admin` account.
2. **Configure the sub stream.** Main Menu → Camera → Encode → Sub Stream:
   - Codec **H.264** (not H.265 — it would force a CPU transcode per tile)
   - Resolution D1 or CIF
   - Frame rate 10–15 fps
   - Bit rate 384–512 kbps, CBR
   This is the single biggest lever on how many tiles a server can carry.
3. **Check the RTSP port.** Main Menu → Network → Port. Default 554.
4. **Set the time zone and enable NTP**, or snapshot and event timestamps will
   not line up across sites.

## Verifying a camera by hand

```bash
ffprobe -rtsp_transport tcp \
  "rtsp://user:pass@10.20.1.10:554/cam/realmonitor?channel=1&subtype=1"
```

Expect `Video: h264 ... 704x576`. If it hangs, the usual causes are a blocked
554, a wrong channel number (CP Plus channels are 1-based), or the recorder's
RTSP session cap already being reached by another client.

## Common failures

| Symptom | Cause |
|---|---|
| `ffmpeg not found` | ffmpeg is not on PATH. Install it or set `FFMPEG_PATH`. |
| Tile shows `401 Unauthorized` | Wrong recorder credentials, or the env var holding the password is unset. |
| `Stream limit reached` | More tiles than `maxConcurrentStreams`. Raise it only if CPU allows. |
| Tile marked `transcoding` | Sub stream is H.265. Switch it to H.264 on the recorder. |
| Everything stalls after ~4 tiles | The recorder's own RTSP connection limit. Older CP Plus boxes cap at 8–16 concurrent sessions across all clients. |
| Tile goes `stalled` | Recorder dropped the session, or the site link is saturated. Check `/api/diagnostics`. |

## Watching load

```bash
curl -s localhost:8080/api/diagnostics -H "authorization: Bearer $TOKEN" | jq
```

Shows every running stream, its mode (`copy` vs `transcode`), viewer count and
restart count. A stream with a climbing restart count is a flapping camera or a
saturated link — not a CamWall bug.

`restarts` climbing across *all* cameras at one site points at the link or the
recorder, not the cameras.

## Backups

The only stateful things are `config/cameras.yaml` and your `.env`. Both should
live in a password manager or an encrypted repo — they hold recorder
credentials. `media/` is disposable by design.
