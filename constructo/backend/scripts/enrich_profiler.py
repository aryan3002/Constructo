"""Derive ONE design :class:`ProfilerProfile` from the real design-phase signal.

Enrichment over the real Tripathi import (see ``scripts.import_whatsapp_export``):
the design conversation between the homeowner family and the firm is the real
"moodboard in words" — which rooms they care about, the finishes/materials they
keep asking for, and (as photos) the design-option references they shared. This
pass turns that signal into the Design-Profiler product objects:

  * one :class:`ProfilerProfile` for the site,
  * a :class:`ProfilerArea` per room actually discussed (master bedroom, drawing
    room, kitchen, toilets …) — grounded by keyword in the real messages,
  * :class:`ProfilerReference` rows from the real design-option photos (each
    FK-bound to an area),
  * AI-proposed :class:`ProfilerTheme` rows (smart-tier LLM, grounded in the
    real design text — reusing ``app.profiler.themes.narrate_themes``), and
  * a :class:`ProfilerBrief` whose ``summary_json`` is the narrated brief
    (reusing ``app.profiler.brief.narrate_brief``).
  * a :class:`ProfilerContributor` for the primary homeowner when one is known.

GROUNDED, NOT FABRICATED: areas come only from rooms named in the real text;
themes/brief are narrated by the LLM but told to reflect the supplied design
signal exactly; confidence stays a deterministic constant (never the model's).
With NO design messages AND NO design photos there is no design signal, so no
profile (and zero of everything) is created — asserted by the test.

Idempotent by construction: every row uses a deterministic ``uuid5`` id (profile,
area_key, theme slug, photo id), so re-running upserts the same rows and never
duplicates.

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_profiler
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.models import (
    AreaKind,
    ChatMessage,
    ContributorRole,
    Conversation,
    ConversationKind,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    ProfilerArea,
    ProfilerBrief,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerReference,
    ProfilerTheme,
    ProfileScope,
    ProfileStatus,
    PublishedPhoto,
    ReferenceSource,
    ThemeStatus,
)
from app.profiler.brief import narrate_brief
from app.profiler.themes import narrate_themes

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

# Grounding fallback: the design-area confidence is a deterministic constant —
# this pass derives taste from free chat, not the ranked-moodboard pipeline, so
# it never claims a model-style confidence (Determinism Doctrine).
_AREA_CONFIDENCE = 0.5

# Rooms we look for in the real design text (key -> display name + match terms).
# Only rooms actually mentioned become areas (grounded; nothing invented).
_ROOM_VOCAB: list[tuple[str, str, tuple[str, ...]]] = [
    ("master_bedroom", "Master Bedroom", ("master bedroom", "master bed", "mbr")),
    ("bedroom", "Bedroom", ("bedroom", "kids room", "guest room")),
    ("drawing_room", "Drawing Room", ("drawing room", "living room", "living", "lounge")),
    ("kitchen", "Kitchen", ("kitchen", "counter", "modular")),
    ("dining", "Dining", ("dining",)),
    ("toilet", "Toilets", ("toilet", "bathroom", "washroom", "shower", "vanity")),
    ("pooja", "Pooja Room", ("pooja", "mandir", "temple")),
    ("facade", "Elevation & Facade", ("elevation", "facade", "front", "exterior")),
]


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _slug(text: str) -> str:
    """Stable lowercase slug (idempotency key material)."""
    keep = [c.lower() if c.isalnum() else " " for c in (text or "")]
    return "-".join("".join(keep).split())[:120]


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update by primary-key id (idempotent re-runs)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


def _discover_rooms(design_text: str) -> list[tuple[str, str]]:
    """Rooms actually named in the design text → [(area_key, display_name)].

    Falls back to a single 'Whole Home' area when there is design signal but no
    specific room was named, so a profile with real references is never area-less
    (ProfilerReference.area_id is NOT NULL)."""
    t = design_text.lower()
    found = [
        (key, name)
        for key, name, terms in _ROOM_VOCAB
        if any(term in t for term in terms)
    ]
    if found:
        return found
    return [("whole_home", "Whole Home")]


async def _primary_homeowner(s, site_id: UUID):
    """The site's primary homeowner member (for the decision-owner contributor).

    Falls back to any active homeowner member; returns None when none exist."""
    rows = (
        await s.execute(
            select(HomeownerMember).where(
                HomeownerMember.site_id == site_id,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    if not rows:
        return None
    return next(
        (m for m in rows if m.sub_role == HomeownerSubRole.primary_owner), rows[0]
    )


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Build one design profile (areas + references + themes + brief) for the site.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_decisions``); defaults to the real ``SessionLocal``.
    Returns ``{"areas", "themes", "references", "brief"}``.
    """
    site_id = _id("site")
    company_id = _id("company")
    llm = get_llm_client("smart")
    zero = {"areas": 0, "themes": 0, "references": 0, "brief": 0}

    async with session_factory() as s:
        # 1) Real design signal: the curated homeowner thread + design-option photos.
        msgs = (
            await s.execute(
                select(ChatMessage)
                .join(Conversation, ChatMessage.conversation_id == Conversation.id)
                .where(
                    Conversation.site_id == site_id,
                    Conversation.kind == ConversationKind.homeowner,
                )
                .order_by(ChatMessage.seq, ChatMessage.created_at)
            )
        ).scalars().all()
        design_lines = [(m.body or "").strip() for m in msgs if (m.body or "").strip()]

        photos = (
            await s.execute(
                select(PublishedPhoto)
                .where(PublishedPhoto.site_id == site_id)
                .order_by(PublishedPhoto.published_at, PublishedPhoto.id)
            )
        ).scalars().all()

        # No design conversation AND no design photos → no design signal at all.
        if not design_lines and not photos:
            return dict(zero)

        design_text = "\n".join(design_lines)

        # 2) The profile (idempotent singleton for the site).
        profile_id = _id("profiler-profile")
        await _upsert(
            s, ProfilerProfile, profile_id,
            company_id=company_id, site_id=site_id,
            scope_type=ProfileScope.whole_house,
            status=ProfileStatus.theme_suggested,
        )
        await s.flush()

        # 3) Optional contributor — the primary homeowner (tolerate-null).
        member = await _primary_homeowner(s, site_id)
        if member is not None:
            await _upsert(
                s, ProfilerContributor, _id("profiler-contributor", str(member.id)),
                profile_id=profile_id, member_id=member.id, user_id=member.user_id,
                role=ContributorRole.owner, is_decision_owner=True,
            )
            await s.flush()

        # 4) Areas — the rooms actually discussed (grounded by keyword).
        rooms = _discover_rooms(design_text)
        area_ids: list[UUID] = []
        for area_key, _name in rooms:
            area_id = _id("profiler-area", area_key)
            await _upsert(
                s, ProfilerArea, area_id,
                profile_id=profile_id, area_kind=AreaKind.interior, area_key=area_key,
                recommended_count=6, confidence=_AREA_CONFIDENCE,
                taste_model={"confidence": _AREA_CONFIDENCE, "source": "design_thread"},
            )
            area_ids.append(area_id)
        await s.flush()
        primary_area_id = area_ids[0]

        # 5) References — the real design-option photos, FK-bound to the first
        #    area (area_id is NOT NULL). One per photo (uuid5 ⇒ idempotent).
        references = 0
        for ph in photos:
            await _upsert(
                s, ProfilerReference, _id("profiler-reference", str(ph.id)),
                profile_id=profile_id, area_id=primary_area_id,
                source_type=ReferenceSource.upload,
                image_r2_key=ph.image_url, source_url=None,
            )
            references += 1
        await s.flush()
        ref_ids = [
            str(_id("profiler-reference", str(ph.id))) for ph in photos
        ]

        # 6) Themes — AI proposes, grounded in the real design text (the same
        #    narrator the live profiler uses). Confidence stays the reducer's
        #    constant; evidence is the real reference ids.
        taste_model = {
            "dimensions": {"material": {}, "style": {}},
            "design_text": design_text,
        }
        proposed = await narrate_themes(llm, "whole_house", taste_model)
        themes = 0
        for t in proposed:
            name = (t.get("name") or "").strip()
            if not name:
                continue
            await _upsert(
                s, ProfilerTheme, _id("profiler-theme", _slug(name)),
                profile_id=profile_id, area_id=None, name=name[:120],
                confidence=_AREA_CONFIDENCE,
                palette=t.get("palette") or [],
                materials=t.get("materials") or [],
                rationale=(t.get("rationale") or None),
                evidence_reference_ids=ref_ids,
                status=ThemeStatus.suggested,
            )
            themes += 1
        await s.flush()

        # 7) Brief — narrated for the homeowner from a grounded payload built
        #    from the proposed themes (stored as summary_json).
        material_families: list[str] = []
        for t in proposed:
            for m in t.get("materials") or []:
                if m not in material_families:
                    material_families.append(m)
        payload = {
            "scope_type": "whole_house",
            "areas": [
                {
                    "area_key": key,
                    "confidence": _AREA_CONFIDENCE,
                    "material_families": material_families,
                    "themes": [
                        {"name": t.get("name"), "palette": t.get("palette") or [],
                         "materials": t.get("materials") or []}
                        for t in proposed if (t.get("name") or "").strip()
                    ],
                    "resolved_conflicts": [],
                }
                for key, _ in rooms
            ],
        }
        narrated = await narrate_brief(llm, "homeowner", payload)
        await _upsert(
            s, ProfilerBrief, _id("profiler-brief", str(profile_id)),
            profile_id=profile_id, version=1,
            summary_json={"audience": "homeowner", "payload": payload, **narrated},
        )

        await s.commit()

    return {
        "areas": len(area_ids),
        "themes": themes,
        "references": references,
        "brief": 1,
    }


def main() -> None:
    # Pull real Azure creds into os.environ for the smart client — here in the
    # CLI entry only (NOT at import) so test imports stay on the FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched profiler:", counts)


if __name__ == "__main__":
    main()
