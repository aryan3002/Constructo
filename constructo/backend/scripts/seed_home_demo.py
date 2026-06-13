"""Seed rich Home-dashboard demo data onto the SUNRISE-HOME (Green Valley Villa) site.

Targets the HomeownerMember with join_code='SUNRISE-HOME' and populates every
section that the homeowner Home endpoint aggregates:

  - Property       → started_on + expected_handover_on (TimeBar + hero)
  - Milestone      → 8 phases, statuses done/now/upcoming
  - Decision       → 2 pending items (needs_attention card)
  - Update         → 3 recent updates (recent_activity card)
  - Change         → 2 cost changes (spend_summary card)
  - HomeownerRequest → 3 requests (My Requests card)

Run from the backend dir:

    uv run python -m scripts.seed_home_demo

IDEMPOTENT: every row uses a deterministic uuid5 id — re-running upserts
in place rather than duplicating.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (
    Change,
    Decision,
    DecisionKind,
    DecisionState,
    HomeownerMember,
    HomeownerRequest,
    HomeownerRequestStatus,
    Milestone,
    MilestoneStatus,
    Property,
    Site,
    Update,
    UpdateType,
    User,
)

# Deterministic namespace — independent of seed_demo and seed_profiler_demo.
NS = uuid5(NAMESPACE_URL, "constructo.seed.home-demo.green-valley-villa")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update a row by primary-key id (idempotent seeding)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for key, value in fields.items():
            setattr(obj, key, value)
    return obj


def _dt(d: date) -> datetime:
    """Convert a date to a UTC-aware midnight datetime."""
    return datetime(d.year, d.month, d.day, tzinfo=UTC)


async def seed() -> dict:  # noqa: PLR0915
    async with SessionLocal() as session:
        # --- Resolve SUNRISE-HOME anchor rows --------------------------------
        member = (
            await session.execute(
                select(HomeownerMember).where(HomeownerMember.join_code == "SUNRISE-HOME")
            )
        ).scalar_one_or_none()
        if member is None:
            raise RuntimeError(
                "HomeownerMember with join_code='SUNRISE-HOME' not found. "
                "Run seed_demo.py or create the invite from the app first."
            )
        site = await session.get(Site, member.site_id)
        if site is None:
            raise RuntimeError(f"Site {member.site_id} not found")

        site_id: UUID = site.id
        company_id: UUID = site.company_id

        # Homeowner user — phone +919855000099.
        homeowner_user = (
            await session.execute(
                select(User).where(User.phone == "+919855000099")
            )
        ).scalar_one_or_none()
        if homeowner_user is None:
            # Fall back to the user_id already stored on the member.
            hw_user_id: UUID | None = member.user_id
        else:
            hw_user_id = homeowner_user.id

        # --- Property --------------------------------------------------------
        # The site may already have a Property row (created by the contractor app
        # or a prior seed). Find it by site_id and update in place; only create a
        # new row if none exists. This avoids duplicate rows that cause a 500 in
        # _property_out (which uses scalar_one_or_none).
        #
        # If multiple rows exist (e.g. from an earlier idempotency bug), keep the
        # *oldest* one (smallest created_at / first inserted) and delete the rest.
        from sqlalchemy import delete as sa_delete

        existing_props = (
            await session.execute(
                select(Property)
                .where(Property.site_id == site_id)
                .order_by(Property.created_at)
            )
        ).scalars().all()
        if len(existing_props) > 1:
            # Delete all but the first (oldest) — deduplicates without touching
            # rows we don't own.
            keep_id = existing_props[0].id
            await session.execute(
                sa_delete(Property).where(
                    Property.site_id == site_id, Property.id != keep_id
                )
            )
            await session.flush()
            existing_props = [existing_props[0]]
        if existing_props:
            prop_obj = existing_props[0]
            prop_obj.display_name = "Green Valley Villa"
            prop_obj.type = "villa"
            prop_obj.status = "building"
            prop_obj.started_on = date(2026, 1, 15)
            prop_obj.expected_handover_on = date(2026, 9, 15)
        else:
            property_id = _id("property", str(site_id))
            prop_obj = Property(
                id=property_id,
                company_id=company_id,
                site_id=site_id,
                display_name="Green Valley Villa",
                type="villa",
                status="building",
                started_on=date(2026, 1, 15),
                expected_handover_on=date(2026, 9, 15),
            )
            session.add(prop_obj)
        await session.flush()

        # --- Milestones (8, order 0..7) --------------------------------------
        milestone_specs = [
            # (key, name, status, started_on, expected_on, completed_on)
            (
                "foundation",
                "Foundation",
                MilestoneStatus.done,
                date(2026, 1, 15),
                date(2026, 2, 10),
                date(2026, 2, 8),
            ),
            (
                "structure",
                "Structure",
                MilestoneStatus.done,
                date(2026, 2, 9),
                date(2026, 3, 15),
                date(2026, 3, 12),
            ),
            (
                "brickwork",
                "Brickwork",
                MilestoneStatus.done,
                date(2026, 3, 13),
                date(2026, 4, 10),
                date(2026, 4, 7),
            ),
            (
                "plastering",
                "Plastering",
                MilestoneStatus.done,
                date(2026, 4, 8),
                date(2026, 5, 5),
                date(2026, 5, 3),
            ),
            (
                "waterproofing",
                "Waterproofing",
                MilestoneStatus.done,
                date(2026, 5, 4),
                date(2026, 5, 31),
                date(2026, 5, 28),
            ),
            (
                "flooring",
                "Flooring & Tiling",
                MilestoneStatus.now,
                date(2026, 5, 29),
                date(2026, 7, 15),
                None,
            ),
            (
                "finishing",
                "Finishing",
                MilestoneStatus.upcoming,
                None,
                date(2026, 8, 15),
                None,
            ),
            (
                "handover",
                "Handover",
                MilestoneStatus.upcoming,
                None,
                date(2026, 9, 15),
                None,
            ),
        ]
        for order, (key, name, status, started_on, expected_on, completed_on) in enumerate(
            milestone_specs
        ):
            await _upsert(
                session,
                Milestone,
                _id("milestone", str(site_id), key),
                site_id=site_id,
                name=name,
                status=status,
                started_on=started_on,
                expected_on=expected_on,
                completed_on=completed_on,
                order=order,
            )
        await session.flush()

        # --- Decisions (2 pending — needs_attention) -------------------------
        decision_specs = [
            (
                "decision-kitchen-layout",
                DecisionKind.approval,
                "Approve revised kitchen layout",
                (
                    "The contractor has submitted a revised kitchen layout with the "
                    "island shifted 30 cm east to improve traffic flow. Please review "
                    "and approve so tiling can proceed."
                ),
            ),
            (
                "decision-bathroom-tile",
                DecisionKind.homeowner_question,
                "Select bathroom tile option",
                (
                    "Two tile options are ready for your selection: Option A — 60×60 cm "
                    "Carrara-look porcelain (₹185/sq ft) or Option B — 30×60 cm "
                    "off-white matte ceramic (₹120/sq ft). Please choose before "
                    "tiling begins next week."
                ),
            ),
        ]
        for key, kind, title, detail in decision_specs:
            await _upsert(
                session,
                Decision,
                _id(key, str(site_id)),
                company_id=company_id,
                site_id=site_id,
                kind=kind,
                title=title,
                detail=detail,
                state=DecisionState.pending,
                raised_by=hw_user_id,
            )
        await session.flush()

        # --- Updates (3 recent — recent_activity) ----------------------------
        today = datetime.now(UTC).date()
        update_specs = [
            (
                "update-tiling-progress",
                UpdateType.progress,
                "Kitchen tiling in progress",
                (
                    "The tiling crew has completed about 60% of the kitchen floor. "
                    "Vitrified tiles are being laid in a herringbone pattern as per "
                    "the approved layout. On track for completion by end of next week."
                ),
                datetime(today.year, today.month, today.day, 10, 0, 0, tzinfo=UTC),
            ),
            (
                "update-bedroom-flooring",
                UpdateType.progress,
                "Master bedroom flooring completed",
                (
                    "Engineered wooden flooring in the master bedroom is fully laid "
                    "and polished. The room is now sealed for curing. Furniture can "
                    "enter in 48 hours."
                ),
                datetime(today.year, today.month, today.day - 1, 14, 30, 0, tzinfo=UTC),
            ),
            (
                "update-waterproofing-done",
                UpdateType.milestone,
                "Bathroom waterproofing complete",
                (
                    "All three bathrooms have passed the 24-hour water-retention test. "
                    "Waterproofing membrane is confirmed leak-free. Tiling for bathrooms "
                    "will commence next Monday."
                ),
                datetime(today.year, today.month, today.day - 4, 9, 0, 0, tzinfo=UTC),
            ),
        ]
        for key, utype, title, body, published_at in update_specs:
            await _upsert(
                session,
                Update,
                _id(key, str(site_id)),
                site_id=site_id,
                type=utype,
                title=title,
                body=body,
                published_at=published_at,
            )
        await session.flush()

        # --- Changes (2 — spend_summary) -------------------------------------
        change_specs = [
            (
                "change-tile-upgrade",
                "Tile upgrade — Carrara-look porcelain (60×60 cm)",
                18000.0,
                "Homeowner opted for premium vitrified tiles over standard ceramic.",
            ),
            (
                "change-extra-plugpoints",
                "Extra electrical plug points — TV wall + study nook",
                4500.0,
                "Two additional 15A plug points requested behind TV wall and study area.",
            ),
        ]
        for key, description, cost_delta, reason in change_specs:
            await _upsert(
                session,
                Change,
                _id(key, str(site_id)),
                site_id=site_id,
                description=description,
                cost_delta=cost_delta,
                reason=reason,
                requested_by=hw_user_id,
            )
        await session.flush()

        # --- HomeownerRequests (3 — My Requests card) ------------------------
        request_specs = [
            (
                "request-crack-wall",
                "Crack in guest bedroom wall",
                (
                    "There is a visible crack running diagonally across the guest bedroom "
                    "wall near the window. Approximately 30 cm long. Please inspect and "
                    "repair before plastering coat is applied."
                ),
                HomeownerRequestStatus.in_progress,
            ),
            (
                "request-uneven-tile",
                "Uneven tile in master bathroom",
                (
                    "One tile near the shower drain is slightly raised — about 3 mm — "
                    "compared to adjacent tiles. Creates a tripping hazard. Needs re-laying."
                ),
                HomeownerRequestStatus.seen,
            ),
            (
                "request-plug-behind-tv",
                "Add extra plug point behind TV",
                (
                    "We'd like an additional plug point centered 40 cm above the floor "
                    "on the TV-feature wall in the living room. Please confirm if it can "
                    "be added before the wall is plastered."
                ),
                HomeownerRequestStatus.sent,
            ),
        ]
        for key, title, detail, status in request_specs:
            await _upsert(
                session,
                HomeownerRequest,
                _id(key, str(site_id)),
                site_id=site_id,
                raised_by=hw_user_id,
                title=title,
                detail=detail,
                status=status,
            )

        await session.commit()

    return {
        "site_id": str(site_id),
        "company_id": str(company_id),
        "homeowner_user_id": str(hw_user_id) if hw_user_id else None,
        "property_display_name": "Green Valley Villa",
        "milestones_seeded": len(milestone_specs),
        "decisions_seeded": len(decision_specs),
        "updates_seeded": len(update_specs),
        "changes_seeded": len(change_specs),
        "requests_seeded": len(request_specs),
    }


def main() -> None:
    result = asyncio.run(seed())
    print("Home demo data seeded for SUNRISE-HOME (Green Valley Villa):")
    for k, v in result.items():
        print(f"  {k}: {v}")
    print()
    print("Login: phone +919855000099  otp 000000")
    print("Verify: GET /api/v1/homeowner/home")


if __name__ == "__main__":
    main()
