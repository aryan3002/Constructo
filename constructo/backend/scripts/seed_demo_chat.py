"""Seed a fully-populated demo SITE for the homeowner +919999999999 so you can
see the chat in full flesh.

Safe + additive: it finds the existing homeowner user (by phone) and creates a
DEDICATED demo site "Verma Residence" inside HER OWN company — it never touches
any of her existing sites/conversations. On that demo site it seeds:
  - her published slice (property, milestones, updates incl. a rain delay, weekly
    summary) so Home/Updates aren't empty;
  - her 1:1 builder channel with a realistic two-sided conversation;
  - a couple of FLAGGED capture cards (Slice D — a message that booked a
    needs_clarification SiteEvent, the amber "Check this" card);
  - pending Decisions + Updates that the Home Room weaves into the thread.

Run from backend/:  uv run python -m scripts.seed_demo_chat

IDEMPOTENT: deterministic uuid5 ids; re-running upserts in place. She reaches the
demo via her Messages inbox → the "Your builder · Verma Residence" channel.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (
    ChatMessage,
    Company,
    Conversation,
    ConversationKind,
    Decision,
    DecisionKind,
    DecisionState,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    Milestone,
    MilestoneStatus,
    Property,
    RawMessageModel,
    Site,
    SiteEventModel,
    Update,
    UpdateType,
    User,
    UserRole,
    WeeklySummary,
)
from app.models.chat import MessageSide

NS = uuid5(NAMESPACE_URL, "constructo.seed.demo-chat-9999")
HOMEOWNER_PHONE = "+919999999999"


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


TODAY = datetime.now(UTC).date()
NOW = datetime.now(UTC)


async def _upsert(session, model, ident: UUID, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for key, value in fields.items():
            setattr(obj, key, value)
    return obj


async def seed() -> dict[str, object]:
    counts: dict[str, object] = {}
    async with SessionLocal() as session:
        # --- The homeowner + her company (she already exists from a prior join) --
        homeowner = (
            await session.execute(select(User).where(User.phone == HOMEOWNER_PHONE))
        ).scalar_one_or_none()
        if homeowner is None:
            company = await _upsert(session, Company, _id("company"), name="Verma Constructions")
            await session.flush()
            homeowner = User(
                id=_id("user", "homeowner"), company_id=company.id, phone=HOMEOWNER_PHONE,
                role=UserRole.homeowner, name="Mrs. Verma", language="en",
            )
            session.add(homeowner)
            await session.flush()
        else:
            company = await session.get(Company, homeowner.company_id)

        # --- A DEDICATED demo site in HER company (never her real sites) ---------
        site = await _upsert(
            session, Site, _id("site"),
            company_id=company.id, name="Verma Residence",
            location="Gomti Nagar, Lucknow", type="residential", status="active",
        )
        await session.flush()
        await _upsert(
            session, HomeownerMember, _id("member"),
            site_id=site.id, user_id=homeowner.id, sub_role=HomeownerSubRole.primary_owner,
            notif_prefs={}, phone=HOMEOWNER_PHONE, join_code="VERMA-HOME",
            status=MemberStatus.active,
        )

        # A builder (owner) for the contractor side of the chat — reuse one or make one.
        builder = (
            await session.execute(
                select(User)
                .where(User.company_id == company.id, User.role == UserRole.owner)
                .limit(1)
            )
        ).scalar_one_or_none()
        if builder is None:
            builder = await _upsert(
                session, User, _id("user", "builder"),
                company_id=company.id, phone="+919900000099", role=UserRole.owner,
                name="Anil Verma (Builder)", language="en",
            )
            await session.flush()

        # --- Published slice on the demo site ------------------------------------
        await _upsert(
            session, Property, _id("property"),
            company_id=company.id, site_id=site.id, display_name="Verma Residence",
            type="villa", status="building",
            started_on=TODAY - timedelta(days=95),
            expected_handover_on=TODAY + timedelta(days=130),
        )
        for mkey, name, status, order in [
            ("foundation", "Foundation", MilestoneStatus.done, 0),
            ("structure", "Structure & slabs", MilestoneStatus.now, 1),
            ("interiors", "Interiors & finishes", MilestoneStatus.upcoming, 2),
            ("handover", "Handover", MilestoneStatus.upcoming, 3),
        ]:
            done = status == MilestoneStatus.done
            now_ms = status == MilestoneStatus.now
            await _upsert(
                session, Milestone, _id("milestone", mkey),
                site_id=site.id, name=name, status=status, order=order,
                started_on=(TODAY - timedelta(days=12)) if now_ms else None,
                completed_on=(TODAY - timedelta(days=50)) if done else None,
                expected_on=(TODAY + timedelta(days=25)) if now_ms else None,
            )
        await _upsert(
            session, Update, _id("update", "slab"),
            site_id=site.id, type=UpdateType.progress, title="First-floor slab poured",
            body="The first-floor slab was poured and is curing well.",
            published_by=builder.id, published_at=NOW - timedelta(days=3),
        )
        await _upsert(
            session, Update, _id("update", "milestone"),
            site_id=site.id, type=UpdateType.milestone, title="Structure phase underway",
            body="We've moved into the structure & slabs phase.",
            published_by=builder.id, published_at=NOW - timedelta(days=2),
        )
        await _upsert(
            session, Update, _id("update", "delay"),
            site_id=site.id, type=UpdateType.delay, title="Brickwork pushed by two days",
            body="Heavy rain stopped brickwork for two days.",
            revised_date=TODAY + timedelta(days=2), impact_days=2, reason="Two days of heavy rain",
            published_by=builder.id, published_at=NOW - timedelta(days=1),
        )
        await _upsert(
            session, WeeklySummary, _id("weekly"),
            site_id=site.id, week_start=TODAY - timedelta(days=TODAY.weekday()),
            text=(
                "This week the team finished the first-floor slab and began the "
                "structure phase. A short rain delay aside, everything is on track."
            ),
            published_by=builder.id,
        )
        await _upsert(
            session, Decision, _id("decision", "tiles"),
            company_id=company.id, site_id=site.id, kind=DecisionKind.homeowner_question,
            title="Approve the bathroom tile selection?",
            detail="The matte ivory tiles you liked are in stock. Shall we proceed?",
            raised_by=builder.id, assigned_to=homeowner.id, state=DecisionState.pending,
            sla_due_at=NOW + timedelta(days=3),
        )
        await _upsert(
            session, Decision, _id("decision", "handover"),
            company_id=company.id, site_id=site.id, kind=DecisionKind.homeowner_question,
            title="Confirm the revised handover window (mid-October)?",
            detail="With the structure on track we expect handover by mid-October.",
            raised_by=builder.id, assigned_to=homeowner.id, state=DecisionState.pending,
            sla_due_at=NOW + timedelta(days=5),
        )

        # --- The chat: her 1:1 builder channel on the demo site ------------------
        conv = (
            await session.execute(
                select(Conversation).where(
                    Conversation.site_id == site.id,
                    Conversation.kind == ConversationKind.homeowner,
                )
            )
        ).scalar_one_or_none()
        if conv is None:
            conv = Conversation(
                id=_id("conv"), company_id=company.id, site_id=site.id,
                kind=ConversationKind.homeowner, created_by=builder.id,
            )
            session.add(conv)
            await session.flush()

        H, C = MessageSide.homeowner, MessageSide.contractor
        script: list[tuple] = [
            (C, "Good morning! The first-floor slab is curing nicely, on track.", 3, None),
            (H, "Wonderful 🙏 When does the brickwork start?", 3, None),
            (C, "Ground-floor brickwork starts in a couple of days — I'll share photos.", 3, None),
            (H, "Perfect. Could we also add one more power socket near the study window?", 2, None),
            (C, "Noted 👍 I'll add it to the electrical plan and confirm the cost.", 2, None),
            (H, "12 mistri aaye aaj, kaam tezi se chal raha hai", 1, "attendance"),
            (C, "Thank you for the update! I've confirmed it with the site supervisor.", 1, None),
            (C, "Kitchen cabinet material arrived today. Sharing the note.", 1, "delivery"),
            (H, "Great — it all looks like it's moving well 😊", 0, None),
        ]

        next_seq = conv.last_seq or 0
        last_at = conv.last_message_at or NOW
        for i, (side, body, days_ago, capture) in enumerate(script):
            msg_id = _id("msg", str(i))
            if await session.get(ChatMessage, msg_id) is not None:
                continue  # already seeded — keep its seq (idempotent)
            next_seq += 1
            at = NOW - timedelta(days=days_ago, minutes=(len(script) - i) * 7)
            last_at = at
            sender = homeowner if side is H else builder
            raw_id = None
            if capture:
                raw = await _upsert(
                    session, RawMessageModel, _id("raw", str(i)),
                    source="app_chat", external_group_id=f"app:{site.id}",
                    sender_id=str(sender.id), sender_name=sender.name,
                    media_type="text", text=body, sent_at=at, received_at=at,
                    raw={"client": "app_chat", "site_id": str(site.id), "sender_side": side.value},
                )
                await session.flush()
                raw_id = raw.id
                if capture == "attendance":
                    ev_type, ev_summary = "attendance", "12 mistri aaye (homeowner reported)"
                    ev_fields = {"headcount": 12, "raw_phrase": "12 mistri aaye"}
                else:
                    ev_type = "material_delivery"
                    ev_summary = "Kitchen cabinet material delivered (homeowner reported)"
                    ev_fields = {"material": "kitchen cabinets", "vendor": "WoodWorks"}
                await _upsert(
                    session, SiteEventModel, _id("event", str(i)),
                    site_id=site.id, event_type=ev_type, occurred_on=at.date(),
                    summary=ev_summary, fields=ev_fields, confidence=0.7,
                    needs_clarification=True, source_message_ids=[raw_id], version=1,
                )
            session.add(
                ChatMessage(
                    id=msg_id, conversation_id=conv.id, sender_id=sender.id, sender_side=side,
                    client_msg_id=_id("cmid", str(i)), seq=next_seq, body=body,
                    media_type="text", raw_message_id=raw_id, created_at=at,
                )
            )
        if next_seq > (conv.last_seq or 0):
            conv.last_seq = next_seq
            conv.last_message_at = last_at

        await session.commit()

        counts["company"] = company.name
        counts["site"] = site.name
        counts["messages_total"] = next_seq
    return counts


def main() -> None:
    counts = asyncio.run(seed())
    print("✅ Seeded demo chat for homeowner +919999999999:")
    for k, v in counts.items():
        print(f"   - {k}: {v}")
    print("\nReach it in the app (already logged in as +919999999999):")
    print("   Messages tab → 'Your builder · Verma Residence' → the full thread")
    print("\nWhat you'll see:")
    print("   - A full two-sided builder↔homeowner conversation")
    print("   - 2 amber 'Check this' capture cards (reported attendance + delivery)")
    print("   - Updates + pending decisions woven into the thread (approve/comment)")
    print("   - Home/Updates populated (property, milestones, a rain delay, weekly summary)")
    print("\nIf NOT logged in: 'I have a join code' → VERMA-HOME + +919999999999 + OTP 000000")


if __name__ == "__main__":
    main()
