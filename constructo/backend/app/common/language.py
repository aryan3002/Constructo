"""Shared helper: turn a user's account language into an explicit LLM directive.

The owner brief and the Nivaan/@ask grounded answer both render through an LLM.
Without a directive the model drifts (an English-preferring owner was getting a
Hindi brief). This maps the stored ``user.language`` to a one-line instruction;
an unknown/None language falls back to mirroring the user's own wording.
"""
from __future__ import annotations


def language_instruction(language: str | None) -> str:
    """A directive telling the LLM which language to write its response in,
    keyed off the recipient's account language. Falls back to "mirror the user"
    when the language is unknown so we never force the wrong one."""
    if language == "en":
        return "Write your response in clear English."
    if language == "hi":
        return "Write your response in simple Hindi (Devanagari script)."
    return "Mirror the user's language (Hindi/Hinglish/English)."
