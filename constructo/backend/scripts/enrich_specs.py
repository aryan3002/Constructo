"""Derive the architect's **selection schedule** — Specs (+ Materials + the
Component they bind to) — from real signal in the Tripathi import.

Fourth-pass enrichment over the real import (see
``scripts.import_whatsapp_export``). The architect's *Selections* screen reads
:class:`Spec` rows: a material/finish bound to a component in a room, moving
through a routing lifecycle (draft → out-for-approval → approved → released, with
rejected surfacing as "returned"). This pass derives that schedule from three
*real* sources and nothing else:

  * distinct materials from ``material_delivery`` site-event ``fields``
    (cement / steel / tiles / granite …),
  * finish-choice mentions in the homeowner thread (vertical bricks, vanity 20",
    granite top, electric fireplace …), and
  * the room / component skeleton (:class:`Space` / :class:`Component`) created by
    earlier passes (``enrich_documents`` / the import scaffold).

The smart-tier LLM is asked to propose a schedule grounded in that gathered
signal; with NO signal it is never called and zero specs are produced (asserted
by the test).

Schema reality the upsert honours:
  * :class:`Spec` requires a NOT NULL ``component_id`` (and that component a
    NOT NULL ``space_id``). So each spec is anchored to a real room
    :class:`Space` when its area matches one, otherwise to a derived
    "Selections" floor; a :class:`Component` is upserted under that space and the
    spec binds to it.
  * ``material_id`` is optional — a :class:`Material` is upserted only when the
    proposal names a material/finish.
  * the routing lifecycle is VARIED across rows (draft / out-for-approval /
    approved / released / returned) using the real enum + ``sent_at`` /
    ``released_at`` stamps, so the Selections screen shows a realistic mix.

Idempotent by construction: deterministic ``uuid5`` ids for every row (spec,
component, material, derived space) ⇒ re-running upserts, never duplicates.

SAFE BY DEFAULT for tests: real Azure creds are only pulled in inside
:func:`main` (via ``scripts._bootstrap_env.load``), never at import time.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_specs
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.models import (
    ChatMessage,
    Component,
    ComponentStatus,
    Conversation,
    ConversationKind,
    Material,
    SiteEventModel,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
)

# Same deterministic namespace + id helper the import uses.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

# Homeowner messages to scan for finish mentions (the design back-and-forth).
_MSG_LIMIT = 200
# Finish keywords that mark a homeowner message as selection-relevant signal.
_FINISH_HINTS = (
    "tile", "tiles", "granite", "marble", "vitrified", "laminate", "veneer",
    "vanity", "fireplace", "brick", "bricks", "louver", "louvre", "paint",
    "wallpaper", "false ceiling", "pop", "wardrobe", "counter", "countertop",
    "sanitary", "faucet", "fitting", "fittings", "wood", "teak", "ply",
    "flooring", "polish", "cladding", "stone", "finish",
)

# Routing lifecycles cycled across rows so the Selections screen shows a mix.
# (approval_status, set_sent_at, set_released_at) → routing status the read side
# derives: draft / out_for_approval / approved / released / returned.
_LIFECYCLE = [
    (SpecApprovalStatus.pending, False, False),   # draft
    (SpecApprovalStatus.pending, True, False),    # out_for_approval
    (SpecApprovalStatus.approved, True, False),   # approved
    (SpecApprovalStatus.approved, True, True),    # released
    (SpecApprovalStatus.rejected, True, False),   # returned — revise
]

_SYSTEM = (
    "You are an interior architect building a Material Selection Schedule for a "
    "house. From the gathered signal (materials seen delivered on site, finish "
    "choices the family discussed, and the known rooms), propose distinct "
    "schedule line items. Each item is a material/finish selected for a "
    "category in a specific area/room. Ground every item in the supplied signal "
    "— do not invent materials or rooms that are not implied by it. Return JSON."
)

_SCHEMA = {
    "specs": [
        {
            "area": "room / area name (use one of the known rooms if it fits)",
            "item": "what is being selected, e.g. 'Flooring', 'Vanity', 'Walls'",
            "material": "the selected material / finish, or null",
            "unit": "measure unit if obvious (sqft/nos/…), or null",
            "status": "draft | out_for_approval | approved | released | returned",
        }
    ]
}

_STATUS_TO_LIFECYCLE = {
    "draft": _LIFECYCLE[0],
    "out_for_approval": _LIFECYCLE[1],
    "approved": _LIFECYCLE[2],
    "released": _LIFECYCLE[3],
    "returned": _LIFECYCLE[4],
}


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _slug(text: str) -> str:
    keep = [c.lower() if c.isalnum() else " " for c in (text or "")]
    return "-".join("".join(keep).split())[:120]


def _norm(text: str) -> str:
    return " ".join((text or "").split()).lower()


async def _upsert(session, model, ident: UUID, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


async def _gather_materials(s, site_id: UUID) -> list[str]:
    """Distinct material names from real ``material_delivery`` event fields."""
    rows = (
        await s.execute(
            select(SiteEventModel.fields, SiteEventModel.summary).where(
                SiteEventModel.site_id == site_id,
                SiteEventModel.event_type == "material_delivery",
            )
        )
    ).all()
    seen: dict[str, str] = {}
    for fields, summary in rows:
        name = None
        if isinstance(fields, dict):
            name = fields.get("material") or fields.get("item")
        if not name and summary:
            name = summary.strip()[:60]
        if name and isinstance(name, str) and name.strip():
            seen.setdefault(_norm(name), name.strip())
    return list(seen.values())


async def _gather_finishes(s, site_id: UUID) -> list[str]:
    """Finish-choice snippets from the homeowner thread (keyword-gated)."""
    msgs = (
        await s.execute(
            select(ChatMessage.body)
            .join(Conversation, ChatMessage.conversation_id == Conversation.id)
            .where(
                Conversation.site_id == site_id,
                Conversation.kind == ConversationKind.homeowner,
                ChatMessage.body.is_not(None),
            )
            .order_by(ChatMessage.seq, ChatMessage.created_at)
            .limit(_MSG_LIMIT)
        )
    ).scalars().all()
    out: list[str] = []
    for body in msgs:
        text = (body or "").strip()
        low = text.lower()
        if text and any(h in low for h in _FINISH_HINTS):
            out.append(text[:160])
    return out


async def _gather_rooms(s, site_id: UUID) -> list[Space]:
    """Room spaces for the site (anchors for spec components)."""
    return (
        await s.execute(
            select(Space).where(
                Space.site_id == site_id, Space.kind == SpaceKind.room
            )
        )
    ).scalars().all()


def _build_user_prompt(
    materials: list[str], finishes: list[str], rooms: list[Space]
) -> str:
    parts = []
    if rooms:
        parts.append("Known rooms: " + ", ".join(r.name for r in rooms))
    if materials:
        parts.append("Materials seen delivered: " + ", ".join(materials))
    if finishes:
        parts.append(
            "Finish choices discussed:\n" + "\n".join(f"- {f}" for f in finishes)
        )
    return "\n\n".join(parts)


async def _ensure_anchor_space(s, site_id: UUID, rooms: list[Space], area: str):
    """Pick the best room Space for ``area`` (case-insensitive), else a derived
    'Selections' floor. Returns the anchor Space (guaranteed to exist)."""
    norm = _norm(area)
    if norm:
        for r in rooms:
            rn = _norm(r.name)
            if rn == norm or (norm and (norm in rn or rn in norm)):
                return r
    # No matching room — hang specs under a single derived "Selections" floor so
    # the NOT NULL component→space chain is always satisfiable.
    return await _upsert(
        s, Space, _id("space", "selections"),
        site_id=site_id, parent_id=None, name="Selections",
        kind=SpaceKind.floor, order=99,
    )


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Gather real signal, propose a selection schedule, upsert Spec rows.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session; defaults to the real ``SessionLocal``. Returns
    ``{"materials_seen", "specs"}``.
    """
    site_id = _id("site")
    company_id = _id("company")
    llm = get_llm_client("smart")

    async with session_factory() as s:
        materials = await _gather_materials(s, site_id)
        finishes = await _gather_finishes(s, site_id)
        rooms = await _gather_rooms(s, site_id)

        # No real signal at all → no schedule (never call the model / fabricate).
        if not materials and not finishes:
            return {"materials_seen": len(materials), "specs": 0}

        prompt = _build_user_prompt(materials, finishes, rooms)
        out = await llm.complete(_SYSTEM, prompt, _SCHEMA)

        specs = 0
        seen_slugs: set[str] = set()
        idx = 0
        for item in (out or {}).get("specs", []) or []:
            if not isinstance(item, dict):
                continue
            area = (item.get("area") or "").strip()
            label = (item.get("item") or "").strip()
            if not label:
                continue
            material_name = (item.get("material") or "").strip() or None
            unit = (item.get("unit") or "").strip() or None

            slug = _slug(f"{area}-{label}")
            if not slug or slug in seen_slugs:
                continue
            seen_slugs.add(slug)

            # Routing lifecycle: honour an explicit status, else cycle so the
            # screen shows a realistic mix across rows.
            status_key = _norm(item.get("status") or "").replace(" ", "_")
            approval, set_sent, set_released = _STATUS_TO_LIFECYCLE.get(
                status_key, _LIFECYCLE[idx % len(_LIFECYCLE)]
            )
            idx += 1

            # Anchor space + a component to satisfy Spec's NOT NULL component_id.
            anchor = await _ensure_anchor_space(s, site_id, rooms, area)
            await s.flush()
            component = await _upsert(
                s, Component, _id("component", slug),
                space_id=anchor.id, name=label[:200],
                kind="selection", status=ComponentStatus.not_started,
                location=area[:200] or None,
            )
            await s.flush()

            # Optional Material — only when the proposal names one.
            material_id: UUID | None = None
            if material_name:
                mat = await _upsert(
                    s, Material, _id("material", _slug(material_name)),
                    company_id=company_id, name=material_name[:200],
                    unit=unit, category=label[:120] or None,
                )
                await s.flush()
                material_id = mat.id

            now = datetime.now(UTC)
            await _upsert(
                s, Spec, _id("spec", slug),
                company_id=company_id, site_id=site_id,
                component_id=component.id, material_id=material_id,
                label=label[:200], unit=unit,
                approval_status=approval,
                sent_at=(now - timedelta(days=3)) if set_sent else None,
                released_at=now if set_released else None,
            )
            specs += 1

        await s.commit()

    return {"materials_seen": len(materials), "specs": specs}


def main() -> None:
    # Pull real Azure creds into os.environ for the smart client — here in the
    # CLI entry only (NOT at import) so test imports stay on the FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched specs:", counts)


if __name__ == "__main__":
    main()
