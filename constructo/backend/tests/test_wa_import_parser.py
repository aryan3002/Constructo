"""Unit tests for the WhatsApp export parser (scripts/wa_import_parser.py)."""
from __future__ import annotations

import os

import pytest

from scripts.wa_import_parser import IST, parse_chat


def test_basic_text_message():
    msgs = parse_chat(
        "[4/16/24, 9:14:38 PM] Anil Tripathi: Thanks! Design changes kab discuss kare?"
    )
    assert len(msgs) == 1
    m = msgs[0]
    assert m.sender == "Anil Tripathi"
    assert m.text == "Thanks! Design changes kab discuss kare?"
    assert m.media_kind is None
    assert m.is_system is False
    assert m.sent_at.year == 2024 and m.sent_at.month == 4 and m.sent_at.day == 16
    assert m.sent_at.hour == 21 and m.sent_at.minute == 14  # 9:14 PM -> 21:14
    assert m.sent_at.tzinfo == IST


def test_am_pm_and_midnight_noon():
    msgs = parse_chat(
        "[1/2/25, 12:00:00 AM] A: midnight\n"
        "[1/2/25, 12:30:00 PM] A: noon-ish"
    )
    assert msgs[0].sent_at.hour == 0
    assert msgs[1].sent_at.hour == 12


def test_multiline_message_is_joined():
    raw = (
        "[5/1/25, 10:00:00 AM] Er Lokesh Kumar Sharma: Line one\n"
        "continued line two\n"
        "and line three\n"
        "[5/1/25, 10:01:00 AM] Anil Tripathi: next message"
    )
    msgs = parse_chat(raw)
    assert len(msgs) == 2
    assert msgs[0].text == "Line one\ncontinued line two\nand line three"
    assert msgs[1].text == "next message"


def test_without_media_omitted_placeholders():
    raw = (
        "‎[6/3/26, 9:09:23 AM] ‪+91 89603 69529‬: ‎image omitted\n"
        "‎[6/3/26, 9:10:00 AM] Saurabh Pandey: ‎video omitted\n"
        "‎[4/16/24, 8:38:16 PM] Saurabh Pandey: MR. ASHOK TRIPATHI-G.F PLAN .pdf ‎document omitted"
    )
    msgs = parse_chat(raw)
    assert msgs[0].sender == "+91 89603 69529"  # bidi marks stripped
    assert msgs[0].media_kind == "image"
    assert msgs[0].text is None
    assert msgs[1].media_kind == "video"
    # filename text preserved alongside the 'document omitted' marker
    assert msgs[2].media_kind == "document"
    assert "G.F PLAN" in (msgs[2].text or "")


def test_with_media_attached_filenames():
    raw = (
        "‎[4/16/24, 8:38:16 PM] Saurabh Pandey: ‎<attached: 00000004-MR ASHOK G.F PLAN.pdf>\n"
        "‎[6/3/26, 9:09:23 AM] +91 89603 69529: ‎<attached: 00000123-PHOTO-2026-06-03.jpg>\n"
        "‎[6/3/26, 9:10:00 AM] X: ‎<attached: 00000999-AUDIO-2026.opus>"
    )
    msgs = parse_chat(raw)
    assert msgs[0].media_kind == "document"
    assert msgs[0].media_filename == "00000004-MR ASHOK G.F PLAN.pdf"
    assert msgs[1].media_kind == "image"
    assert msgs[1].media_filename == "00000123-PHOTO-2026-06-03.jpg"
    assert msgs[2].media_kind == "voice"


def test_system_messages_flagged():
    raw = (
        "[4/15/24, 8:52:07 AM] Group: ‎Messages and calls are end-to-end encrypted. "
        "Only people in this chat can read them.\n"
        "[4/15/24, 8:52:07 AM] Saurabh Pandey: ‎Saurabh Pandey created this group\n"
        "[4/15/24, 9:04:17 AM] Group: ‎Ashok added you\n"
        "[4/15/24, 9:05:00 AM] Anil Tripathi: 32 mazdoor aaye aaj"
    )
    msgs = parse_chat(raw)
    assert msgs[0].is_system is True
    assert msgs[1].is_system is True
    assert msgs[2].is_system is True
    assert msgs[3].is_system is False  # a real construction message survives


def test_real_construction_text_not_misflagged_as_system():
    # "added" appears in normal speech; only short join-notices should be system.
    raw = "[5/1/25, 10:00:00 AM] Er Lokesh: We added two more masons today and poured the slab"
    msgs = parse_chat(raw)
    assert msgs[0].is_system is False


@pytest.mark.skipif(
    not os.path.exists("/tmp/wa_inspect/_chat.txt"),
    reason="real export sample not extracted",
)
def test_smoke_real_export():
    with open("/tmp/wa_inspect/_chat.txt", encoding="utf-8") as fh:
        msgs = parse_chat(fh.read())
    # ~4,000 messages over the real project history.
    assert len(msgs) > 3500
    senders = {m.sender for m in msgs}
    assert "Er Lokesh Kumar Sharma" in senders
    assert "Anil Tripathi" in senders
    # Dates span 2024 -> 2026.
    years = {m.sent_at.year for m in msgs}
    assert {2024, 2025, 2026} <= years
    # Some media of each kind got recognised.
    kinds = {m.media_kind for m in msgs if m.media_kind}
    assert "document" in kinds  # the 18 PDFs
