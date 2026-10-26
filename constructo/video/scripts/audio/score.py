"""Compose the two Neev scores, one file per cut, on the same bar grid as the
picture (src/films/cuts.json), into public/audio/music/<variant>-<format>.wav.

A — "All good, sir?": warm D major at 90 bpm. Plucked-string arpeggios (a
    santoor-ish Karplus–Strong voice), a soft pad, bass, shaker and a soft
    kick. It hangs unresolved under the question, crowds up under the chat,
    resolves when the mark appears, and ends on the mark's D–F#–A–D.
B — "Build on the truth": E minor at 120 bpm. Hits under the numbers, a
    filtered build under the chatter, a drop when the bricks are laid (with
    dhol-style toms), three courses of groove, and a bright G major ending.

Run: uv run --with numpy --with scipy python scripts/audio/score.py
"""
from __future__ import annotations

import json
import os
import sys
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import (  # noqa: E402
    SR,
    bell,
    clap,
    crash,
    delay,
    env_adsr,
    fade,
    hat,
    highpass,
    kick,
    lowpass,
    lufs,
    master,
    midi_hz,
    note,
    osc,
    pad_voice,
    place,
    pluck,
    reverb,
    samples,
    shaker,
    snare,
    sweep_lowpass,
    tom,
    write_wav,
)

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "audio", "music")

CHORDS = {
    # name: (bass root, upper voicing)
    "D": ("D2", ["A3", "D4", "F#4", "A4"]),
    "Dadd9": ("D2", ["A3", "D4", "E4", "F#4", "A4"]),
    "Bm": ("B1", ["F#3", "B3", "D4", "F#4"]),
    "Bm7": ("B1", ["F#3", "A3", "D4", "F#4"]),
    "G": ("G2", ["G3", "B3", "D4", "G4"]),
    "Gmaj7": ("G2", ["F#3", "B3", "D4", "G4"]),
    "A": ("A2", ["A3", "C#4", "E4", "A4"]),
    "Asus4": ("A2", ["A3", "D4", "E4", "A4"]),
    "A7sus4": ("A2", ["G3", "D4", "E4", "A4"]),
    "Em7": ("E2", ["G3", "B3", "D4", "E4"]),
    # B
    "Em": ("E2", ["E3", "B3", "E4", "G4"]),
    "Em9": ("E2", ["G3", "B3", "D4", "F#4"]),
    "C": ("C2", ["C3", "G3", "C4", "E4"]),
    "Cmaj7": ("C2", ["E3", "G3", "B3", "E4"]),
    "Gb": ("G2", ["G3", "B3", "D4", "G4"]),
    "Dmaj": ("D2", ["D3", "A3", "D4", "F#4"]),
    "Gadd9": ("G2", ["G3", "A3", "B3", "D4", "G4"]),
}


def stable_seed(*parts) -> int:
    """A seed that is the same on every run (Python's hash() is salted per process)."""
    return zlib.crc32(repr(parts).encode()) % 100_000


def hz(n: str) -> float:
    return midi_hz(note(n))


def up(n: str, octaves: int) -> str:
    return f"{n[:-1]}{int(n[-1]) + octaves}"


class Score:
    def __init__(self, bpm: float, sections: list[tuple[str, float]], tail: float = 0.0):
        self.beat = 60.0 / bpm
        self.bar = 4 * self.beat
        self.sections = []
        start = 0.0
        for sid, bars in sections:
            self.sections.append((sid, start, bars))
            start += bars
        self.total_bars = start
        self.length = self.total_bars * self.bar
        n = samples(self.length + tail)
        self.bus = {k: np.zeros((n, 2)) for k in ("pad", "pluck", "bass", "drums", "fx")}

    def t(self, bar: float, beat: float = 0.0) -> float:
        return bar * self.bar + beat * self.beat

    def chords(self, start: float, bars: float, progression: list[str]):
        """(bar, length_in_bars, chord) for each bar of a section."""
        out = []
        i = 0
        b = 0.0
        while b < bars - 1e-6:
            length = min(1.0, bars - b)
            out.append((start + b, length, progression[i % len(progression)]))
            b += 1.0
            i += 1
        return out

    # -- voices -------------------------------------------------------------

    def pad(self, bar: float, length: float, chord: str, gain: float, cutoff: float = 1800, attack: float = 0.5):
        dur = length * self.bar + 1.2
        for i, nm in enumerate(CHORDS[chord][1]):
            v = pad_voice(hz(nm), dur, cutoff=cutoff, seed=int(bar * 10) + i)
            v *= env_adsr(len(v), attack, 0.4, 0.85, 1.0, hold=length * self.bar)
            place(self.bus["pad"], v, self.t(bar), gain / len(CHORDS[chord][1]) * 1.6, pan=(i - 1.5) * 0.35)

    def bass(self, bar: float, beat: float, chord_or_note: str, dur_beats: float, gain: float, octave_up: bool = True):
        nm = CHORDS[chord_or_note][0] if chord_or_note in CHORDS else chord_or_note
        f = hz(nm)
        dur = dur_beats * self.beat
        n = samples(dur + 0.15)
        y = 0.8 * osc(f, n, "sine") + 0.35 * osc(f * 2, n, "tri")
        if octave_up:
            # Harmonics so the bass still reads on phone speakers.
            y += 0.18 * np.tanh(3 * osc(f * 2, n, "sine"))
        y *= env_adsr(n, 0.008, 0.12, 0.7, 0.12, hold=dur)
        place(self.bus["bass"], lowpass(y, 900), self.t(bar, beat), gain)

    def pluck(self, bar: float, beat: float, nm: str, gain: float, dur: float = 1.6, pan: float = 0.0, bright: float = 0.55):
        y = pluck(hz(nm), dur, decay=0.9975, bright=bright, seed=stable_seed(bar, beat, nm))
        place(self.bus["pluck"], y, self.t(bar, beat), gain, pan)

    def bell(self, bar: float, beat: float, nm: str, gain: float, dur: float = 2.5):
        y = bell(hz(nm), dur, partials=((1, 1.0), (2.0, 0.3), (3.0, 0.14), (4.1, 0.06)), decay=1.3)
        place(self.bus["pluck"], y, self.t(bar, beat), gain)

    def hit(self, bar: float, beat: float, clip: np.ndarray, gain: float, pan: float = 0.0):
        place(self.bus["drums"], clip, self.t(bar, beat), gain, pan)

    def arp(self, bar: float, length: float, chord: str, step_beats: float, gain: float, pattern=(0, 2, 1, 3, 2, 4, 3, 1), octave: int = 1, bright: float = 0.55, ramp=None):
        tones = [up(n, octave) for n in CHORDS[chord][1]]
        steps = int(round(length * 4 / step_beats))
        for s in range(steps):
            nm = tones[pattern[s % len(pattern)] % len(tones)]
            g = gain * (1.0 if s % 2 == 0 else 0.78)
            if ramp is not None:
                g *= ramp(s / max(1, steps - 1))
            self.pluck(bar, s * step_beats, nm, g, dur=1.4, pan=0.3 * np.sin(s * 1.3), bright=bright)

    # -- mix ----------------------------------------------------------------

    def automation(self, curve: dict[str, tuple[float, float]], n: int) -> np.ndarray:
        """Per-section gain in dB (start, end), smoothed over 60 ms."""
        db = np.zeros(n)
        for sid, start, bars in self.sections:
            a, b = curve.get(sid, (0.0, 0.0))
            i, j = samples(self.t(start)), min(n, samples(self.t(start + bars)))
            db[i:j] = np.linspace(a, b, max(1, j - i))
        if self.sections:
            last = self.sections[-1]
            db[samples(self.t(last[1] + last[2])) :] = curve.get(last[0], (0.0, 0.0))[1]
        k = samples(0.06)
        db = np.convolve(db, np.ones(k) / k, mode="same")
        return 10 ** (db / 20)

    def mixdown(self, target: float, fade_out: float, wets: dict[str, float], curve: dict | None = None, ratio: float = 2.5) -> np.ndarray:
        mix = np.zeros_like(self.bus["pad"])
        for k, x in self.bus.items():
            w = wets.get(k, 0.0)
            mix += reverb(x, wet=w, seconds=2.6, seed=stable_seed(k) % 97) if w else x
        mix = highpass(mix, 30)
        if curve:
            mix = mix * self.automation(curve, len(mix))[:, None]
        mix = master(mix, target_lufs=target, threshold_db=-12.0, ratio=ratio)
        n = samples(self.length)
        mix = mix[:n]
        return fade(mix, fade_in=0.02, fade_out=fade_out)


# ===================================================================== A ====

A_PROGRESSIONS = {
    "hook": ["Bm7", "Gmaj7"],
    "noise": ["Em7", "Gmaj7", "A7sus4"],
    "reveal": ["Dadd9", "D"],
    "site": ["D", "Bm", "G", "A"],
    "builder": ["Bm", "G", "D", "A"],
    "family": ["D", "A", "Bm", "G", "A"],
    "truths": ["G", "A", "Bm"],
    "end": ["Gmaj7", "Asus4", "Dadd9"],
}


def compose_a(sections, fmt: str) -> np.ndarray:
    s = Score(90, sections, tail=3.0)
    shk = shaker()
    kk = kick(0.4, f0=120, f1=48, punch=0.7)
    for sid, start, bars in s.sections:
        prog_ = A_PROGRESSIONS[sid]
        if sid == "end" and bars < 3:
            prog_ = prog_[-2:] if bars >= 2 else prog_[-1:]
        chords = s.chords(start, bars, prog_)
        for bar, length, ch in chords:
            if sid == "hook":
                s.pad(bar, length, ch, 0.42, cutoff=1100, attack=0.9)
                s.bass(bar, 0, ch, length * 4 - 0.5, 0.25)
            elif sid == "noise":
                k = (bar - start) / max(1, bars)
                s.pad(bar, length, ch, 0.5, cutoff=1300 + 1200 * k)
                s.bass(bar, 0, ch, length * 4 - 0.25, 0.32)
                s.arp(bar, length, ch, 0.25, 0.20 + 0.18 * k, octave=1, ramp=lambda r: 0.6 + 0.4 * r)
                for i in range(int(length * 8)):
                    s.hit(bar, i * 0.5, shk, 0.05 + 0.08 * k, pan=0.2)
            elif sid == "reveal":
                s.pad(bar, length, ch, 0.6, cutoff=2600, attack=0.25)
                s.bass(bar, 0, ch, length * 4 - 0.25, 0.42)
                if bar == start:
                    # The mark's motif, under the build: level, legs, point.
                    for j, nm in enumerate(["D4", "F#4", "A4", "D5"]):
                        s.pluck(bar, 0.75 + j * 0.75, nm, 0.42, dur=2.2, pan=(j - 1.5) * 0.2, bright=0.7)
                else:
                    s.arp(bar, length, ch, 0.5, 0.2, octave=1)
            elif sid in ("site", "builder", "family"):
                lift = {"site": 0.0, "builder": 0.08, "family": 0.12}[sid]
                s.pad(bar, length, ch, 0.42 + lift, cutoff=2200 + 2000 * lift)
                s.bass(bar, 0, ch, 2.5, 0.42)
                s.bass(bar, 2.5, ch, 1.4, 0.3)
                s.arp(bar, length, ch, 0.5, 0.26 + lift, octave=1, bright=0.5 + lift)
                for i in range(int(length * 8)):
                    s.hit(bar, i * 0.5, shk, 0.06 if i % 2 == 0 else 0.1, pan=0.25)
                for b in (0, 2):
                    if b < length * 4:
                        s.hit(bar, b, kk, 0.38)
                if sid == "builder":
                    # A small counter-line up high.
                    tones = [up(n, 2) for n in CHORDS[ch][1]]
                    s.pluck(bar, 1.5, tones[-1], 0.16, pan=0.4, bright=0.7)
                    s.pluck(bar, 3.5, tones[-2], 0.14, pan=-0.4, bright=0.7)
                if sid == "family" and (bar - start) % 2 == 1:
                    s.bell(bar, 0, up(CHORDS[ch][1][-1], 1), 0.16)
            elif sid == "truths":
                s.pad(bar, length, ch, 0.45, cutoff=1800)
                s.bass(bar, 0, ch, length * 4 - 0.25, 0.3)
                s.arp(bar, length, ch, 1.0, 0.2, octave=1)
            elif sid == "end":
                last = bar == chords[-1][0]
                s.pad(bar, length + (1.5 if last else 0), ch, 0.5, cutoff=2400, attack=0.3)
                s.bass(bar, 0, ch, (length * 4 + (4 if last else 0)) - 0.25, 0.36)
                if last:
                    for j, nm in enumerate(["D4", "F#4", "A4", "D5", "F#5"]):
                        s.pluck(bar, 0.25 + j * 0.5, nm, 0.38 - 0.03 * j, dur=3.0, pan=(j - 2) * 0.2, bright=0.65)
                else:
                    s.arp(bar, length, ch, 0.5, 0.2, octave=1)
    curve = {
        "hook": (-6.0, -5.0),
        "noise": (-6.0, 0.0),
        "reveal": (-3.0, -1.0),
        "site": (-1.5, -1.0),
        "builder": (-1.0, 0.0),
        "family": (0.5, 1.0),
        "truths": (-4.0, -4.0),
        "end": (-2.0, -1.0),
    }
    return s.mixdown(target=-19.0, fade_out=1.6 if fmt == "youtube" else 0.5, wets={"pad": 0.32, "pluck": 0.36, "bass": 0.05, "drums": 0.14}, curve=curve, ratio=1.6)


# ===================================================================== B ====

B_PROGRESSIONS = {
    "hook": ["Em", "Em", "C", "Em"],
    "noise": ["Em", "C", "Gb", "Dmaj"],
    "turn": ["Em", "C", "Gb", "Dmaj"],
    "site": ["Em", "C", "Gb", "Dmaj"],
    "builder": ["Em", "C", "Gb", "Dmaj"],
    "family": ["C", "Gb", "Dmaj", "Em"],
    "truths": ["C", "Dmaj", "Em"],
    "end": ["C", "Dmaj", "Gadd9", "Gadd9"],
}


def groove(s: Score, bar: float, length: float, ch: str, kit: dict, level: dict, variant: str = "full"):
    """One bar of the B groove: kick, clap, hats, dhol toms, bass 8ths, off-beat stabs."""
    beats = length * 4
    # Kick: 1, 2-and-a (syncopated), 3.
    for b in (0, 1.75, 2) if variant != "light" else (0, 2):
        if b < beats:
            s.hit(bar, b, kit["kick"], level["kick"])
    if variant != "light":
        for b in (1, 3):
            if b < beats:
                s.hit(bar, b, kit["clap"], level["clap"], pan=0.05)
                s.hit(bar, b, kit["snare"], level["clap"] * 0.5)
    for i in range(int(beats * 4)):
        acc = 1.0 if i % 4 == 2 else 0.55 if i % 2 == 0 else 0.4
        s.hit(bar, i * 0.25, kit["hat"], level["hat"] * acc, pan=0.3)
    # Dhol-style: low "dha" and high "tin".
    for b, which, g in ((0, "lo", 1.0), (1.5, "lo", 0.7), (2.5, "hi", 0.8), (2.75, "hi", 0.6), (3.25, "hi", 0.7), (3.5, "lo", 0.8)):
        if b < beats:
            s.hit(bar, b, kit[which], level["tom"] * g, pan=-0.25 if which == "lo" else 0.25)
    # Bass in 8ths on the root, a fifth on the last.
    root = CHORDS[ch][0]
    for i in range(int(beats * 2)):
        nm = root if i % 8 != 7 else up(CHORDS[ch][1][1], -1)
        s.bass(bar, i * 0.5, nm, 0.42, level["bass"] * (1.0 if i % 2 == 0 else 0.8))
    # Off-beat stabs.
    if variant == "full":
        for b in (0.5, 1.5, 2.5, 3.5):
            if b < beats:
                for k_, nm in enumerate(CHORDS[ch][1]):
                    n = samples(0.22)
                    y = osc(hz(nm), n, "saw") * env_adsr(n, 0.004, 0.08, 0.3, 0.08)
                    place(s.bus["pad"], lowpass(y, 2600), s.t(bar, b), level["stab"] / 4, pan=(k_ - 1.5) * 0.3)


def compose_b(sections, fmt: str) -> np.ndarray:
    s = Score(120, sections, tail=3.0)
    kit = {
        "kick": kick(0.45, f0=160, f1=46, punch=1.0),
        "clap": clap(),
        "snare": snare(),
        "hat": hat(),
        "lo": tom(98, 0.4, bend=1.5),
        "hi": tom(196, 0.25, bend=1.35, seed=8),
        "crash": crash(),
        "boom": kick(1.2, f0=110, f1=36, punch=2.2),
    }
    full = {"kick": 0.62, "clap": 0.32, "hat": 0.1, "tom": 0.3, "bass": 0.46, "stab": 0.26}
    for sid, start, bars in s.sections:
        prog_ = B_PROGRESSIONS[sid]
        if sid == "end" and bars < 4:
            prog_ = ["Dmaj", "Gadd9"] if bars >= 2 else ["Gadd9"]
        if sid == "hook" and bars < 4:
            prog_ = ["Em", "Em", "C"]
        chords = s.chords(start, bars, prog_)
        if sid == "noise":
            # Build: groove through a lowpass that opens, then one beat of silence.
            tmp = Score(120, [("x", bars)])
            for bar, length, ch in s.chords(0, bars, prog_):
                groove(tmp, bar, length, ch, kit, full)
                tmp.pad(bar, length, ch, 0.32, cutoff=1400)
            sub = np.zeros_like(tmp.bus["drums"])
            for k in tmp.bus:
                sub += tmp.bus[k]
            n = len(sub)
            cut = 280 * (24 ** (np.arange(n) / n))
            sub = sweep_lowpass(sub, cut)
            stop = samples(bars * s.bar - s.beat)
            sub[stop:] *= 0.0
            place(s.bus["fx"], sub, s.t(start), 0.95)
            continue
        for bar, length, ch in chords:
            i_bar = bar - start
            if sid == "hook":
                s.hit(bar, 0, kit["boom"], 0.55)
                s.bass(bar, 0, ch, 3.5, 0.42)
                s.pad(bar, length, ch, 0.26, cutoff=900, attack=0.05)
                if not (fmt == "youtube" and i_bar >= 3):
                    for i in range(int(length * 16)):
                        s.hit(bar, i * 0.25, kit["hat"], 0.05 if i % 4 else 0.09, pan=0.3)
            elif sid == "turn":
                if i_bar == 0:
                    s.hit(bar, 0, kit["crash"], 0.32)
                    s.hit(bar, 0, kit["boom"], 0.5)
                groove(s, bar, length, ch, kit, full)
                s.pad(bar, length, ch, 0.28, cutoff=2400, attack=0.05)
                title_bar = start + (1 if fmt == "reel" else 2)
                if abs(bar - title_bar) < 1e-6:
                    for j, nm in enumerate(["E5", "G5", "B5", "E6"]):
                        s.pluck(bar, j * 0.25, nm, 0.34, dur=2.0, pan=(j - 1.5) * 0.25, bright=0.8)
            elif sid in ("site", "builder"):
                groove(s, bar, length, ch, kit, full)
                s.pad(bar, length, ch, 0.24, cutoff=2600, attack=0.05)
                if sid == "builder":
                    for i in range(int(length * 16)):
                        if i % 4 == 3:
                            s.hit(bar, i * 0.25, kit["hi"], 0.12, pan=0.4)
                if i_bar % 2 == 1:
                    tones = [up(n, 1) for n in CHORDS[ch][1]]
                    for j, b in enumerate((0, 0.75, 1.5)):
                        s.pluck(bar, b, tones[(j + 1) % len(tones)], 0.22, pan=0.3, bright=0.75)
            elif sid == "family":
                groove(s, bar, length, ch, kit, {**full, "kick": 0.5, "hat": 0.08}, variant="light")
                s.pad(bar, length, ch, 0.34, cutoff=2200, attack=0.2)
                s.arp(bar, length, ch, 0.5, 0.24, octave=1, bright=0.7)
            elif sid == "truths":
                s.hit(bar, 0, kit["boom"], 0.6)
                s.hit(bar, 0, kit["crash"], 0.18)
                s.pad(bar, length, ch, 0.38, cutoff=1800, attack=0.02)
                s.bass(bar, 0, ch, 3.6, 0.45)
            elif sid == "end":
                last = abs(bar - chords[-1][0]) < 1e-6
                if i_bar == 0:
                    s.hit(bar, 0, kit["boom"], 0.6)
                    s.hit(bar, 0, kit["crash"], 0.25)
                s.pad(bar, length + (1.5 if last else 0), ch, 0.4, cutoff=2600, attack=0.05)
                s.bass(bar, 0, ch, length * 4 - 0.25 + (2 if last else 0), 0.42)
                if ch == "Gadd9" and (last or i_bar == len(chords) - 2):
                    for j, nm in enumerate(["G4", "B4", "D5", "G5"]):
                        s.pluck(bar, j * 0.25, nm, 0.3, dur=2.6, pan=(j - 1.5) * 0.25, bright=0.75)
    s.bus["pluck"] = delay(s.bus["pluck"], s.beat * 0.75, feedback=0.3, mix=0.18)
    return s.mixdown(target=-17.0, fade_out=1.4 if fmt == "youtube" else 0.4, wets={"pad": 0.25, "pluck": 0.3, "drums": 0.08, "fx": 0.05, "bass": 0.0})


def main() -> None:
    cuts = json.load(open(os.path.join(ROOT, "src", "films", "cuts.json")))
    os.makedirs(OUT, exist_ok=True)
    for variant, compose in (("a", compose_a), ("b", compose_b)):
        for fmt in ("youtube", "reel"):
            sections = [(sid, float(bars)) for sid, bars in cuts[variant][fmt]]
            mix = compose(sections, fmt)
            path = os.path.join(OUT, f"{variant}-{fmt}.wav")
            write_wav(path, mix)
            print(f"{variant}-{fmt}: {len(mix) / SR:6.2f}s  {lufs(mix):6.1f} LUFS  peak {20 * np.log10(np.max(np.abs(mix))):5.1f} dBFS")


if __name__ == "__main__":
    main()
