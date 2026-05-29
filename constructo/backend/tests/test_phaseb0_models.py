"""Phase B0 foundation: exercise every new table via the ORM (create_all path)."""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    EventEmbedding,
    Payment,
    PaymentDirection,
    PaymentStatus,
    Permit,
    PermitStatus,
    SiteBaseline,
    SiteEventModel,
)


async def _site(factory):
    company = await factory.company()
    site = await factory.site(company)
    return company, site


async def _site_event(db_session, site):
    ev = SiteEventModel(
        site_id=site.id,
        event_type="payment_request",
        occurred_on=date(2026, 5, 29),
        summary="Mason asked for ₹20,000 advance",
        fields={"amount": 20000},
        confidence=0.9,
        source_message_ids=[],
    )
    db_session.add(ev)
    await db_session.flush()
    return ev


async def test_payment_roundtrip(db_session, factory):
    company, site = await _site(factory)
    ev = await _site_event(db_session, site)
    pay = Payment(
        company_id=company.id,
        site_id=site.id,
        direction=PaymentDirection.contractor_to_supplier,
        counterparty_name="Shree Cement",
        amount=Decimal("125000.50"),
        paid_on=date(2026, 5, 29),
        method="upi",
        source_event_id=ev.id,
    )
    db_session.add(pay)
    await db_session.flush()
    await db_session.refresh(pay)

    assert pay.id is not None
    assert pay.currency == "INR"  # server default
    assert pay.status == PaymentStatus.recorded  # server default
    assert pay.amount == Decimal("125000.50")
    assert pay.source_event_id == ev.id


async def test_permit_roundtrip(db_session, factory):
    company, site = await _site(factory)
    permit = Permit(
        company_id=company.id,
        site_id=site.id,
        permit_type="RERA",
        authority="MahaRERA",
        applied_on=date(2026, 1, 10),
    )
    db_session.add(permit)
    await db_session.flush()
    await db_session.refresh(permit)

    assert permit.status == PermitStatus.not_started  # server default
    assert permit.decided_on is None


async def test_decision_defaults(db_session, factory):
    company, site = await _site(factory)
    dec = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.homeowner_question,
        title="Can we use vitrified tiles in the lobby?",
    )
    db_session.add(dec)
    await db_session.flush()
    await db_session.refresh(dec)

    assert dec.state == DecisionState.pending  # server default
    assert dec.evidence_event_ids == []  # server default '{}'
    assert dec.created_at is not None
    assert dec.updated_at is not None


async def test_site_baseline_is_unique_per_site(db_session, factory):
    _, site = await _site(factory)
    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=24))
    await db_session.flush()

    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=30))
    with pytest.raises(IntegrityError):  # unique violation on site_id
        await db_session.flush()


async def test_event_embedding_roundtrip(db_session, factory):
    _, site = await _site(factory)
    ev = await _site_event(db_session, site)
    emb = EventEmbedding(
        site_event_id=ev.id,
        embedding=[0.0] * 1536,
        model="text-embedding-3-small",
    )
    db_session.add(emb)
    await db_session.flush()

    fetched = (
        await db_session.execute(select(EventEmbedding).where(EventEmbedding.id == emb.id))
    ).scalar_one()
    assert len(list(fetched.embedding)) == 1536
    assert fetched.model == "text-embedding-3-small"


async def test_user_language_defaults_to_en(db_session, factory):
    user = await factory.user()
    await db_session.refresh(user)
    assert user.language == "en"  # server default
