"""Pure parser for a WhatsApp 'Export Chat' ``_chat.txt`` file (iOS format).

No I/O, no DB, no network — just text in, structured ``ParsedMessage`` rows out,
so it is cheap to unit-test. The orchestrator (``import_whatsapp_export.py``)
turns these rows into ``RawMessage`` ingests.

iOS export line shape (with assorted invisible bidi marks that WhatsApp injects)::

    [4/16/24, 8:38:16 PM] Saurabh Pandey: ‎MR. ASHOK TRIPATHI-G.F PLAN .pdf ‎document omitted
    ‎[6/3/26, 9:09:23 AM] ‪+91 89603 69529‬: ‎image omitted
    [4/16/24, 9:14:38 PM] Anil Tripathi: Thanks! Design changes kab discuss kare?

A message can span multiple physical lines; any line that does not start with a
``[date, time]`` header is a continuation of the previous message's body.

Media appears two ways depending on whether the export included attachments:
  - WITH media:    ``‎<attached: 00000123-PHOTO-2024-...jpg>``
  - WITHOUT media: ``‎image omitted`` / ``document omitted`` / ``video omitted`` …

Timestamps are interpreted in **Asia/Kolkata** (the exporting phone's local time)
so that each event's calendar day matches what the humans actually saw.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# Bidi / formatting marks WhatsApp sprinkles around senders, bodies, phone numbers.
_BIDI_CHARS = "‎‏‪‫‬⁦⁧⁨⁩"
_BIDI_RE = re.compile(f"[{_BIDI_CHARS}]")

# [M/D/YY, h:mm:ss AM] Sender: body   (leading bidi marks optional; sender non-greedy)
_HEADER_RE = re.compile(
    r"^[" + _BIDI_CHARS + r"]*"
    r"\[(?P<m>\d{1,2})/(?P<d>\d{1,2})/(?P<y>\d{2,4}),\s*"
    r"(?P<hh>\d{1,2}):(?P<mm>\d{2}):(?P<ss>\d{2})\s*(?P<ap>[AaPp][Mm])\]\s*"
    r"(?P<sender>.+?):\s(?P<body>.*)$"
)

_ATTACH_RE = re.compile(r"<attached:\s*(?P<file>[^>]+)>")
_OMITTED_RE = re.compile(
    r"(?P<kind>image|video|audio|sticker|GIF|document|Contact card)\s+omitted",
    re.IGNORECASE,
)

# Substrings/patterns that mark a WhatsApp *system* notice (not a human message).
_SYSTEM_SUBSTRINGS = (
    "Messages and calls are end-to-end encrypted",
    "created this group",
    "created group",
    "added you",
    "changed the subject",
    "changed this group's icon",
    "changed the group description",
    "changed their phone number",
    "joined using this group's invite link",
    "turned on admin approval",
    "You're now an admin",
    "now an admin",
    "pinned a message",
    "This message was deleted",
    "You deleted this message",
)
# "<X> added <Y>" / "<X> left" / "<X> removed <Y>" join-notices (no media, short).
_JOIN_NOTICE_RE = re.compile(r"^.+?\s(added|removed|left)\b.*$")

_EXT_KIND = {
    "jpg": "image", "jpeg": "image", "png": "image", "webp": "image",
    "gif": "video", "heic": "image", "heif": "image",
    "mp4": "video", "mov": "video", "3gp": "video", "avi": "video",
    "opus": "voice", "m4a": "voice", "mp3": "voice", "ogg": "voice",
    "aac": "voice", "wav": "voice",
    "pdf": "document", "doc": "document", "docx": "document",
    "xls": "document", "xlsx": "document", "ppt": "document", "pptx": "document",
    "vcf": "document", "txt": "document", "csv": "document",
}
_OMITTED_KIND = {
    "image": "image", "video": "video", "audio": "voice", "sticker": "image",
    "gif": "video", "document": "document", "contact card": "document",
}


@dataclass
class ParsedMessage:
    sent_at: datetime          # tz-aware, Asia/Kolkata
    sender: str                # display name or phone, bidi-stripped
    text: str | None           # human text (None if pure media)
    media_filename: str | None  # set only for WITH-media exports
    media_kind: str | None     # 'image' | 'video' | 'voice' | 'document' | None
    is_system: bool
    line_no: int               # 1-based line where the message header was found


def strip_bidi(s: str) -> str:
    # Normalise the odd spaces WhatsApp uses (NBSP, narrow NBSP) to plain spaces.
    s = s.replace(" ", " ").replace(" ", " ")
    return _BIDI_RE.sub("", s).strip()


def normalize_sender(sender: str) -> str:
    """Clean a sender for role-mapping: drop WhatsApp's ``~ `` non-contact marker."""
    s = strip_bidi(sender)
    if s.startswith("~ "):
        s = s[2:].strip()
    elif s.startswith("~"):
        s = s[1:].strip()
    return s


def _build_dt(m: re.Match[str]) -> datetime:
    year = int(m["y"])
    if year < 100:
        year += 2000
    hour = int(m["hh"]) % 12
    if m["ap"].upper() == "PM":
        hour += 12
    return datetime(year, int(m["m"]), int(m["d"]), hour, int(m["mm"]), int(m["ss"]), tzinfo=IST)


def _looks_system(body_clean: str, has_media: bool) -> bool:
    if any(s in body_clean for s in _SYSTEM_SUBSTRINGS):
        return True
    # Conservative join-notice catch: only short, media-less lines.
    if not has_media and len(body_clean) < 48 and _JOIN_NOTICE_RE.match(body_clean):
        return True
    return False


def _classify(dt: datetime, sender: str, body: str, line_no: int) -> ParsedMessage:
    media_filename: str | None = None
    media_kind: str | None = None

    attach = _ATTACH_RE.search(body)
    if attach:
        media_filename = strip_bidi(attach["file"])
        ext = media_filename.rsplit(".", 1)[-1].lower() if "." in media_filename else ""
        media_kind = _EXT_KIND.get(ext, "document")
        text = strip_bidi(_ATTACH_RE.sub("", body)) or None
    else:
        body_clean = strip_bidi(body)
        omitted = _OMITTED_RE.search(body_clean)
        if omitted:
            media_kind = _OMITTED_KIND.get(omitted["kind"].lower(), "document")
            text = strip_bidi(_OMITTED_RE.sub("", body_clean)) or None
        else:
            text = body_clean or None

    body_for_system = strip_bidi(body)
    is_system = _looks_system(body_for_system, has_media=media_kind is not None)
    return ParsedMessage(dt, sender, text, media_filename, media_kind, is_system, line_no)


def parse_chat(raw_text: str) -> list[ParsedMessage]:
    """Parse a full ``_chat.txt`` into ordered ``ParsedMessage`` rows."""
    pending: list[object] | None = None  # [dt, sender, body, line_no]
    records: list[list[object]] = []

    for i, line in enumerate(raw_text.splitlines(), start=1):
        header = _HEADER_RE.match(line)
        if header:
            if pending is not None:
                records.append(pending)
            pending = [_build_dt(header), normalize_sender(header["sender"]), header["body"], i]
        elif pending is not None:
            pending[2] = f"{pending[2]}\n{line}"  # continuation line
    if pending is not None:
        records.append(pending)

    return [_classify(dt, sender, body, line_no) for dt, sender, body, line_no in records]
