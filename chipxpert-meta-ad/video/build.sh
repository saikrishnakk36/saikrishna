#!/usr/bin/env bash
# One-shot build: voiceover -> music -> mix -> frames -> MP4s.
#   VOICE=af_heart ./build.sh        (voices: af_heart default, hf_beta Indian-accent, bf_emma British)
set -euo pipefail
cd "$(dirname "$0")"
VOICE="${VOICE:-af_heart}"
FFMPEG="${FFMPEG:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}"
export FFMPEG
OUT=../output; mkdir -p "$OUT"

echo "== voiceover ($VOICE)"; python3 tts.py --voice "$VOICE"
DUR=$(python3 -c "import json; print(round(json.load(open('$OUT/timeline_$VOICE.json'))['duration']+1.1, 3))")
echo "== music bed ${DUR}s";  python3 music.py --duration "$DUR" --duck "$OUT/timeline_$VOICE.json" --out "$OUT/music_bed.wav"
echo "== mix";                python3 mix.py --vo "$OUT/voiceover_$VOICE.wav" --music "$OUT/music_bed.wav" --out "$OUT/mix_$VOICE.wav" --duration "$DUR"
echo "== frames";             rm -rf "$OUT/frames"; node render.mjs --timeline "$OUT/timeline_$VOICE.json" --frames "$OUT/frames" --fps 30

echo "== encode 9:16"
"$FFMPEG" -y -loglevel error -framerate 30 -i "$OUT/frames/f%05d.png" -i "$OUT/mix_$VOICE.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 192k -movflags +faststart -shortest \
  "$OUT/chipxpert_meta_ad_9x16.mp4"

echo "== encode 4:5 (centre crop for Feed)"
"$FFMPEG" -y -loglevel error -i "$OUT/chipxpert_meta_ad_9x16.mp4" -vf "crop=1080:1350:0:285" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT/chipxpert_meta_ad_4x5.mp4"

echo "== end card (append to presenter footage)"
CTA=$(python3 -c "import json; d=json.load(open('$OUT/timeline_$VOICE.json')); print(round([L for L in d['lines'] if L['id']=='cta'][0]['start']-0.12, 3))")
"$FFMPEG" -y -loglevel error -ss "$CTA" -i "$OUT/chipxpert_meta_ad_9x16.mp4" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$OUT/chipxpert_endcard_9x16.mp4"

cp "$OUT/chipxpert_meta_ad_9x16_$VOICE.srt" "$OUT/chipxpert_meta_ad_9x16.srt"
rm -rf "$OUT/frames"
echo "== done"; ls -la "$OUT"/*.mp4
