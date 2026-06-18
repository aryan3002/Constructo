"""Import a real WhatsApp 'Export Chat' .zip into Constructo as a live company.

This turns your actual construction group (the TRIPATHI DREAM HOME chat) into a
loginnable company: every participant becomes a User with the role they really
play, every message is replayed through the real Azure extraction pipeline on
its ORIGINAL date, and media (PDFs / photos) is uploaded to the configured
storage backend (Cloudflare R2 in prod). Briefs + the search index are built so
the apps are populated on first open.

SAFE BY DEFAULT — a bare run only PARSES and prints a plan (no DB, no AI, no
upload, no cost). Add ``--run`` to actually import. ``--purge`` removes
everything this import created (DB rows + R2 objects) so you can wipe the test
data clean before going public.

Examples
--------
# Free dry-run — see the cast, message counts, date range, media tally:
    uv run python -m scripts.import_whatsapp_export --zip "/path/Chat.zip"

# Validate a small recent slice locally (cheap), with media:
    uv run python -m scripts.import_whatsapp_export --zip "/path/WithMedia.zip" \
        --since 2026-05-01 --run

# Full import into Neon + R2 (override env to point at prod):
    DATABASE_URL="postgresql+asyncpg://...neon...?ssl=require" \
    STORAGE_BACKEND=s3 \
    uv run python -m scripts.import_whatsapp_export --zip "/path/WithMedia.zip" --run

# Wipe it all clean (DB + R2) when done testing:
    DATABASE_URL="...neon..." STORAGE_BACKEND=s3 \
    uv run python -m scripts.import_whatsapp_export --purge

Idempotent: deterministic uuid5 ids + a skip-if-already-imported check, so
re-running the same export never duplicates.
"""
from __future__ import annotations

import argparse
import asyncio
import zipfile
from collections import Counter
from datetime import date
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import delete, func, select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.extraction.worker import handle_ingested
from app.ingestion.chat_seed import (
    classify_channel,
    get_or_create_conversations,
    seed_chat_message,
)
from app.models import (
    ChatMessage,
    Company,
    Conversation,
    ConversationRead,
    EventEmbedding,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    Milestone,
    MilestoneStatus,
    Property,
    PublishedPhoto,
    RawMessageModel,
    Site,
    SiteBaseline,
    SiteEventModel,
    Space,
    SpaceKind,
    Update,
    UpdateType,
    User,
    UserRole,
    WhatsappGroup,
)
from app.search.index import index_all_unindexed
from app.sites.models import SiteAssignment
from app.storage import get_storage
from scripts.wa_import_parser import ParsedMessage, parse_chat

# --------------------------------------------------------------------------- #
# CONFIG — edit freely. The role each chat participant really plays.           #
# Roles: owner | pm | supervisor | accountant | procurement | labor_contractor #
#        | homeowner                                                           #
# --------------------------------------------------------------------------- #
COMPANY_NAME = "CivilArch (CADS) — Lucknow"
SITE_NAME = "Tripathi Dream Home"
SITE_LOCATION = "Lucknow, UP"
SITE_TYPE = "residential"
EXTERNAL_GROUP_ID = "tripathi-dream-home"
SOURCE = "whatsapp_export"

# Contractor firm + on-site crew (CivilArch / CADS) and the homeowner family.
SENDER_ROLES: dict[str, str] = {
    # --- CivilArch / CADS firm ---
    "Saurabh Pandey": "owner",          # created the group → firm principal
    "Saurabh CivilArchGroup": "pm",
    "Anamika Civilarc": "architect",    # design team → architect role
    "Vikas Civilarch": "architect",
    "Mansi Kanojia": "architect",
    "prabha Civilarch": "accountant",
    "Civilarch Group": "pm",
    # --- on-site ---
    "Er Lokesh Kumar Sharma": "supervisor",   # site engineer (most active)
    "Rahul Priyadarshi": "procurement",
    "Adarsh": "labor_contractor",
    "+91 89603 69529": "supervisor",
    "+91 77040 02004": "labor_contractor",
    "+91 77030 04001": "supervisor",
    # --- homeowner family (Tripathi) ---
    "Ashok": "homeowner",               # MR. ASHOK TRIPATHI — co-owner
    "Anil Tripathi": "homeowner",       # most active homeowner → primary owner
    "Aryan": "homeowner",
}
DEFAULT_ROLE = "supervisor"  # any participant not listed above

HOMEOWNER_PRIMARY = "Anil Tripathi"  # who is the primary_owner; others become co_owner

# Media kinds we upload + run extraction on. Videos are skipped (the app doesn't
# use them and they are the bulk of the 3.3 GB). Voice has none in this export.
UPLOAD_KINDS = {"image", "document"}
EXTRACT_KINDS = {"document"}  # plus: any message that carries human text

_CONTENT_TYPE = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "webp": "image/webp", "heic": "image/heic", "gif": "image/gif",
    "pdf": "application/pdf", "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
_MEDIA_PREFIX = "wa-tripathi"  # R2/local key prefix (also used to scope purge)

NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _phone_for(index: int) -> str:
    """Deterministic, memorable login phone per participant (dev OTP 000000)."""
    return f"+9190000{10001 + index:05d}"


def _content_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _CONTENT_TYPE.get(ext, "application/octet-stream")


def _media_type_str(kind: str | None) -> str:
    return kind if kind in {"image", "video", "voice", "document"} else "text"


def _is_group_pseudo_sender(sender: str) -> bool:
    # The group itself posts system notices; real people/phones never contain '/'.
    return "/" in sender


# --------------------------------------------------------------------------- #
# Participant discovery + world building                                       #
# --------------------------------------------------------------------------- #
def discover_participants(messages: list[ParsedMessage]) -> dict[str, str]:
    """Map every real (non-system, non-group) sender → role, in first-seen order."""
    roles: dict[str, str] = {}
    for m in messages:
        if m.is_system or _is_group_pseudo_sender(m.sender):
            continue
        if m.sender not in roles:
            roles[m.sender] = SENDER_ROLES.get(m.sender, DEFAULT_ROLE)
    return roles


async def _upsert(session, model, ident: UUID, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


async def build_world(session, participants: dict[str, str]) -> dict:
    """Create company, site, every participant as a User, assignments + group map."""
    company = await _upsert(session, Company, _id("company"), name=COMPANY_NAME)
    await session.flush()

    site = await _upsert(
        session, Site, _id("site"),
        company_id=company.id, name=SITE_NAME, location=SITE_LOCATION,
        type=SITE_TYPE, status="active",
    )
    await session.flush()

    # Baseline lets the labor-shortfall risk fire once attendance is learned.
    await _upsert(
        session, SiteBaseline, _id("baseline"),
        site_id=site.id, expected_daily_headcount=None,
        notes="Auto-learned from imported attendance", updated_by=None,
    )

    users: dict[str, User] = {}
    phones: dict[str, str] = {}
    for i, (sender, role) in enumerate(participants.items()):
        phone = _phone_for(i)
        phones[sender] = phone
        # Phone is the unique login key. Reuse any pre-existing user with this
        # phone (e.g. an auto-login-minted owner from earlier testing, or a prior
        # import) instead of inserting a colliding new uuid5 id — then re-home it
        # to this company + real role. Keeps the import idempotent on phone.
        existing = (
            await session.execute(select(User).where(User.phone == phone))
        ).scalar_one_or_none()
        if existing is not None:
            existing.company_id = company.id
            existing.role = UserRole(role)
            existing.name = sender
            existing.language = "hi"
            existing.is_active = True
            users[sender] = existing
        else:
            users[sender] = await _upsert(
                session, User, _id("user", sender),
                company_id=company.id, phone=phone, role=UserRole(role),
                name=sender, language="hi",
            )
    await session.flush()
    # Capture the ACTUAL persisted ids (a reused user keeps its original id, which
    # differs from _id("user", sender)) so downstream stages resolve the right rows.
    user_ids: dict[str, UUID] = {s: users[s].id for s in participants}

    # Field/finance roles only see sites they are assigned to.
    for sender, role in participants.items():
        if role in {"owner", "pm", "homeowner"}:
            continue
        await _upsert(
            session, SiteAssignment, _id("assignment", sender),
            site_id=site.id, user_id=users[sender].id,
        )

    # Homeowner family → HomeownerMember rows (active, bound to their user) so the
    # homeowner app scopes them to this site.
    for sender, role in participants.items():
        if role != "homeowner":
            continue
        sub = (
            HomeownerSubRole.primary_owner
            if sender == HOMEOWNER_PRIMARY
            else HomeownerSubRole.co_owner
        )
        await _upsert(
            session, HomeownerMember, _id("member", sender),
            site_id=site.id, user_id=users[sender].id, sub_role=sub,
            notif_prefs={}, phone=phones[sender],
            join_code=f"TRIP-{sender.split()[0].upper()}",
            status=MemberStatus.active,
        )

    # WhatsApp group mapping kept for forward-compat (live bridging), even though
    # imported messages now flow in as in-app chat (source="app_chat"), not as
    # bare "whatsapp_export" raw rows.
    await _upsert(
        session, WhatsappGroup, _id("group"),
        company_id=company.id, site_id=site.id,
        external_group_id=EXTERNAL_GROUP_ID, source=SOURCE,
        label="Tripathi Dream Home — WhatsApp",
    )

    # The two per-site chat threads the history is seeded into: the crew "site"
    # thread (Blueprint) and the curated "homeowner" thread (Calm Cockpit).
    site_conv, homeowner_conv = await get_or_create_conversations(
        session, company_id=company.id, site_id=site.id
    )
    await session.commit()
    # Return plain, deterministic values — never ORM objects across sessions.
    return {
        "company_id": _id("company"),
        "site_id": _id("site"),
        "site_conv_id": site_conv.id,
        "homeowner_conv_id": homeowner_conv.id,
        "users": {s: {"id": user_ids[s], "phone": phones[s]} for s in participants},
    }


# --------------------------------------------------------------------------- #
# Message import                                                               #
# --------------------------------------------------------------------------- #
def _media_member_map(zf: zipfile.ZipFile) -> dict[str, str]:
    """basename → full member name, for on-demand media reads."""
    out: dict[str, str] = {}
    for name in zf.namelist():
        out[name.rsplit("/", 1)[-1]] = name
    return out


# Firm roles whose messages are ambiguous (could be client-facing OR crew-only),
# so they get one cheap LLM call to decide the channel. Homeowner/crew roles are
# routed deterministically by classify_channel and never need a call.
_LLM_CHANNEL_ROLES = {"owner", "pm", "architect", "accountant"}

_CHANNEL_SCHEMA = {"channel": "homeowner_facing | crew_internal"}
_CHANNEL_SYSTEM = (
    "Is this WhatsApp message from a construction firm directed at the "
    "client/homeowner (design choices, approvals, updates to the owner) or "
    "internal crew coordination? Return JSON."
)


async def _llm_channel_label(text: str | None) -> str | None:
    """One cheap classification call → "homeowner_facing"/"crew_internal" (or None).

    Used only for ambiguous firm-role messages. Any error returns None so the
    deterministic ``classify_channel`` fallback (crew "site") still applies.
    """
    if not text or not text.strip():
        return None
    try:
        out = await get_llm_client("cheap").complete(
            _CHANNEL_SYSTEM, text, _CHANNEL_SCHEMA
        )
        label = (out or {}).get("channel")
        return label if label in {"homeowner_facing", "crew_internal"} else None
    except Exception:
        return None


async def import_messages(
    world: dict, messages: list[ParsedMessage], zf: zipfile.ZipFile | None,
    *, opts: argparse.Namespace,
) -> dict[str, int]:
    users = world["users"]  # sender → {"id", "phone"}
    storage = get_storage()
    members = _media_member_map(zf) if zf is not None else {}
    counts = Counter()

    ingested = 0
    for m in messages:
        if m.is_system or _is_group_pseudo_sender(m.sender):
            counts["skipped_system"] += 1
            continue
        if opts.since and m.sent_at.date() < opts.since:
            continue
        if opts.until and m.sent_at.date() > opts.until:
            continue
        if opts.limit and ingested >= opts.limit:
            break

        client_msg_id = _id("cmsg", str(m.line_no))
        # Idempotency (channel-independent): a ChatMessage already seeded for THIS
        # site with this client_msg_id → skip entirely (no re-seed, no re-extract),
        # even if channel routing differs across runs.
        async with SessionLocal() as s:
            existing = (
                await s.execute(
                    select(ChatMessage.id)
                    .join(Conversation, ChatMessage.conversation_id == Conversation.id)
                    .where(
                        Conversation.site_id == world["site_id"],
                        ChatMessage.client_msg_id == client_msg_id,
                    )
                    .limit(1)
                )
            ).first()
            if existing is not None:
                counts["already_imported"] += 1
                ingested += 1
                continue

        user_info = users[m.sender]  # {"id", "phone"}
        role = SENDER_ROLES.get(m.sender, DEFAULT_ROLE)
        media_url: str | None = None
        media_mime: str | None = None
        media_type = _media_type_str(m.media_kind)

        # Upload media we care about (images + docs); skip video.
        if (
            not opts.no_media
            and m.media_kind in UPLOAD_KINDS
            and m.media_filename
            and zf is not None
            and m.media_filename in members
        ):
            try:
                data = zf.read(members[m.media_filename])
                key = f"{_MEDIA_PREFIX}/{m.media_filename}"
                media_mime = _content_type(m.media_filename)
                media_url = storage.put_bytes(key, data, media_mime)
                counts["media_uploaded"] += 1
            except Exception as exc:  # never let one bad file kill the run
                counts["media_failed"] += 1
                print(f"  ! media upload failed for {m.media_filename}: {exc}")

        # Channel routing: ambiguous firm roles get one cheap LLM label (skipped
        # when extraction is off); everyone else is deterministic.
        llm_label: str | None = None
        if role in _LLM_CHANNEL_ROLES and not opts.skip_extraction:
            llm_label = await _llm_channel_label(m.text)
        channel = classify_channel(
            sender_role=role, text=m.text, media_kind=m.media_kind, llm_label=llm_label,
        )
        sender_side = "homeowner" if role == "homeowner" else "contractor"

        conv_id = world["site_conv_id"] if channel == "site" else world["homeowner_conv_id"]
        raw_id = None
        async with SessionLocal() as s:
            conv = await s.get(Conversation, conv_id)
            user = await s.get(User, user_info["id"])
            msg = await seed_chat_message(
                s, conv=conv, user=user, text=m.text,
                media_url=media_url, media_mime=media_mime, media_type=media_type,
                sent_at=m.sent_at, client_msg_id=client_msg_id, sender_side=sender_side,
            )
            raw_id = msg.raw_message_id

            # Light up the homeowner feed: every image becomes a published photo
            # (vision captions arrive in a later pass).
            if m.media_kind == "image" and media_url is not None:
                pid = _id("photo", str(m.line_no))
                if await s.get(PublishedPhoto, pid) is None:
                    s.add(PublishedPhoto(
                        id=pid, site_id=world["site_id"], image_url=media_url,
                        caption=m.text, room_tag=None, milestone_id=None,
                        is_starred=False, published_by=user_info["id"],
                    ))
                    counts["photos_published"] += 1
            await s.commit()
        counts["chat_messages"] += 1
        counts["site_channel" if channel == "site" else "homeowner_channel"] += 1

        # Run real extraction off the bridged RawMessage when there is a human
        # caption OR a document (PDF) to read — the SAME pipeline, no double
        # extraction. A CAPTIONLESS photo is deliberately NOT text-extracted (it
        # would only yield a "no message provided" guess); the vision pass
        # (enrich_photos) captions it and creates its event with real content.
        should_extract = (
            not opts.skip_extraction
            and raw_id is not None
            and (bool(m.text and m.text.strip()) or m.media_kind in EXTRACT_KINDS)
        )
        if should_extract:
            try:
                event_ids = await handle_ingested(raw_id)
                counts["events"] += len(event_ids)
            except Exception as exc:
                counts["extract_failed"] += 1
                print(f"  ! extraction failed at line {m.line_no}: {exc}")
        ingested += 1

        if ingested % 100 == 0:
            print(
                f"  … {ingested} messages | {counts['events']} events | "
                f"{counts['media_uploaded']} media"
            )

    return dict(counts)


# --------------------------------------------------------------------------- #
# Homeowner scaffold — give the homeowner app something to show.               #
# The import otherwise only populates the contractor side (events, photos,     #
# briefs); the homeowner Updates/Property/Milestones tabs read a separate set  #
# of tables (Property / Space / Milestone / Update) that nobody creates. This  #
# step publishes a homeowner view OF THE REAL DATA: a property, a room         #
# skeleton (rooms actually discussed in the chat), inferred build milestones,  #
# and a Project-Updates timeline mapped from the real progress/issue events.   #
# Idempotent (uuid5 ids) — re-running upserts, never duplicates.               #
# --------------------------------------------------------------------------- #

# Ground/first-floor rooms that recur in the Tripathi chat (kids room, sitout,
# servant bathroom, lift area, dining, granite/living). A coarse, sensible
# skeleton — the contractor can refine it later; it just unblocks the app.
_SCAFFOLD_FLOORS = [
    ("ground", "Ground Floor", [
        ("living", "Living Room"), ("kitchen", "Kitchen"), ("dining", "Dining"),
        ("sitout", "Sitout"), ("servant-bath", "Servant Bathroom"),
    ]),
    ("first", "First Floor", [
        ("master", "Master Bedroom"), ("kids", "Kids Room"), ("lift", "Lift Area"),
    ]),
]

# Map a real site-event type to a homeowner timeline card type. Only the
# homeowner-meaningful ones become cards (progress + issues); the rest (invoices,
# payments, attendance) stay contractor-internal.
_EVENT_TO_UPDATE = {
    "progress_update": UpdateType.progress,
    "issue": UpdateType.delay,
}


async def scaffold_homeowner(world: dict, session_factory=SessionLocal) -> dict[str, int]:
    """Publish a homeowner-facing view of the imported site (idempotent).

    ``session_factory`` is injectable so tests can bind it to a rolled-back test
    session (mirrors ``handle_ingested``); defaults to the real ``SessionLocal``.
    """
    from datetime import timedelta

    site_id = world["site_id"]
    company_id = world["company_id"]
    out: Counter = Counter()

    async with session_factory() as s:
        # Publisher = the company owner (homeowner cards show "by the site team").
        owner = (
            await s.execute(
                select(User).where(
                    User.company_id == company_id, User.role == UserRole.owner
                )
            )
        ).scalars().first()
        owner_id = owner.id if owner else None

        # Real build window from the imported events.
        bounds = (
            await s.execute(
                select(
                    func.min(SiteEventModel.occurred_on),
                    func.max(SiteEventModel.occurred_on),
                ).where(SiteEventModel.site_id == site_id)
            )
        ).first()
        start_on = bounds[0] if bounds else None
        last_on = bounds[1] if bounds else None

        # 1) Property — the homeowner's view of the site.
        site = await s.get(Site, site_id)
        await _upsert(
            s, Property, _id("property"),
            company_id=company_id, site_id=site_id,
            display_name=(site.name if site else SITE_NAME),
            type="residential", status="building",
            started_on=start_on,
            expected_handover_on=(last_on + timedelta(days=90)) if last_on else None,
        )
        out["property"] = 1

        # 2) Room skeleton (floors → rooms).
        for forder, (fkey, fname, rooms) in enumerate(_SCAFFOLD_FLOORS):
            floor = await _upsert(
                s, Space, _id("space", fkey),
                site_id=site_id, parent_id=None, name=fname,
                kind=SpaceKind.floor, order=forder,
            )
            await s.flush()
            out["spaces"] += 1
            for rorder, (rkey, rname) in enumerate(rooms):
                await _upsert(
                    s, Space, _id("space", fkey, rkey),
                    site_id=site_id, parent_id=floor.id, name=rname,
                    kind=SpaceKind.room, order=rorder,
                )
                out["spaces"] += 1

        # 3) Build milestones — inferred from the (finishing-stage) timeline.
        milestones = [
            ("foundation", "Foundation", MilestoneStatus.done,
             start_on, (start_on + timedelta(days=90)) if start_on else None),
            ("structure", "Structure & slabs", MilestoneStatus.done,
             None, (start_on + timedelta(days=420)) if start_on else None),
            ("interiors", "Interiors & finishes", MilestoneStatus.now,
             None, None),
            ("handover", "Handover", MilestoneStatus.upcoming,
             None, (last_on + timedelta(days=90)) if last_on else None),
        ]
        for order, (mkey, name, status, started, done_or_exp) in enumerate(milestones):
            done = status == MilestoneStatus.done
            await _upsert(
                s, Milestone, _id("milestone", mkey),
                site_id=site_id, name=name, status=status, order=order,
                started_on=started,
                completed_on=done_or_exp if done else None,
                expected_on=None if done else done_or_exp,
            )
            out["milestones"] += 1
        await s.flush()

        # 4) Project-Updates timeline — real progress/issue events → cards.
        ev_rows = (
            await s.execute(
                select(SiteEventModel)
                .where(
                    SiteEventModel.site_id == site_id,
                    SiteEventModel.event_type.in_(list(_EVENT_TO_UPDATE.keys())),
                )
                .order_by(SiteEventModel.created_at)
            )
        ).scalars().all()
        for ev in ev_rows:
            summary = (ev.summary or "").strip()
            if not summary or summary.lower().startswith("no message"):
                continue  # skip empty/garbage extractions
            title = summary if len(summary) <= 80 else summary[:77] + "…"
            await _upsert(
                s, Update, _id("update", str(ev.id)),
                site_id=site_id,
                type=_EVENT_TO_UPDATE[ev.event_type],
                title=title,
                body=summary if len(summary) > 80 else None,
                published_by=owner_id,
                published_at=ev.created_at,
            )
            out["updates"] += 1

        await s.commit()
    return dict(out)


async def finalize(world: dict) -> dict[str, int]:
    """Build a few recent briefs + index everything for search."""
    from app.brief.generate import build_brief

    out: dict[str, int] = {}
    site_id = world["site_id"]
    company_id = world["company_id"]
    async with SessionLocal() as s:
        days = (
            await s.execute(
                select(SiteEventModel.occurred_on)
                .where(SiteEventModel.site_id == site_id)
                .order_by(SiteEventModel.occurred_on.desc())
            )
        ).scalars().all()
        recent = sorted({d for d in days})[-5:]  # last 5 active days
        for d in recent:
            await build_brief(s, company_id, d, llm=None)
        await s.commit()
        out["briefs"] = len(recent)

        out["indexed"] = await index_all_unindexed(s)
        await s.commit()
    return out


# --------------------------------------------------------------------------- #
# Media backfill — second pass: upload photos/PDFs to R2 and attach them to    #
# the already-imported messages (matched by sender + timestamp, so it needs    #
# no shared ids with the text pass). Images also become homeowner-feed photos. #
# --------------------------------------------------------------------------- #
async def backfill_media(zip_path: str, *, opts: argparse.Namespace) -> dict[str, int]:
    storage = get_storage()
    site_id = _id("site")
    print("Opening media zip (≈100s for a large export)…")
    zf = zipfile.ZipFile(zip_path)
    members = _media_member_map(zf)
    chat_name = next((n for n in zf.namelist() if n.rsplit("/", 1)[-1] == "_chat.txt"), None)
    if chat_name is None:
        raise SystemExit("No _chat.txt inside the media zip")
    messages = parse_chat(zf.read(chat_name).decode("utf-8", errors="replace"))

    counts: Counter = Counter()
    processed = 0
    for m in messages:
        if m.is_system or _is_group_pseudo_sender(m.sender):
            continue
        if m.media_kind not in UPLOAD_KINDS or not m.media_filename:
            continue
        if m.media_filename not in members:
            counts["no_file_in_zip"] += 1
            continue
        if opts.since and m.sent_at.date() < opts.since:
            continue
        if opts.until and m.sent_at.date() > opts.until:
            continue
        if opts.limit and processed >= opts.limit:
            break

        try:
            async with SessionLocal() as s:
                row = (
                    await s.execute(
                        select(RawMessageModel)
                        .where(
                            RawMessageModel.external_group_id == EXTERNAL_GROUP_ID,
                            RawMessageModel.sender_name == m.sender,
                            RawMessageModel.sent_at == m.sent_at,
                            RawMessageModel.media_url.is_(None),
                        )
                        .order_by(RawMessageModel.id)
                        .limit(1)
                    )
                ).scalar_one_or_none()
                if row is None:
                    counts["no_match"] += 1
                    continue
                try:
                    data = zf.read(members[m.media_filename])
                except Exception:
                    counts["read_fail"] += 1
                    continue
                key = f"{_MEDIA_PREFIX}/{m.media_filename}"
                mime = _content_type(m.media_filename)
                try:
                    storage.put_bytes(key, data, mime)
                except Exception as exc:
                    counts["upload_fail"] += 1
                    print(f"  ! upload failed {m.media_filename}: {exc}")
                    continue
                row.media_url = key
                row.media_mime = mime
                raw_id = row.id
                await s.commit()
                counts["media_attached"] += 1

                if m.media_kind == "image":
                    pid = _id("photo", str(raw_id))
                    if await s.get(PublishedPhoto, pid) is None:
                        s.add(PublishedPhoto(
                            id=pid, site_id=site_id, image_url=key,
                            caption=m.text, room_tag=None, milestone_id=None,
                            is_starred=False, published_by=_id("user", m.sender),
                        ))
                        await s.commit()
                        counts["photos_published"] += 1
        except Exception as exc:
            # A dropped DB connection (e.g. laptop sleep) kills only this item;
            # media_url stays NULL so a re-run retries it. Keep going.
            counts["item_error"] += 1
            if counts["item_error"] <= 5:
                print(f"  ! item error (skipped, retried on re-run): {str(exc)[:90]}")
            continue

        processed += 1
        if processed % 100 == 0:
            print(
                f"  … {processed} media | {counts['media_attached']} attached | "
                f"{counts['photos_published']} photos"
            )

    return dict(counts)


# --------------------------------------------------------------------------- #
# Purge                                                                        #
# --------------------------------------------------------------------------- #
async def purge() -> dict[str, int]:
    storage = get_storage()
    out: Counter = Counter()
    company_id = _id("company")
    site_id = _id("site")

    # Imported messages now bridge in as app_chat raw rows scoped to the site
    # ("app:{site_id}"); the legacy whatsapp_export id is kept so older imports
    # purge cleanly too.
    app_group_id = f"app:{site_id}"

    async with SessionLocal() as s:
        # Collect media keys IN MEMORY first, then do every DB delete in this one
        # fast transaction. The slow per-object R2 delete loop runs AFTER the
        # session closes (below) — holding a DB connection idle across thousands
        # of R2 deletes is what made Neon's pooler drop it mid-purge.
        keys = set(
            (
                await s.execute(
                    select(RawMessageModel.media_url).where(
                        RawMessageModel.external_group_id.in_([EXTERNAL_GROUP_ID, app_group_id]),
                        RawMessageModel.media_url.is_not(None),
                    )
                )
            ).scalars().all()
        )
        keys |= set(
            (
                await s.execute(
                    select(PublishedPhoto.image_url).where(PublishedPhoto.site_id == site_id)
                )
            ).scalars().all()
        )

        await s.execute(delete(PublishedPhoto).where(PublishedPhoto.site_id == site_id))

        # Seeded in-app chat (Messages tab). Delete children → parent before the
        # Site/RawMessage deletes below: chat_messages → conversation_reads →
        # conversations. (The bridged RawMessage rows are caught by the
        # external_group_id="app:{site_id}" + whatsapp_export deletes further down.)
        conv_ids = (
            await s.execute(select(Conversation.id).where(Conversation.site_id == site_id))
        ).scalars().all()
        if conv_ids:
            await s.execute(
                delete(ChatMessage).where(ChatMessage.conversation_id.in_(conv_ids))
            )
            await s.execute(
                delete(ConversationRead).where(ConversationRead.conversation_id.in_(conv_ids))
            )
            await s.execute(delete(Conversation).where(Conversation.id.in_(conv_ids)))
        out["conversations"] = len(conv_ids)

        # Homeowner scaffold (property / rooms / milestones / timeline). Spaces
        # cascade their components; delete before the Site goes.
        await s.execute(delete(Update).where(Update.site_id == site_id))
        await s.execute(delete(Milestone).where(Milestone.site_id == site_id))
        await s.execute(delete(Space).where(Space.site_id == site_id))
        await s.execute(delete(Property).where(Property.site_id == site_id))

        # Child → parent deletes.
        ev_ids = (
            await s.execute(select(SiteEventModel.id).where(SiteEventModel.site_id == site_id))
        ).scalars().all()
        if ev_ids:
            await s.execute(delete(EventEmbedding).where(EventEmbedding.site_event_id.in_(ev_ids)))
        out["events"] = len(ev_ids)
        await s.execute(delete(SiteEventModel).where(SiteEventModel.site_id == site_id))
        r = await s.execute(
            delete(RawMessageModel).where(
                RawMessageModel.external_group_id.in_([EXTERNAL_GROUP_ID, app_group_id])
            )
        )
        out["raw_messages"] = r.rowcount or 0
        await s.execute(delete(HomeownerMember).where(HomeownerMember.site_id == site_id))
        await s.execute(delete(SiteAssignment).where(SiteAssignment.site_id == site_id))
        await s.execute(delete(WhatsappGroup).where(WhatsappGroup.company_id == company_id))
        await s.execute(delete(SiteBaseline).where(SiteBaseline.site_id == site_id))

        # Briefs + decisions reference the company; clear them if present.
        from sqlalchemy import text
        for tbl in ("owner_briefs", "decisions"):
            try:
                await s.execute(
                    text(f"DELETE FROM {tbl} WHERE company_id = :cid"),
                    {"cid": str(company_id)},
                )
            except Exception:
                pass

        await s.execute(delete(Site).where(Site.id == site_id))
        await s.execute(delete(User).where(User.company_id == company_id))
        await s.execute(delete(Company).where(Company.id == company_id))
        await s.commit()

    # DB is fully purged + committed. Now delete the storage objects — slow on R2
    # (thousands of objects, sequential), but holds NO DB connection so a long
    # loop can't trip the Neon idle timeout.
    if hasattr(storage, "delete"):
        for key in keys:
            if not key or key.lower().startswith(("http://", "https://")):
                continue
            try:
                storage.delete(key)
                out["media_deleted"] += 1
            except Exception:
                out["media_delete_failed"] += 1

    return dict(out)


# --------------------------------------------------------------------------- #
# Dry-run report                                                               #
# --------------------------------------------------------------------------- #
def dry_run_report(messages: list[ParsedMessage], participants: dict[str, str]) -> None:
    total = len(messages)
    system = sum(1 for m in messages if m.is_system or _is_group_pseudo_sender(m.sender))
    real = total - system
    by_kind = Counter(m.media_kind for m in messages if m.media_kind)
    text_msgs = sum(1 for m in messages if m.text and not m.is_system)
    dates = [m.sent_at.date() for m in messages]
    per_sender = Counter(
        m.sender for m in messages
        if not m.is_system and not _is_group_pseudo_sender(m.sender)
    )

    print("\n=== DRY RUN (no DB / no AI / no upload / no cost) ===")
    print(f"Company : {COMPANY_NAME}")
    print(f"Site    : {SITE_NAME}")
    print(f"Messages: {total} total · {real} real · {system} system/group")
    print(f"Date    : {min(dates)} → {max(dates)}")
    print(f"Text msgs (→ extraction): {text_msgs}")
    print("Media   : " + " · ".join(f"{k}:{v}" for k, v in by_kind.items()))
    est_extract = text_msgs + by_kind.get("document", 0)
    print(f"≈ extraction calls: {est_extract}   (images-with-caption included via text)")

    # Per-channel projection — the deterministic split (no LLM label) of which
    # thread each real message seeds into. The live --run may move some firm-role
    # messages to "homeowner" via the cheap LLM label; this is the floor.
    channel_split = Counter()
    for m in messages:
        if m.is_system or _is_group_pseudo_sender(m.sender):
            continue
        role = SENDER_ROLES.get(m.sender, DEFAULT_ROLE)
        ch = classify_channel(
            sender_role=role, text=m.text, media_kind=m.media_kind, llm_label=None,
        )
        channel_split[ch] += 1
    print(
        f"Channels (deterministic): site channel: {channel_split['site']} / "
        f"homeowner channel: {channel_split['homeowner']}"
    )

    print(f"\nParticipants → role  ({len(participants)} users, all login phone + OTP 000000):")
    for i, (sender, role) in enumerate(participants.items()):
        print(f"  {_phone_for(i)}  {role:16} {sender}  ({per_sender.get(sender, 0)} msgs)")
    print("\nLooks right? Re-run with --run to import (add --since to validate a slice first).")


# --------------------------------------------------------------------------- #
# Entry point                                                                  #
# --------------------------------------------------------------------------- #
def _read_chat_txt(zip_path: str) -> tuple[str, zipfile.ZipFile]:
    zf = zipfile.ZipFile(zip_path)
    name = next((n for n in zf.namelist() if n.rsplit("/", 1)[-1] == "_chat.txt"), None)
    if name is None:
        raise SystemExit(f"No _chat.txt inside {zip_path}")
    return zf.read(name).decode("utf-8", errors="replace"), zf


async def _run(opts: argparse.Namespace) -> None:
    if opts.purge:
        print("Purging imported data (DB rows + storage objects)…")
        counts = await purge()
        print("Purged:", counts)
        return

    if opts.media_backfill:
        print("Media backfill — uploading photos/PDFs + attaching to imported messages…")
        counts = await backfill_media(opts.zip, opts=opts)
        print("Backfill:", counts)
        return

    if opts.homeowner_scaffold:
        # Backfill the homeowner view onto an ALREADY-imported site — no zip
        # needed. Uses the deterministic ids the import always produces.
        print("Homeowner scaffold — publishing property/rooms/milestones/timeline…")
        world = {"site_id": _id("site"), "company_id": _id("company")}
        counts = await scaffold_homeowner(world)
        print("Scaffold:", counts)
        return

    raw_text, zf = _read_chat_txt(opts.zip)
    messages = parse_chat(raw_text)
    participants = discover_participants(messages)

    if not opts.run:
        dry_run_report(messages, participants)
        return

    print(f"Importing '{SITE_NAME}' — {len(messages)} parsed messages…")
    async with SessionLocal() as s:
        world = await build_world(s, participants)
    counts = await import_messages(world, messages, zf, opts=opts)
    print("Ingest:", counts)
    fin = await finalize(world)
    print("Finalize:", fin)
    scaf = await scaffold_homeowner(world)
    print("Homeowner scaffold:", scaf)

    print("\n✅ Import complete. Login (phone + dev OTP 000000):")
    for i, (sender, role) in enumerate(participants.items()):
        print(f"   {_phone_for(i)}  {role:16} {sender}")


def main() -> None:
    # Load .env into os.environ so the extraction clients (get_llm_client/OCR/STT,
    # which read os.environ directly) see the real Azure creds. Done here in the
    # CLI entry — NOT at import — so tests that import this module stay on the
    # network-free FakeLLM. CLI/prod env vars already set are NOT overridden.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    p = argparse.ArgumentParser(description="Import a WhatsApp export into Constructo.")
    p.add_argument("--zip", help="Path to the WhatsApp 'Export Chat' .zip")
    p.add_argument("--run", action="store_true", help="Actually import (default: dry-run only)")
    p.add_argument(
        "--purge", action="store_true",
        help="Delete everything this import created, then exit",
    )
    p.add_argument("--limit", type=int, default=0, help="Import at most N messages")
    p.add_argument(
        "--since", type=date.fromisoformat, help="Only messages on/after YYYY-MM-DD",
    )
    p.add_argument(
        "--until", type=date.fromisoformat, help="Only messages on/before YYYY-MM-DD",
    )
    p.add_argument(
        "--no-media", action="store_true", help="Skip media upload (text-only, cheapest)",
    )
    p.add_argument(
        "--skip-extraction", action="store_true",
        help="Store messages but skip AI extraction",
    )
    p.add_argument(
        "--media-backfill", action="store_true",
        help="Second pass: upload media from --zip + attach to imported messages",
    )
    p.add_argument(
        "--homeowner-scaffold", action="store_true",
        help="Backfill the homeowner view (property/rooms/milestones/timeline) onto "
             "an already-imported site; no --zip needed",
    )
    opts = p.parse_args()
    if not opts.purge and not opts.homeowner_scaffold and not opts.zip:
        p.error("--zip is required (unless --purge / --homeowner-scaffold)")
    asyncio.run(_run(opts))


if __name__ == "__main__":
    main()
