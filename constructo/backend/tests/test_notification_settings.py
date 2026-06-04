"""Notification & SLA settings + sweep wiring (W4.7)."""
from datetime import UTC, datetime, timedelta

from app.approvals.sla import run_sla_sweep
from app.auth.jwt import create_access_token
from app.models import Decision, DecisionKind, DecisionState, UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_get_settings_defaults(client, factory, db_session):
    owner = await factory.user(role=UserRole.owner)
    await db_session.commit()
    resp = await client.get("/api/v1/notifications/settings", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"sla_hours": 24, "escalate_overdue": True, "daily_digest": True}


async def test_owner_updates_settings(client, factory, db_session):
    owner = await factory.user(role=UserRole.owner)
    await db_session.commit()
    resp = await client.put(
        "/api/v1/notifications/settings",
        json={"sla_hours": 48, "escalate_overdue": False},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["sla_hours"] == 48
    assert body["escalate_overdue"] is False
    assert body["daily_digest"] is True  # unchanged

    # Persisted.
    again = await client.get("/api/v1/notifications/settings", headers=auth(owner))
    assert again.json()["sla_hours"] == 48


async def test_non_owner_cannot_write_settings(client, factory, db_session):
    pm = await factory.user(role=UserRole.pm)
    await db_session.commit()
    resp = await client.put(
        "/api/v1/notifications/settings",
        json={"sla_hours": 12},
        headers=auth(pm),
    )
    assert resp.status_code == 403


async def _overdue_decision(factory, company, db_session) -> Decision:
    d = Decision(
        company_id=company.id,
        kind=DecisionKind.approval,
        title="Approve cement",
        state=DecisionState.pending,
        sla_due_at=datetime.now(UTC) - timedelta(hours=1),
        evidence_event_ids=[],
    )
    db_session.add(d)
    await db_session.flush()
    return d


async def test_sweep_escalates_by_default(client, factory, db_session):
    company = await factory.company()
    await factory.user(company=company, role=UserRole.owner)
    d = await _overdue_decision(factory, company, db_session)
    await db_session.commit()

    escalated = await run_sla_sweep(db_session, company_id=company.id)
    assert d.id in escalated


async def test_sweep_skips_when_escalation_disabled(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    d = await _overdue_decision(factory, company, db_session)
    await db_session.commit()

    # Owner turns escalation off.
    await client.put(
        "/api/v1/notifications/settings",
        json={"escalate_overdue": False},
        headers=auth(owner),
    )

    escalated = await run_sla_sweep(db_session, company_id=company.id)
    assert d.id not in escalated
    await db_session.refresh(d)
    assert d.state == DecisionState.pending
