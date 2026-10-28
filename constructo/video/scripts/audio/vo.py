"""Voiceover for film C, made with Google Cloud Text-to-Speech.

  voices     list the voices Google offers for the cast's languages
  audition   every candidate voice says its own name and a sample line →
             out/vo/audition/<lang>.mp3 (one file per language, easy to play on a phone)
  make       synthesize every line of src/films/c/vo.json (cached in out/vo/cache), lay
             the lines on the cut sheet → public/audio/vo/c-<format>.wav, duck the score
             under them → public/audio/music/c-<format>-ducked.wav, write captions →
             out/final/NeevC-<Format>.srt, and report any line that overruns its slot.
  duck       only duck the score under an existing public/audio/vo/c-<format>.wav
             (for a recorded voiceover, lined up with the film at 48 kHz).

The cast is vo.json's "cast", or --narrator / --owner / --site voice names (saved
back to vo.json). The API key is read from GOOGLE_TTS_API_KEY and never printed.

Run:  uv run --with numpy --with scipy python scripts/audio/vo.py audition
      uv run --with numpy --with scipy python scripts/audio/vo.py make --narrator en-IN-Chirp3-HD-Aoede
Then: VO=1 node scripts/render.mjs NeevC-YouTube NeevC-Reel && scripts/finish.sh out/films/NeevC-*.mp4
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from math import gcd

import numpy as np
from scipy import signal
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, bandpass, highpass, lufs, samples, to_stereo, write_wav  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VO_JSON = os.path.join(ROOT, "src", "films", "c", "vo.json")
CUTS = os.path.join(ROOT, "src", "films", "cuts.json")
CACHE = os.path.join(ROOT, "out", "vo", "cache")
AUDITION = os.path.join(ROOT, "out", "vo", "audition")
VO_OUT = os.path.join(ROOT, "public", "audio", "vo")
MUSIC = os.path.join(ROOT, "public", "audio", "music")
FINAL = os.path.join(ROOT, "out", "final")
API = "https://texttospeech.googleapis.com/v1"
FORMAT_NAME = {"youtube": "YouTube", "reel": "Reel"}

# Voice families from most to least natural.
TIERS = ("Chirp3-HD", "Chirp-HD", "Neural2", "Wavenet", "Standard")
# Chirp 3: HD voices to audition first (the rest with --all).
PREFERRED = {
    "FEMALE": ["Aoede", "Kore", "Leda", "Sulafat", "Achernar", "Zephyr", "Despina", "Gacrux"],
    "MALE": ["Charon", "Fenrir", "Orus", "Iapetus", "Algieba", "Puck", "Rasalgethi", "Sadaltager"],
}
SAMPLE = {
    "en-IN": "Every family building a home has heard this. Neev keeps every one of them, as one honest record of your home.",
    "hi-IN": "काम कैसा चल रहा है? … सब ठीक है, सर।",
}
KEY_HELP = """Google refused the request. Check that
  - GOOGLE_TTS_API_KEY is set for this environment (cloud environment menu → Edit, under
    Network secrets or environment variables); only sessions started after saving see it;
  - the key's Google Cloud project has the Cloud Text-to-Speech API enabled and billing on;
  - the key's API restrictions allow Cloud Text-to-Speech."""


class TtsError(Exception):
    def __init__(self, code: int, detail: str):
        super().__init__(f"HTTP {code}: {detail[:500]}")
        self.code = code
        self.detail = detail


def api(path: str, body: dict | None = None) -> dict:
    headers = {"Content-Type": "application/json; charset=utf-8"}
    key = os.environ.get("GOOGLE_TTS_API_KEY", "").strip()
    if key:
        headers["X-Goog-Api-Key"] = key
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(f"{API}/{path}", data=data, headers=headers, method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise TtsError(e.code, e.read().decode("utf-8", "replace")) from None


def call(path: str, body: dict | None = None) -> dict:
    try:
        return api(path, body)
    except TtsError as e:
        if e.code in (401, 403):
            sys.exit(f"{e}\n\n{KEY_HELP}")
        raise


def tier(name: str) -> int:
    return next((i for i, t in enumerate(TIERS) if f"-{t}-" in name), len(TIERS))


def voices(lang: str) -> list[dict]:
    vs = [v for v in call(f"voices?languageCode={lang}").get("voices", []) if lang in v.get("languageCodes", [])]
    return sorted(vs, key=lambda v: (tier(v["name"]), v["name"]))


def short(name: str) -> str:
    return name.rsplit("-", 1)[-1]


# ----------------------------------------------------------------- synthesis


def synth(text: str, voice: str, lang: str, rate: float = 1.0) -> tuple[int, np.ndarray]:
    """One line as (sample rate, mono float), cached by everything that shapes it."""
    tag = hashlib.sha1(json.dumps([text, voice, lang, rate], ensure_ascii=False).encode()).hexdigest()[:16]
    path = os.path.join(CACHE, f"{tag}.wav")
    if not os.path.exists(path):
        body = {"input": {"text": text}, "voice": {"languageCode": lang, "name": voice}, "audioConfig": {"audioEncoding": "LINEAR16"}}
        if rate != 1.0:
            body["audioConfig"]["speakingRate"] = rate
        try:
            resp = call("text:synthesize", body)
        except TtsError as e:
            if rate != 1.0 and e.code == 400 and "rate" in e.detail.lower():
                print(f"  {short(voice)} does not take a speaking rate; using its natural pace")
                body["audioConfig"].pop("speakingRate")
                resp = call("text:synthesize", body)
            else:
                raise
        os.makedirs(CACHE, exist_ok=True)
        with open(path, "wb") as f:
            f.write(base64.b64decode(resp["audioContent"]))
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / (32768.0 if np.issubdtype(x.dtype, np.integer) else 1.0)
    if x.ndim == 2:
        x = x.mean(axis=1)
    return sr, x


def trim(x: np.ndarray, floor_db: float = -50.0, head: float = 0.04, tail: float = 0.12) -> np.ndarray:
    hop = samples(0.01)
    n = len(x) // hop
    if n == 0:
        return x
    rms = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1))
    on = np.flatnonzero(rms > 10 ** (floor_db / 20))
    if not len(on):
        return x
    a = max(0, on[0] * hop - samples(head))
    b = min(len(x), (on[-1] + 1) * hop + samples(tail))
    return x[a:b]


def prepare(sr: int, x: np.ndarray, fx: str | None) -> np.ndarray:
    """Resample, trim, clean and level one line; returns stereo at SR."""
    if sr != SR:
        g = gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g)
    x = highpass(trim(x), 70)
    if fx == "phone":
        x = bandpass(x, 320, 3400, order=4)
        x = np.tanh(2.2 * x) / np.tanh(2.2)
    st = to_stereo(x)
    level = lufs(st)
    target = -21.0 if fx == "phone" else -18.0
    if np.isfinite(level):
        st = st * 10 ** ((target - level) / 20)
    return st


# ------------------------------------------------------------------ commands


def load_vo() -> dict:
    with open(VO_JSON, encoding="utf-8") as f:
        return json.load(f)


def save_vo(vo: dict) -> None:
    """Write vo.json back in its one-line-per-cue layout."""
    out = ["{", f'  "note": {json.dumps(vo["note"], ensure_ascii=False)},', '  "cast": {']
    cast = list(vo["cast"].items())
    out += [f'    "{k}": {json.dumps(v, ensure_ascii=False)}' + ("," if i < len(cast) - 1 else "") for i, (k, v) in enumerate(cast)]
    out.append("  },")
    for fi, fmt in enumerate(("youtube", "reel")):
        out.append(f'  "{fmt}": [')
        out += ["    " + json.dumps(c, ensure_ascii=False) + ("," if i < len(vo[fmt]) - 1 else "") for i, c in enumerate(vo[fmt])]
        out.append("  ]" + ("," if fi == 0 else ""))
    out.append("}")
    with open(VO_JSON, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


def cmd_voices(args) -> None:
    for lang in sorted({c["lang"] for c in load_vo()["cast"].values()}):
        print(f"\n{lang}")
        for v in voices(lang):
            print(f"  {v['name']:34s} {v.get('ssmlGender', ''):7s} {v.get('naturalSampleRateHertz', '')}")


def pick_candidates(lang: str, everything: bool) -> list[dict]:
    vs = voices(lang)
    best = min((tier(v["name"]) for v in vs), default=len(TIERS))
    vs = [v for v in vs if tier(v["name"]) == best]
    if everything or best != 0:
        return vs
    by_name = {short(v["name"]): v for v in vs}
    chosen = [by_name[n] for g in ("FEMALE", "MALE") for n in PREFERRED[g] if n in by_name]
    return chosen or vs


def cmd_audition(args) -> None:
    os.makedirs(AUDITION, exist_ok=True)
    gap = np.zeros((samples(0.9), 2))
    for lang in sorted({c["lang"] for c in load_vo()["cast"].values()}):
        reel = []
        cands = pick_candidates(lang, args.all)
        print(f"{lang}: {len(cands)} voices")
        for v in cands:
            name = short(v["name"])
            intro = name if lang.startswith("en") else f"{name}."
            clip = prepare(*synth(f"{intro}. {SAMPLE[lang]}" if lang.startswith("en") else f"{intro} {SAMPLE[lang]}", v["name"], lang, args.rate), None)
            write_wav(os.path.join(AUDITION, f"{v['name']}.wav"), clip)
            reel += [clip, gap]
            print(f"  {v['name']:34s} {v.get('ssmlGender', '')}")
        both = np.concatenate(reel) if reel else gap
        wav = os.path.join(AUDITION, f"{lang}.wav")
        write_wav(wav, both)
        mp3 = wav[:-4] + ".mp3"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-b:a", "160k", mp3], check=True)
        print(f"  → {os.path.relpath(mp3, ROOT)} ({len(both) / SR:.0f}s)")


def section_times(fmt: str) -> tuple[dict, float]:
    with open(CUTS, encoding="utf-8") as f:
        cuts = json.load(f)["c"]
    bar = 240 / cuts["bpm"]
    spans, t = {}, 0.0
    for sid, bars in cuts[fmt]:
        spans[sid] = (t, t + bars * bar)
        t += bars * bar
    return spans, t


def duck(music: np.ndarray, vo: np.ndarray, depth_db: float = -9.0) -> np.ndarray:
    """Pull the score down under speech: opens 120 ms early, holds 350 ms after."""
    hop = samples(0.01)
    n = min(len(music), len(vo)) // hop
    rms = np.sqrt(np.mean(np.abs(vo[: n * hop]).max(axis=1).reshape(n, hop) ** 2, axis=1))
    speech = (rms > 10 ** (-45 / 20)).astype(float)
    pre, post = 12, 35
    mask = np.convolve(speech, np.ones(pre + post + 1))[pre : pre + n] > 0
    db = np.convolve(depth_db * mask, np.ones(15) / 15, mode="same")
    gain = np.repeat(10 ** (db / 20), hop)
    out = music.copy()
    out[: len(gain)] *= gain[:, None]
    return out


def read_wav(path: str) -> np.ndarray:
    sr, x = wavfile.read(path)
    if sr != SR:
        sys.exit(f"{os.path.relpath(path, ROOT)} is {sr} Hz; it needs to be {SR} Hz.")
    x = x.astype(np.float64) / (32768.0 if np.issubdtype(x.dtype, np.integer) else 1.0)
    return to_stereo(x)


def duck_score(fmt: str, voice: np.ndarray) -> None:
    music_path = os.path.join(MUSIC, f"c-{fmt}.wav")
    if not os.path.exists(music_path):
        sys.exit(f"{os.path.relpath(music_path, ROOT)} is missing; run scripts/audio/score.py c first.")
    write_wav(os.path.join(MUSIC, f"c-{fmt}-ducked.wav"), duck(read_wav(music_path), voice))


def cmd_duck(args) -> None:
    for fmt in args.formats:
        path = os.path.join(VO_OUT, f"c-{fmt}.wav")
        if not os.path.exists(path):
            sys.exit(f"{os.path.relpath(path, ROOT)} is missing.")
        duck_score(fmt, read_wav(path))
        print(f"{fmt}: score ducked under {os.path.relpath(path, ROOT)}")


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3_600_000:02d}:{ms // 60_000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def cmd_make(args) -> None:
    vo = load_vo()
    cast = vo["cast"]
    for role in ("narrator", "owner", "site"):
        name = getattr(args, role)
        if name:
            cast[role]["voice"] = name
    missing = [r for r, c in cast.items() if not c.get("voice")]
    if missing:
        sys.exit(f"No voice chosen for: {', '.join(missing)}. Run `audition`, then pass e.g. --narrator en-IN-Chirp3-HD-Aoede.")
    save_vo(vo)
    os.makedirs(VO_OUT, exist_ok=True)
    os.makedirs(FINAL, exist_ok=True)
    for fmt in args.formats:
        spans, total = section_times(fmt)
        track = np.zeros((samples(total), 2))
        cues = []
        for cue in vo[fmt]:
            role = cue.get("role", "narrator")
            voice, lang = cast[role]["voice"], cast[role]["lang"]
            clip = prepare(*synth(cue["text"], voice, lang, args.rate if role == "narrator" else 1.0), cue.get("fx"))
            start = spans[cue["section"]][0] + cue["at"]
            i = samples(start)
            j = min(len(track), i + len(clip))
            track[i:j] += clip[: j - i]
            cues.append({**cue, "start": start, "end": start + len(clip) / SR})
        peak = np.max(np.abs(track))
        if peak > 0.97:
            track *= 0.97 / peak
        write_wav(os.path.join(VO_OUT, f"c-{fmt}.wav"), track)

        duck_score(fmt, track)

        with open(os.path.join(FINAL, f"NeevC-{FORMAT_NAME[fmt]}.srt"), "w", encoding="utf-8") as f:
            for k, c in enumerate(cues, 1):
                f.write(f"{k}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{c['text']}\n\n")

        print(f"\n{fmt}: {len(cues)} lines, VO {lufs(track):.1f} LUFS")
        print(f"  {'section':9s} {'at':>6s} {'plan':>5s} {'real':>5s}  room  text")
        for k, c in enumerate(cues):
            nxt = cues[k + 1]["start"] if k + 1 < len(cues) else total
            room = nxt - c["end"]
            flag = "  << overlaps the next line" if room < 0 else ("  < tight" if room < 0.15 else "")
            print(f"  {c['section']:9s} {c['start']:6.2f} {c.get('dur', 0):5.1f} {c['end'] - c['start']:5.1f} {room:5.2f}  {c['text'][:56]}{flag}")
    print("\nNext: VO=1 node scripts/render.mjs NeevC-YouTube NeevC-Reel && scripts/finish.sh out/films/NeevC-*.mp4")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("voices")
    a = sub.add_parser("audition")
    a.add_argument("--all", action="store_true", help="every voice of the best family, not just the shortlist")
    a.add_argument("--rate", type=float, default=1.0)
    m = sub.add_parser("make")
    m.add_argument("--narrator")
    m.add_argument("--owner")
    m.add_argument("--site")
    m.add_argument("--rate", type=float, default=1.0, help="narrator speaking rate (0.9 = slower)")
    m.add_argument("--formats", nargs="+", default=["youtube", "reel"], choices=["youtube", "reel"])
    d = sub.add_parser("duck")
    d.add_argument("--formats", nargs="+", default=["youtube", "reel"], choices=["youtube", "reel"])
    args = ap.parse_args()
    {"voices": cmd_voices, "audition": cmd_audition, "make": cmd_make, "duck": cmd_duck}[args.cmd](args)


if __name__ == "__main__":
    main()
