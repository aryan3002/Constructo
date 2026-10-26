"""Generate the Neev sound cues into public/audio/sfx/*.wav.

Quiet, warm and short: UI ticks, a chat pop, a send, a whoosh, a brick thud,
a notification ping, a button press, the logo chime, a kinetic-type hit, a
riser and a swell. Run: uv run --with numpy --with scipy python scripts/audio/sfx.py
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import (  # noqa: E402
    SR,
    bandpass,
    bell,
    env_adsr,
    env_exp,
    fade,
    highpass,
    kick,
    lowpass,
    midi_hz,
    noise,
    note,
    osc,
    reverb,
    samples,
    to_stereo,
    write_wav,
)

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "audio", "sfx")


def norm(x: np.ndarray, peak_db: float) -> np.ndarray:
    p = np.max(np.abs(x)) or 1.0
    return x / p * 10 ** (peak_db / 20)


def tick() -> np.ndarray:
    n = samples(0.09)
    y = osc(2300, n) * env_exp(n, 0.012, attack=0.0005) + 0.5 * highpass(noise(n, 2), 3000) * env_exp(n, 0.004)
    return norm(reverb(y, wet=0.12, seconds=0.6, tail=0.25), -14)


def pop() -> np.ndarray:
    n = samples(0.16)
    t = np.arange(n) / SR
    f = 520 + 520 * np.exp(-t / 0.018)
    y = osc(f, n) * env_exp(n, 0.045, attack=0.001) + 0.2 * bandpass(noise(n, 4), 1500, 6000) * env_exp(n, 0.006)
    return norm(reverb(y, wet=0.14, seconds=0.7, tail=0.35), -12)


def send() -> np.ndarray:
    n = samples(0.32)
    t = np.arange(n) / SR
    sweep = bandpass(noise(n, 6), 600, 7000) * np.sin(np.pi * np.clip(t / 0.22, 0, 1)) ** 2
    blip = np.zeros(n)
    k = samples(0.17)
    blip[k:] = osc(1320, n - k) * env_exp(n - k, 0.05)
    y = 0.45 * sweep + 0.6 * blip
    return norm(reverb(y, wet=0.18, seconds=0.9, tail=0.5), -13)


def whoosh() -> np.ndarray:
    dur = 0.55
    n = samples(dur)
    t = np.arange(n) / SR
    base = noise(n, 8)
    # Band-pass sweep built from short blocks.
    y = np.zeros(n)
    block = 1024
    for i in range(0, n, block):
        c = 400 * (12 ** (i / n))
        y[i : i + block] = bandpass(base[i : i + block], c * 0.6, c * 1.8, order=1)
    env = np.sin(np.pi * t / dur) ** 2
    st = np.stack([y * env * (1 - t / dur * 0.6), y * env * (0.4 + t / dur * 0.6)], axis=1)
    return norm(reverb(st, wet=0.2, seconds=1.0, tail=0.6), -14)


def thud() -> np.ndarray:
    n = samples(0.35)
    t = np.arange(n) / SR
    f = 62 + 70 * np.exp(-t / 0.02)
    body = osc(f, n) * env_exp(n, 0.07)
    dust = lowpass(noise(n, 12), 900) * env_exp(n, 0.03) * 0.6
    click = highpass(noise(n, 13), 2000) * env_exp(n, 0.003) * 0.25
    y = np.tanh(2 * (body + dust + click))
    return norm(reverb(y, wet=0.1, seconds=0.6, damping=2500, tail=0.3), -10)


def ping() -> np.ndarray:
    y = 0.65 * bell(midi_hz(note("E6")), 1.4, decay=0.7)
    k = samples(0.085)
    second = bell(midi_hz(note("B6")), 1.4, decay=0.6)
    y[k:] += 0.5 * second[: len(y) - k]
    return norm(reverb(y, wet=0.28, seconds=1.6, tail=1.0), -15)


def press() -> np.ndarray:
    n = samples(0.12)
    y = osc(380, n) * env_exp(n, 0.02) + 0.4 * bandpass(noise(n, 14), 1200, 5000) * env_exp(n, 0.005)
    return norm(reverb(y, wet=0.1, seconds=0.5, tail=0.25), -13)


def chime() -> np.ndarray:
    # The mark settling: D–F#–A–D rising, as soft bells.
    notes = ["D5", "F#5", "A5", "D6"]
    n = samples(3.2)
    y = np.zeros(n)
    for i, nm in enumerate(notes):
        k = samples(i * 0.07)
        b = bell(midi_hz(note(nm)), 3.2, partials=((1, 1.0), (2.0, 0.25), (3.0, 0.12), (4.07, 0.06)), decay=1.6)
        y[k:] += b[: n - k] * (0.9 - 0.12 * i)
    return norm(fade(reverb(y, wet=0.32, seconds=2.6, tail=1.2), fade_out=0.6), -12)


def hit() -> np.ndarray:
    n = samples(1.6)
    boom = np.zeros(n)
    k = kick(0.9, f0=110, f1=38, punch=1.6)
    boom[: len(k)] += k
    body = lowpass(noise(n, 31), 1800) * env_exp(n, 0.06) * 0.5
    sub = osc(41.2, n) * env_exp(n, 0.45) * 0.6
    y = np.tanh(1.4 * (boom + body + sub))
    return norm(fade(reverb(y, wet=0.22, seconds=1.8, damping=3000, tail=0.8), fade_out=0.5), -7)


def riser() -> np.ndarray:
    dur = 8.0
    n = samples(dur)
    t = np.arange(n) / SR
    base = noise(n, 41)
    y = np.zeros(n)
    block = 2048
    for i in range(0, n, block):
        c = 300 * (20 ** (i / n))
        y[i : i + block] = bandpass(base[i : i + block], c * 0.7, c * 1.4, order=1)
    tone = osc(180 * (2 ** (2 * t / dur)), n, "saw") * 0.12
    env = (t / dur) ** 2.2
    st = to_stereo((y + lowpass(tone, 3000)) * env)
    return norm(reverb(st, wet=0.25, seconds=1.5), -12)


def swell() -> np.ndarray:
    dur = 1.3
    n = samples(dur)
    t = np.arange(n) / SR
    y = highpass(noise(n, 51), 2500) * (t / dur) ** 3
    y = np.concatenate([y, np.zeros(samples(0.05))])
    return norm(reverb(y, wet=0.3, seconds=1.2, tail=0.2), -16)


def type_() -> np.ndarray:
    n = samples(0.06)
    y = bandpass(noise(n, 61), 2000, 8000) * env_exp(n, 0.006) + osc(900, n) * env_exp(n, 0.01) * 0.3
    return norm(y, -18)


CUES = {
    "tick": tick,
    "pop": pop,
    "send": send,
    "whoosh": whoosh,
    "thud": thud,
    "ping": ping,
    "press": press,
    "chime": chime,
    "hit": hit,
    "riser": riser,
    "swell": swell,
    "type": type_,
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, make in CUES.items():
        x = make()
        x = to_stereo(x)
        # A short fade so nothing clicks at the cut.
        x = fade(x, fade_in=0.001, fade_out=0.01)
        write_wav(os.path.join(OUT, f"{name}.wav"), x)
        print(f"{name:7s} {len(x) / SR:5.2f}s peak {20 * np.log10(np.max(np.abs(x)) + 1e-9):6.1f} dBFS")


if __name__ == "__main__":
    main()
