#!/usr/bin/env python3
"""Synthesize a royalty-free upbeat music bed for the ad (no samples, pure numpy).

  python3 music.py --duration 22 --out ../output/music_bed.wav [--duck timeline.json]

118 BPM, D major, pad + pluck arpeggio + soft kick + hats + bass. If a timeline
JSON is given, the bed ducks by ~7 dB while the voiceover is speaking.
"""
import argparse, json
import numpy as np
import soundfile as sf

SR = 44100
def note(n):  # MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def env(n, a, d, s, r, sr=SR):
    a_n, d_n, r_n = int(a * sr), int(d * sr), int(r * sr)
    e = np.zeros(n, dtype=np.float32); i = 0
    att = min(a_n, n); e[:att] = np.linspace(0, 1, att, endpoint=False); i += att
    dec = min(d_n, n - i); e[i:i + dec] = np.linspace(1, s, dec, endpoint=False); i += dec
    sus = max(0, n - i - r_n); e[i:i + sus] = s; i += sus
    rel = n - i
    if rel > 0: e[i:] = np.linspace(s, 0, rel)
    return e

def saw(freq, n, sr=SR, harmonics=12):
    t = np.arange(n) / sr; x = np.zeros(n, dtype=np.float32)
    for h in range(1, harmonics + 1):
        x += ((-1) ** (h + 1)) * np.sin(2 * np.pi * freq * h * t) / h
    return x * (2 / np.pi)

def lowpass(x, cutoff, sr=SR, passes=2):
    # one-pole IIR via lfilter-free recurrence (vectorised with cumulative trick is messy; loop in chunks)
    rc = 1 / (2 * np.pi * cutoff); dt = 1 / sr; alpha = dt / (rc + dt)
    y = x.astype(np.float64)
    for _ in range(passes):
        acc = 0.0; out = np.empty_like(y)
        # process in python but with numpy scalar ops; ~1M samples is fine
        for i in range(len(y)):
            acc += alpha * (y[i] - acc); out[i] = acc
        y = out
    return y.astype(np.float32)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--duration", type=float, default=22.0)
    ap.add_argument("--bpm", type=float, default=118)
    ap.add_argument("--out", default="../output/music_bed.wav")
    ap.add_argument("--duck", default=None, help="timeline json to duck under the VO")
    ap.add_argument("--duck_db", type=float, default=7.0)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    dur = a.duration; n = int(dur * SR); beat = 60 / a.bpm; bar = beat * 4
    mix = np.zeros(n, dtype=np.float32)

    chords = [[62, 66, 69, 74], [57, 61, 64, 69], [59, 62, 66, 71], [55, 59, 62, 67]]  # D A Bm G
    roots = [50, 45, 47, 43]

    # pad
    pad = np.zeros(n, dtype=np.float32); ci = 0; t = 0.0
    while t < dur:
        L = int(min(2 * bar, dur - t) * SR); s = int(t * SR); L = min(L, n - s)
        e = env(L, 0.6, 0.4, 0.8, 0.8); seg = np.zeros(L, dtype=np.float32)
        for m in chords[ci % 4]:
            seg += saw(note(m), L, harmonics=8) * 0.25 + saw(note(m) * 1.003, L, harmonics=8) * 0.18
        pad[s:s + L] += seg * e; t += 2 * bar; ci += 1
    mix += lowpass(pad, 900) * 0.16

    # pluck arpeggio, 8th notes
    pl = np.zeros(n, dtype=np.float32); k = 0; t = 0.0
    while t < dur:
        ci = int(t // (2 * bar)) % 4; m = chords[ci][[0, 2, 1, 3, 2, 0, 3, 1][k % 8]] + 12
        s = int(t * SR); L = min(int(0.32 * SR), n - s)
        if L <= 0: break
        tt = np.arange(L) / SR; f = note(m)
        x = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.12 * np.sin(6 * np.pi * f * tt)) * np.exp(-tt * 9.0)
        pl[s:s + L] += x.astype(np.float32) * (0.9 if k % 2 == 0 else 0.7); t += beat / 2; k += 1
    mix += pl * 0.11

    # bass
    bs = np.zeros(n, dtype=np.float32); t = 0.0; k = 0
    while t < dur:
        ci = int(t // (2 * bar)) % 4; f = note(roots[ci] - 12)
        s = int(t * SR); L = min(int(beat * 0.45 * SR), n - s)
        if L <= 0: break
        tt = np.arange(L) / SR
        bs[s:s + L] += (np.sin(2 * np.pi * f * tt) * np.exp(-tt * 4) * (1.0 if k % 4 == 0 else 0.7)).astype(np.float32)
        t += beat / 2; k += 1
    mix += bs * 0.20

    # kick
    kk = np.zeros(n, dtype=np.float32); t = 0.0
    while t < dur:
        s = int(t * SR); L = min(int(0.22 * SR), n - s)
        if L <= 0: break
        tt = np.arange(L) / SR; f = 48 + 110 * np.exp(-tt * 28); ph = 2 * np.pi * np.cumsum(f) / SR
        kk[s:s + L] += (np.sin(ph) * np.exp(-tt * 14)).astype(np.float32); t += beat
    mix += kk * 0.30

    # hats (off-beats)
    hh = np.zeros(n, dtype=np.float32); t = beat / 2
    while t < dur:
        s = int(t * SR); L = min(int(0.035 * SR), n - s)
        if L <= 0: break
        tt = np.arange(L) / SR
        hh[s:s + L] += (rng.standard_normal(L) * np.exp(-tt * 120)).astype(np.float32); t += beat / 2
    mix += (hh - lowpass(hh, 4000, passes=1)) * 0.10

    fi = int(0.4 * SR); mix[:fi] *= np.linspace(0, 1, fi)
    fo = int(1.6 * SR); mix[-fo:] *= np.linspace(1, 0, fo)

    if a.duck:
        tl = json.load(open(a.duck)); g = np.ones(n, dtype=np.float32); low = 10 ** (-a.duck_db / 20)
        for L in tl["lines"]:
            s = int(max(0, L["start"] - 0.15) * SR); e = int(min(dur, L["end"] + 0.25) * SR); g[s:e] = low
        w = int(0.12 * SR); g = np.convolve(g, np.ones(w) / w, mode="same").astype(np.float32); mix *= g

    mix = mix / max(1e-6, np.max(np.abs(mix))) * 0.7
    sf.write(a.out, mix, SR); print(f"music bed {dur:.1f}s -> {a.out}")

if __name__ == "__main__":
    main()
