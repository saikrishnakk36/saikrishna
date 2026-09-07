#!/usr/bin/env python3
"""Mix voiceover + music bed into one 44.1 kHz stereo WAV.
python3 mix.py --vo ../output/voiceover_af_heart.wav --music ../output/music_bed.wav --out ../output/mix.wav --duration 23.5
"""
import argparse, numpy as np, soundfile as sf
ap = argparse.ArgumentParser(); ap.add_argument("--vo"); ap.add_argument("--music"); ap.add_argument("--out"); ap.add_argument("--duration", type=float)
ap.add_argument("--music_gain", type=float, default=0.38); ap.add_argument("--vo_gain", type=float, default=1.0)
a = ap.parse_args(); SR = 44100
def load(p):
    x, sr = sf.read(p, dtype="float32")
    if x.ndim > 1: x = x.mean(axis=1)
    if sr != SR:
        n = int(len(x) * SR / sr); x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    return x
vo = load(a.vo) * a.vo_gain; mu = load(a.music) * a.music_gain
n = int(a.duration * SR); out = np.zeros(n, dtype=np.float32)
out[:min(n, len(vo))] += vo[:n]; out[:min(n, len(mu))] += mu[:n]
peak = np.max(np.abs(out)); out = out / peak * 0.95 if peak > 0.95 else out
sf.write(a.out, np.stack([out, out], axis=1), SR); print(f"mix -> {a.out} ({a.duration}s, peak {np.max(np.abs(out)):.2f})")
