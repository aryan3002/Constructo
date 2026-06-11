"""Kill-criteria rollup: weekly active senders, decision-origin split,
unknown/clarification rates per source — deterministic, no LLM."""
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.models import SiteEventModel, UserRole


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


async def test_compute_week_excludes_superseded_events(client, db_session, factory):
    """A superseded event must not be counted — events_total reflects only the
    latest version when an owner correction creates a superseding event."""
    from app.extraction.worker import handle_ingested
    from app.metrics.chat_bet import compute_week
    from app.models import ChatMessage
    from tests.test_chat_api import _session_factory, auth

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)

    # Send a message and run extraction to produce a SiteEvent.
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "45 bori cement",
            "capture_type": "delivery",
            "fields": {"material": "cement", "quantity": 45},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    msg_id = resp.json()["id"]

    raw_id = (await db_session.get(ChatMessage, msg_id)).raw_message_id
    event_ids = await handle_ingested(raw_id, _session_factory(db_session))
    assert len(event_ids) == 1
    original_event = await db_session.get(SiteEventModel, event_ids[0])

    # Manually create a superseding event (version 2) that references the original.
    # This mirrors what _apply_reply_correction does for card edits.
    superseding = SiteEventModel(
        id=uuid4(),
        site_id=site.id,
        event_type=original_event.event_type,
        occurred_on=original_event.occurred_on,
        summary="45 nahi 54 bori cement",
        fields={**original_event.fields, "quantity": 54},
        confidence=1.0,
        needs_clarification=False,
        source_message_ids=original_event.source_message_ids,
        version=2,
        supersedes_event_id=original_event.id,
    )
    db_session.add(superseding)
    await db_session.flush()

    # Now both events exist in the DB (original + superseding).
    # compute_week must count only 1 (the latest), not 2.
    week_start = datetime.now(UTC) - timedelta(days=3)
    snapshot = await compute_week(db_session, company.id, week_start=week_start)
    assert snapshot["extraction"]["events_total"] == 1, (
        "events_total should be 1 (only the superseding event), "
        "not 2 (would double-count without latest_event_clause)"
    )


async def test_chat_bet_endpoint_owner_gate_and_empty(client, factory):
    """Non-owner → 403; owner with no persisted snapshots → 200 empty list."""
    from tests.test_chat_api import auth

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)

    # Non-owner gets 403.
    resp = await client.get("/api/v1/metrics/chat-bet", headers=auth(supervisor))
    assert resp.status_code == 403

    # Owner with no snapshots yet gets 200 and an empty list.
    resp = await client.get("/api/v1/metrics/chat-bet", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json() == []
