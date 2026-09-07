#!/usr/bin/env python3
"""Generate the ChipXpert ad voiceover with Kokoro (offline neural TTS).

Outputs into output/:
  voiceover_<voice>.wav        full VO with gaps between lines (24 kHz mono)
  voiceover_<voice>_lineN.mp3  each line alone, for the editor
  timeline_<voice>.json        start/end of every line in seconds
  chipxpert_meta_ad_9x16_<voice>.srt

Usage: python3 tts.py [--voice af_heart] [--speed 1.08] [--model DIR]
"""
import argparse, json, os, subprocess, sys
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "output")

# (scene id, text shown in the SRT, text sent to the TTS engine, pause after in s)
LINES = [
    ("hook",   "ECE graduate, still stuck in a non-core job?",
               "E C E graduate, still stuck in a non-core job?", 0.35),
    ("chip",   "The chip in your phone was designed by engineers like you.",
               "The chip in your phone was designed by engineers like you.", 0.30),
    ("learn",  "At ChipXpert, learn VLSI on real Cadence tools, from ex-Intel engineers.",
               "At Chip Expert, learn V L S I on real Cadence tools, from ex Intel engineers.", 0.30),
    ("proof",  "AICTE approved, NSDC certified, 500+ alumni.",
               "A I C T E approved, N S D C certified, five hundred plus alumni.", 0.30),
    ("batch",  "New batches in Hyderabad and Bengaluru.",
               "New batches in Hyderabad and Bengaluru.", 0.75),
    ("cta",    "Tap Learn More and book your free demo today.",
               "Tap Learn More, and book your free demo today.", 0.0),
]

def trim(x, sr, thresh_db=-42.0, pad=0.06):
    thr = 10 ** (thresh_db / 20)
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * sr)); b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]

def srt_time(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.15)
    ap.add_argument("--lead", type=float, default=0.30, help="silence before the first line")
    ap.add_argument("--model", default=os.environ.get("KOKORO_DIR", os.path.join(HERE, "..", "models")))
    ap.add_argument("--ffmpeg", default=None)
    a = ap.parse_args()
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(a.model, "kokoro-v1.0.onnx"), os.path.join(a.model, "voices-v1.0.bin"))
    lang = "en-gb" if a.voice.startswith("b") else "en-us"
    os.makedirs(OUT, exist_ok=True)
    ff = a.ffmpeg or os.environ.get("FFMPEG") or "ffmpeg"

    sr = 24000
    pieces = [np.zeros(int(a.lead * sr), dtype=np.float32)]
    t = a.lead
    timeline = []
    for i, (sid, shown, spoken, gap) in enumerate(LINES, 1):
        x, sr = k.create(spoken, voice=a.voice, speed=a.speed, lang=lang)
        x = trim(np.asarray(x, dtype=np.float32), sr)
        x = x / max(1e-6, np.max(np.abs(x))) * 0.89
        sf.write(os.path.join(OUT, f"voiceover_{a.voice}_line{i}.wav"), x, sr)
        dur = len(x) / sr
        timeline.append({"id": sid, "line": i, "text": shown, "start": round(t, 3), "end": round(t + dur, 3)})
        pieces.append(x); pieces.append(np.zeros(int(gap * sr), dtype=np.float32))
        t += dur + gap
        print(f"line {i} {sid:6s} {dur:5.2f}s  -> {t:5.2f}s")
    full = np.concatenate(pieces)
    wav = os.path.join(OUT, f"voiceover_{a.voice}.wav")
    sf.write(wav, full, sr)
    total = len(full) / sr
    with open(os.path.join(OUT, f"timeline_{a.voice}.json"), "w") as f:
        json.dump({"voice": a.voice, "speed": a.speed, "sample_rate": sr, "duration": round(total, 3), "lines": timeline}, f, indent=1)
    with open(os.path.join(OUT, f"chipxpert_meta_ad_9x16_{a.voice}.srt"), "w") as f:
        for L in timeline:
            f.write(f"{L['line']}\n{srt_time(L['start'])} --> {srt_time(L['end'])}\n{L['text']}\n\n")
    # mp3 versions for editors
    for i in range(1, len(LINES) + 1):
        w = os.path.join(OUT, f"voiceover_{a.voice}_line{i}.wav")
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", w, "-codec:a", "libmp3lame", "-q:a", "2", w[:-4] + ".mp3"], check=True)
        os.remove(w)
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-q:a", "2", wav[:-4] + ".mp3"], check=True)
    print(f"total VO length {total:.2f}s  voice={a.voice}")

if __name__ == "__main__":
    main()
