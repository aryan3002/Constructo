"""Deterministic post-ASR numeral repair for Hindi / Hinglish transcripts.

Indian-language STT (Whisper, and later Sarvam — see the provider seam note in
:mod:`app.extraction.stt`) is good enough to *draft* a transcript but routinely
mangles **numbers**, which is exactly where a construction site cares most:
"do sau assi bori" (280 bags) heard as words, or "280" heard as "218". A single
wrong numeral at a money/quantity moment is a real loss (CA6), so this pass runs
**before** classification/extraction to normalise spoken Hindi/Hinglish number
words into digits — *deterministically*, never with a model.

What it does (and only this):
  * Convert spoken number words to digits: ``"do sau assi"`` -> ``"280"``,
    ``"teen hazaar"`` -> ``"3000"``, ``"paanch sau"`` -> ``"500"``.
  * Leave every non-number token exactly as spoken (jargon, English nouns,
    punctuation) so the downstream classifier still sees clean text.
  * Leave clean digit strings ("280", "45000") untouched.

What it deliberately does NOT do (CA1/CA6 — AI proposes, human commits):
  * It never *guesses* a number it cannot parse with certainty. If a run of
    number words is ambiguous (e.g. ``"do teen"``) it is left as words so the
    extractor's confidence stays low and the ``CLARIFY_THRESHOLD`` gate asks a
    human, rather than emitting a confident but wrong number at a money moment.

The repair is provider-neutral and side-effect-free: string in, string out. It
is the "LAYER 2 normalise" step described in ``05 - Data and AI Pipelines`` §6.2,
implemented as a deterministic numeral pass (the construction-jargon lexicon /
LLM correction layer is a separate, later concern).
"""
from __future__ import annotations

import re

# --- spoken-number lexicon (Hindi romanisations + common ASR/spelling variants).
# Values 0..99. Spellings cover the usual variants ("panch"/"paanch",
# "assi"/"asi", "char"/"chaar").
_UNITS: dict[str, int] = {
    "zero": 0, "shoonya": 0, "sunya": 0,
    "ek": 1,
    "do": 2,
    "teen": 3, "tin": 3,
    "char": 4, "chaar": 4,
    "panch": 5, "paanch": 5, "panj": 5,
    "che": 6, "chhe": 6, "chhah": 6, "chah": 6,
    "saat": 7, "sat": 7,
    "aath": 8, "ath": 8,
    "nau": 9,
    "das": 10, "dus": 10,
    "gyarah": 11, "gyaarah": 11,
    "barah": 12, "baarah": 12,
    "terah": 13,
    "chaudah": 14,
    "pandrah": 15,
    "solah": 16,
    "satrah": 17,
    "atharah": 18,
    "unnis": 19, "unnees": 19,
    "bees": 20, "bis": 20,
    "pachees": 25, "pachis": 25,
    "tees": 30, "tis": 30,
    "chalis": 40, "chaalis": 40,
    "pachas": 50, "pachaas": 50,
    "saath": 60, "sath": 60,
    "sattar": 70,
    "assi": 80, "asi": 80,
    "nabbe": 90, "nabbey": 90,
}

# Scale / multiplier words mapped to their magnitudes.
_SCALES: dict[str, int] = {
    "sau": 100, "saw": 100,
    "hazaar": 1000, "hazar": 1000, "hajar": 1000, "hajaar": 1000,
    "lakh": 100_000, "laakh": 100_000, "lac": 100_000,
    "crore": 10_000_000, "karod": 10_000_000, "karor": 10_000_000,
}

_NUMBER_WORDS = set(_UNITS) | set(_SCALES)

# Tokeniser: contiguous letters (Latin or Devanagari), digit runs, or any other
# run (spaces/punctuation) preserved verbatim so original spacing is re-emitted.
_TOKEN_RE = re.compile(r"[A-Za-zऀ-ॿ]+|\d+|[^A-Za-z0-9ऀ-ॿ]+")


def _is_number_word(token: str) -> bool:
    return token.lower() in _NUMBER_WORDS


def _eval_run(words: list[str]) -> int | None:
    """Evaluate a contiguous run of spoken number words to an integer.

    Standard Indian additive/multiplicative grammar:
      - a sub-100 unit before ``sau`` multiplies the hundreds place;
      - ``hazaar``/``lakh``/``crore`` close out the lower portion and scale it;
      - bare units accumulate.

    Returns ``None`` if the run is ambiguous (two bare units in a row, e.g.
    "do teen"), so the caller leaves it as words rather than guess (CA1/CA6).

    Examples::

        do sau assi          -> 280
        teen hazaar          -> 3000
        teen hazaar do sau   -> 3200
        paanch sau           -> 500
    """
    if not words:
        return None

    result = 0          # sum of completed >= 1000 place groups
    group = 0           # accumulated hundreds-and-below for the current group
    pending_unit = 0    # a bare unit awaiting a scale or the run's end
    have_pending = False
    saw_any = False

    for w in words:
        lw = w.lower()
        if lw in _UNITS:
            if have_pending:
                return None  # "do teen" -> ambiguous, refuse to guess
            pending_unit = _UNITS[lw]
            have_pending = True
            saw_any = True
        elif lw in _SCALES:
            scale = _SCALES[lw]
            unit = pending_unit if have_pending else 1
            if scale >= 1000:
                base = group + (pending_unit if have_pending else 0)
                if base == 0:
                    base = 1
                result += base * scale
                group = 0
            else:  # sau (100)
                group += unit * scale
            pending_unit = 0
            have_pending = False
            saw_any = True
        else:  # pragma: no cover - caller only passes number words
            return None

    if not saw_any:
        return None
    return result + group + (pending_unit if have_pending else 0)


def repair_numerals(text: str) -> str:
    """Return ``text`` with spoken Hindi/Hinglish number words turned into digits.

    Non-number text (jargon, English nouns, punctuation, spacing) is preserved
    verbatim. Clean digit strings pass through unchanged. Ambiguous number runs
    are left as words so the downstream ``CLARIFY_THRESHOLD`` gate can ask a
    human rather than emit a confident wrong number (CA1/CA6).
    """
    if not text:
        return text

    tokens = _TOKEN_RE.findall(text)
    out: list[str] = []
    i = 0
    n = len(tokens)
    while i < n:
        tok = tokens[i]
        if _is_number_word(tok):
            # Gather a contiguous run of number words separated only by single
            # whitespace separators; re-emit one space-joined digit.
            run_words = [tok]
            j = i + 1
            while j < n:
                nxt = tokens[j]
                if (
                    nxt.strip() == ""
                    and j + 1 < n
                    and _is_number_word(tokens[j + 1])
                ):
                    j += 1  # whitespace between two number words: skip it
                    continue
                if _is_number_word(nxt):
                    run_words.append(nxt)
                    j += 1
                    continue
                break
            value = _eval_run(run_words)
            if value is not None:
                out.append(str(value))
            else:
                # Unparseable/ambiguous run: emit the ENTIRE run verbatim (with
                # its original spacing) rather than partially converting it,
                # which would be exactly the confident-wrong-number error the
                # CLARIFY gate exists to catch (CA1/CA6).
                out.extend(tokens[i:j])
            i = j
            continue
        out.append(tok)
        i += 1
    return "".join(out)
