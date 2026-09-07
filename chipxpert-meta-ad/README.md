# ChipXpert Meta Ads video kit

Lead-generation video ad for ChipXpert (VLSI training, Hyderabad and Bengaluru),
built for Meta Reels / Stories / Feed, plus the full campaign content kit.

- **Read first:** [`CONTENT-KIT.md`](CONTENT-KIT.md) — strategy, scripts (motion-graphic and
  college-girl presenter versions), shot list, ad copy, targeting, lead form, follow-up
  sequence, funnel numbers, 14-day test plan, claims checklist.
- **Ready to upload:** `output/chipxpert_meta_ad_9x16.mp4` (1080×1920, ~23 s, H.264 + AAC,
  voiceover + music), `output/chipxpert_meta_ad_4x5.mp4` (Feed crop),
  `output/chipxpert_endcard_9x16.mp4` (branded close for the presenter version),
  `output/chipxpert_meta_ad_9x16.srt` (captions).
- **Voice options:** `output/voiceover_af_heart.mp3` (default), `voiceover_hf_beta.mp3`
  (Indian-accented), `voiceover_bf_emma.mp3` (British). Per-line MP3s are alongside for editors.

## Regenerate the video

```bash
pip install kokoro-onnx soundfile numpy imageio-ffmpeg
npm i -g playwright && npx playwright install chromium     # or point render.mjs at an existing install
mkdir -p models && cd models
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
cd ../video && VOICE=af_heart ./build.sh
```

`render.mjs` imports Playwright from `/opt/node22/lib/node_modules/playwright`; change that
path to a local install if needed.

## Edit the ad

- Text and timing: `video/index.html`. Scene text lives in the HTML; enter/exit timings are in
  the `seek()` function and are relative to each voiceover line's start, so the visuals stay in
  sync if you change the voice or speed.
- Script: `video/tts.py` (`LINES`). Keep it under ~60 words for a 20–23 s ad.
- Logo: drop the original PNG at `assets/logo.png` (transparent, 2000 px wide). The page uses
  it automatically and falls back to the SVG recreation in `assets/logo.svg`.
- Preview in a browser: open `video/index.html?play`.

Everything here is generated locally: the voice is Kokoro (Apache-2.0), the music bed is
synthesized in `video/music.py`, fonts are Google Fonts (OFL). No stock or licensed media.
