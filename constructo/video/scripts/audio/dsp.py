"""Small DSP kit for the Neev films: oscillators, plucked strings, drums, filters,
reverb and loudness. Everything is generated, so the films carry no licensed
audio. 48 kHz, float in [-1, 1], stereo arrays shaped (n, 2)."""
from __future__ import annotations

import wave

import numpy as np
from scipy import signal

SR = 48_000


def secs(n: int) -> float:
    return n / SR


def samples(t: float) -> int:
    return int(round(t * SR))


def silence(t: float, channels: int = 2) -> np.ndarray:
    return np.zeros((samples(t), channels)) if channels == 2 else np.zeros(samples(t))


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def note(name: str) -> int:
    """'D4' -> MIDI number."""
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + NOTE[pitch]


# ---------------------------------------------------------------- envelopes


def env_adsr(n: int, a: float, d: float, s: float, r: float, hold: float | None = None) -> np.ndarray:
    """Attack/decay/sustain/release over n samples; release starts at `hold` seconds (default: end - r)."""
    e = np.zeros(n)
    na, nd, nr = samples(a), samples(d), samples(r)
    nh = samples(hold) if hold is not None else max(0, n - nr)
    i = 0
    if na:
        k = min(na, n)
        e[:k] = np.linspace(0, 1, na, endpoint=False)[:k]
        i = k
    if i < n and nd:
        k = min(nd, n - i)
        e[i : i + k] = np.linspace(1, s, nd, endpoint=False)[:k]
        i += k
    if i < nh:
        e[i:nh] = s
        i = nh
    if i < n:
        start = e[i - 1] if i > 0 else s
        k = n - i
        e[i:] = start * np.linspace(1, 0, k) ** 1.6
    return e


def env_exp(n: int, decay: float, attack: float = 0.002) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.exp(-t / max(decay, 1e-4))
    na = samples(attack)
    if na:
        e[:na] *= np.linspace(0, 1, na)
    return e


# -------------------------------------------------------------- oscillators

_SAW_TABLE = None


def _saw_table(size: int = 4096, harmonics: int = 48) -> np.ndarray:
    global _SAW_TABLE
    if _SAW_TABLE is None:
        ph = np.arange(size) / size * 2 * np.pi
        t = np.zeros(size)
        for k in range(1, harmonics + 1):
            t += np.sin(k * ph) / k * (1.0 / (1 + (k / 18) ** 2))
        _SAW_TABLE = t / np.max(np.abs(t))
    return _SAW_TABLE


def osc(freq: float | np.ndarray, n: int, shape: str = "sine", phase0: float = 0.0) -> np.ndarray:
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    phase = phase0 + np.cumsum(f) / SR
    if shape == "sine":
        return np.sin(2 * np.pi * phase)
    if shape == "tri":
        return 2 * np.abs(2 * (phase % 1) - 1) - 1
    if shape == "saw":
        table = _saw_table()
        idx = (phase % 1) * len(table)
        i0 = idx.astype(int) % len(table)
        frac = idx - np.floor(idx)
        return table[i0] * (1 - frac) + table[(i0 + 1) % len(table)] * frac
    raise ValueError(shape)


def noise(n: int, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).uniform(-1, 1, n)


# ------------------------------------------------------------------ filters


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, min(cutoff, SR * 0.45), "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, max(cutoff, 10), "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, [max(lo, 10), min(hi, SR * 0.45)], "band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def sweep_lowpass(x: np.ndarray, cutoffs: np.ndarray, block: int = 512) -> np.ndarray:
    """Time-varying one-pole-pair lowpass, cutoff per sample (blockwise)."""
    y = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        c = float(np.mean(cutoffs[i : i + block]))
        sos = signal.butter(2, min(max(c, 40), SR * 0.45), "low", fs=SR, output="sos")
        if zi is None or zi.shape[0] != sos.shape[0]:
            zi = np.zeros((sos.shape[0], 2) + x.shape[1:])
        y[i : i + block], zi = signal.sosfilt(sos, x[i : i + block], axis=0, zi=zi)
    return y


# --------------------------------------------------------------- instruments


def pluck(freq: float, dur: float, decay: float = 0.996, bright: float = 0.6, seed: int = 0) -> np.ndarray:
    """Karplus–Strong plucked string (santoor/harp-like), mono."""
    n = samples(dur)
    period = max(2, int(round(SR / freq)))
    burst = noise(period, seed)
    burst = lowpass(burst, 1500 + 9000 * bright)
    x = np.zeros(n)
    x[:period] = burst
    a = np.zeros(period + 2)
    a[0] = 1.0
    a[period] = -0.5 * decay
    a[period + 1] = -0.5 * decay
    y = signal.lfilter([1.0], a, x)
    y *= env_adsr(n, 0.001, 0.0, 1.0, min(0.08, dur * 0.3))
    peak = np.max(np.abs(y)) or 1.0
    return y / peak


def bell(freq: float, dur: float, partials=((1, 1.0), (2.76, 0.42), (5.4, 0.22), (8.93, 0.1)), decay: float = 1.4) -> np.ndarray:
    n = samples(dur)
    y = np.zeros(n)
    for ratio, amp in partials:
        y += amp * osc(freq * ratio, n) * env_exp(n, decay / ratio**0.5, attack=0.001)
    return y / sum(a for _, a in partials)


def pad_voice(freq: float, dur: float, detune_cents: float = 7.0, cutoff: float = 1800.0, seed: int = 0) -> np.ndarray:
    """Warm detuned saw pair, filtered — mono."""
    n = samples(dur)
    d = 2 ** (detune_cents / 1200)
    rng = np.random.default_rng(seed)
    y = osc(freq * d, n, "saw", rng.random()) + osc(freq / d, n, "saw", rng.random()) + 0.6 * osc(freq / 2, n, "tri")
    return lowpass(y, cutoff, order=2) / 2.6


def kick(dur: float = 0.45, f0: float = 150.0, f1: float = 46.0, punch: float = 1.0) -> np.ndarray:
    n = samples(dur)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    body = osc(f, n) * env_exp(n, 0.16 * punch + 0.08)
    click = highpass(noise(n, 3), 2500) * env_exp(n, 0.004) * 0.35
    y = np.tanh(1.6 * (body + click))
    return y / np.max(np.abs(y))


def snare(dur: float = 0.3, tone: float = 190.0) -> np.ndarray:
    n = samples(dur)
    body = osc(tone, n) * env_exp(n, 0.05)
    rattle = bandpass(noise(n, 11), 1500, 9000) * env_exp(n, 0.11)
    y = 0.55 * body + rattle
    return y / np.max(np.abs(y))


def clap(dur: float = 0.35) -> np.ndarray:
    n = samples(dur)
    y = np.zeros(n)
    for i, off in enumerate((0.0, 0.011, 0.023, 0.034)):
        k = samples(off)
        burst = bandpass(noise(n - k, 20 + i), 900, 5200) * env_exp(n - k, 0.012 if i < 3 else 0.12)
        y[k:] += burst
    return y / np.max(np.abs(y))


def hat(dur: float = 0.08, open_: bool = False, seed: int = 5) -> np.ndarray:
    n = samples(dur if not open_ else 0.4)
    y = highpass(noise(n, seed), 7000, order=4) * env_exp(n, 0.018 if not open_ else 0.15)
    return y / (np.max(np.abs(y)) or 1)


def shaker(dur: float = 0.09, seed: int = 9) -> np.ndarray:
    n = samples(dur)
    e = env_adsr(n, 0.012, 0.03, 0.2, 0.04)
    y = bandpass(noise(n, seed), 5000, 12000) * e
    return y / (np.max(np.abs(y)) or 1)


def tom(freq: float = 110.0, dur: float = 0.35, bend: float = 1.6, seed: int = 4) -> np.ndarray:
    """A dhol-ish membrane: pitch drops from freq*bend to freq."""
    n = samples(dur)
    t = np.arange(n) / SR
    f = freq + freq * (bend - 1) * np.exp(-t / 0.03)
    y = osc(f, n) * env_exp(n, 0.13) + 0.25 * bandpass(noise(n, seed), 300, 2500) * env_exp(n, 0.02)
    return np.tanh(1.3 * y) / np.tanh(1.3)


def crash(dur: float = 2.4, seed: int = 21) -> np.ndarray:
    n = samples(dur)
    y = highpass(noise(n, seed), 4000, order=2) * env_exp(n, 0.7, attack=0.002)
    y += 0.4 * bandpass(noise(n, seed + 1), 2500, 7000) * env_exp(n, 0.2)
    return y / np.max(np.abs(y))


# --------------------------------------------------------------- space & mix


def to_stereo(x: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Constant-power pan, -1 (left) … 1 (right)."""
    if x.ndim == 2:
        return x
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def reverb_ir(seconds: float = 2.4, predelay: float = 0.018, damping: float = 5000.0, seed: int = 7) -> np.ndarray:
    n = samples(seconds)
    t = np.arange(n) / SR
    chans = []
    for c in range(2):
        tail = noise(n, seed + c) * np.exp(-t * 6.9 / seconds)
        tail = lowpass(tail, damping, order=1)
        chans.append(np.concatenate([np.zeros(samples(predelay)), tail]))
    ir = np.stack(chans, axis=1)
    return ir / np.sqrt(np.sum(ir**2, axis=0, keepdims=True))


def reverb(x: np.ndarray, wet: float = 0.25, seconds: float = 2.4, damping: float = 5000.0, seed: int = 7, tail: float = 0.0) -> np.ndarray:
    """Convolution reverb; `tail` seconds of silence are added so the space rings out."""
    st = to_stereo(x)
    if tail:
        st = np.concatenate([st, np.zeros((samples(tail), 2))])
    ir = reverb_ir(seconds, damping=damping, seed=seed)
    w = np.stack([signal.fftconvolve(st[:, c], ir[:, c])[: len(st)] for c in range(2)], axis=1)
    return st * (1 - wet) + w * wet * 1.4


def delay(x: np.ndarray, time: float, feedback: float = 0.35, mix: float = 0.25, pingpong: bool = True) -> np.ndarray:
    st = to_stereo(x).copy()
    d = samples(time)
    out = st.copy()
    tap = st.copy()
    for i in range(1, 6):
        tap = np.roll(tap, d, axis=0)
        tap[:d] = 0
        tap *= feedback
        if pingpong:
            tap = tap[:, ::-1]
        out += tap * mix
    return out


def place(track: np.ndarray, clip: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mix `clip` into stereo `track` at time `at` (seconds)."""
    st = to_stereo(clip, pan) * gain
    i = samples(at)
    if i >= len(track):
        return
    j = min(len(track), i + len(st))
    track[i:j] += st[: j - i]


def compress(x: np.ndarray, threshold_db: float = -18.0, ratio: float = 3.0, attack: float = 0.01, release: float = 0.15) -> np.ndarray:
    level = np.max(np.abs(x), axis=1)
    a = np.exp(-1 / (SR * attack))
    r = np.exp(-1 / (SR * release))
    env = signal.lfilter([1 - r], [1, -r], level)  # smooth (release-dominated)
    env = np.maximum(env, signal.lfilter([1 - a], [1, -a], level))
    db = 20 * np.log10(np.maximum(env, 1e-6))
    over = np.maximum(0, db - threshold_db)
    gain_db = -over * (1 - 1 / ratio)
    return x * (10 ** (gain_db / 20))[:, None]


def _k_weight(x: np.ndarray) -> np.ndarray:
    # ITU-R BS.1770 K-weighting at 48 kHz.
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x: np.ndarray) -> float:
    """Integrated loudness (gated, BS.1770-4), stereo."""
    y = _k_weight(to_stereo(x))
    block, hop = samples(0.4), samples(0.1)
    zs = []
    for i in range(0, max(1, len(y) - block), hop):
        zs.append(np.mean(y[i : i + block] ** 2, axis=0).sum())
    zs = np.array(zs)
    loud = -0.691 + 10 * np.log10(np.maximum(zs, 1e-12))
    gated = zs[loud > -70]
    if len(gated) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(np.mean(gated)) - 10
    gated2 = gated[(-0.691 + 10 * np.log10(gated)) > rel]
    return float(-0.691 + 10 * np.log10(np.mean(gated2)))


def master(x: np.ndarray, target_lufs: float = -18.0, ceiling: float = 0.89, threshold_db: float = -16.0, ratio: float = 2.5) -> np.ndarray:
    y = compress(x, threshold_db=threshold_db, ratio=ratio)
    gain = 10 ** ((target_lufs - lufs(y)) / 20)
    y = y * gain
    # Soft ceiling instead of a hard clip.
    y = np.tanh(y / ceiling) * ceiling
    return y


def fade(x: np.ndarray, fade_in: float = 0.0, fade_out: float = 0.0) -> np.ndarray:
    y = x.copy()
    if fade_in:
        k = min(len(y), samples(fade_in))
        y[:k] *= np.linspace(0, 1, k)[:, None]
    if fade_out:
        k = min(len(y), samples(fade_out))
        y[-k:] *= np.linspace(1, 0, k)[:, None] ** 2
    return y


def write_wav(path: str, x: np.ndarray) -> None:
    st = np.clip(to_stereo(x), -1, 1)
    pcm = (st * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
