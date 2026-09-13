# Roadmap

Ordered by how much each one is worth relative to the work involved.

## 1. Playback of recorder archives
CP Plus/Dahua expose recorded footage over RTSP:

```
rtsp://user:pass@host:554/cam/playback?channel=1&starttime=2026_09_13_10_00_00&endtime=2026_09_13_10_15_00
```

The existing StreamManager already does RTSP → HLS; playback mostly needs a
timeline UI and a variant of `acquire()` that takes a time range instead of a
quality. Query available recordings with
`/cgi-bin/mediaFileFind.cgi`. This is the single most requested feature once a
live wall exists — "show me the gate at 9:40pm yesterday".

## 2. Latency: HLS → WebRTC
HLS with 1-second segments lands at roughly 3–6 seconds of latency. Fine for
monitoring, irritating for PTZ. WebRTC (go2rtc or mediamtx as a sidecar, or
`webrtc-streamer`) gets that under a second. Worth doing when PTZ becomes a
daily-use feature rather than an occasional one.

## 3. Motion and event alerts
Dahua pushes events over a long-lived HTTP connection:

```
/cgi-bin/eventManager.cgi?action=attach&codes=[VideoMotion,VideoLoss,AlarmLocal]
```

Attach once per site, fan events out over the existing WebSocket, and the wall
can auto-focus a tile on motion. Pair with push notifications on mobile.

## 4. Recording to the server
For sites without an NVR, or for keeping a cloud copy: a second ffmpeg output
writing segmented MP4 with a retention sweeper. Storage is the real constraint —
one camera at 2 Mbps is ~21 GB/day.

## 5. Multi-monitor desktop layouts
Electron can drive a second and third display as separate BrowserWindows, each
pinned to a saved layout. This is the control-room feature that justifies the
desktop app over the browser.

## 6. Operational hardening
- Per-user saved layouts stored server-side rather than in localStorage
- Audit log of who watched what and when (matters for any client audit)
- Prometheus `/metrics` for stream count, restarts and ffmpeg CPU
- ONVIF discovery to auto-populate `cameras.yaml` from a site scan
