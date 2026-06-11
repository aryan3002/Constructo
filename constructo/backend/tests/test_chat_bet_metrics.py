"""Kill-criteria rollup: weekly active senders, decision-origin split,
unknown/clarification rates per source — deterministic, no LLM."""
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.models import UserRole


async def test_compute_week_counts_senders_and_origin_split(client, db_session, factory):
    from app.metrics.chat_bet import compute_week
    from tests.test_chat_api import auth

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi",
              "capture_type": "attendance", "fields": {"headcount": 4}},
        headers=auth(owner),
    )
    week_start = datetime.now(UTC) - timedelta(days=3)
    snapshot = await compute_week(db_session, company.id, week_start=week_start)
    assert snapshot["weekly_senders"] == 1
    assert snapshot["messages_total"] == 1
    assert "decision_origin" in snapshot and "extraction" in snapshot


async def test_compute_week_extraction_worker_populates_events(client, db_session, factory):
    """After extraction runs, events_total >= 1 and per_source is populated."""
    from sqlalchemy import select

    from app.extraction.worker import handle_ingested
    from app.metrics.chat_bet import compute_week
    from app.models import RawMessageModel
    from tests.test_chat_api import _session_factory, auth

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)

    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "5 mistri aaye",
            "capture_type": "attendance",
            "fields": {"headcount": 5},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text

    raw = (
        await db_session.execute(
            select(RawMessageModel).where(RawMessageModel.source == "app_chat")
        )
    ).scalars().one()
    await handle_ingested(raw.id, _session_factory(db_session))

    week_start = datetime.now(UTC) - timedelta(days=3)
    snapshot = await compute_week(db_session, company.id, week_start=week_start)

    extraction = snapshot["extraction"]
    assert extraction["events_total"] >= 1
    # per_source should be populated for app_chat since that's what we sent
    per_source = extraction["per_source"]
    assert "app_chat" in per_source
    assert per_source["app_chat"]["total"] >= 1
