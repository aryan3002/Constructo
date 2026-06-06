"""Standing Sentinel (Phase 3.1) — absence + stuck-thing radar, deterministic."""
from datetime import date, timedelta

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import ActionItem, ActionItemStatus, SiteEventModel, UserRole
from app.sentinel.sentinel import build_signals, is_active_site

TODAY = date(2026, 6, 1)


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


# --- pure detector --------------------------------------------------------


def test_active_site_threshold():
    assert is_active_site(3) is True
    assert is_active_site(2) is False


def test_absence_signal_on_active_site():
    days = {TODAY - timedelta(days=i) for i in range(1, 5)}  # 4 prior active days
    sig = build_signals(
        today=TODAY, attendance_days=days, overdue_action_items=[], overdue_materials=[]
    )
    assert len(sig) == 1
    assert sig[0].kind == "attendance_absence"
    assert sig[0].severity == "high"


def test_no_absence_when_attendance_today():
    days = {TODAY - timedelta(days=i) for i in range(0, 4)}  # includes today
    sig = build_signals(
        today=TODAY, attendance_days=days, overdue_action_items=[], overdue_materials=[]
    )
    assert sig == []


def test_no_absence_on_quiet_site():
    days = {TODAY - timedelta(days=2)}  # only 1 active day → not active
    sig = build_signals(
        today=TODAY, attendance_days=days, overdue_action_items=[], overdue_materials=[]
    )
    assert sig == []


def test_action_item_overdue_severity_escalates():
    sig = build_signals(
        today=TODAY,
        attendance_days=set(),
        overdue_action_items=[("Fix railing", TODAY - timedelta(days=10)),
                              ("Order tiles", TODAY - timedelta(days=2))],
        overdue_materials=[],
    )
    kinds = [(s.kind, s.severity) for s in sig]
    assert ("action_item_overdue", "high") in kinds  # 10 days
    assert ("action_item_overdue", "medium") in kinds  # 2 days
    # high sorts before medium
    assert sig[0].severity == "high"


def test_material_overdue_signal():
    sig = build_signals(
        today=TODAY, attendance_days=set(), overdue_action_items=[],
        overdue_materials=[("cement", 12, 5.0)],
    )
    assert sig[0].kind == "material_overdue"
    assert "cement" in sig[0].message


# --- API ------------------------------------------------------------------


def _att(site_id, days_ago):
    return SiteEventModel(
        site_id=site_id, event_type="attendance",
        occurred_on=date.today() - timedelta(days=days_ago), summary="attendance",
        fields={"headcount": 10}, confidence=1.0, needs_clarification=False,
        source_message_ids=[],
    )


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_sentinel_endpoint_flags_absence_and_overdue_item(client, db_session, world):
    company, owner, site = world
    # Active site (attendance on 4 prior days) but nothing today → absence.
    db_session.add_all([_att(site.id, d) for d in (1, 2, 3, 4)])
    db_session.add(
        ActionItem(
            company_id=company.id, site_id=site.id, title="Fix railing",
            status=ActionItemStatus.open, due_on=date.today() - timedelta(days=5),
        )
    )
    await db_session.flush()
    resp = await client.get(f"/api/v1/sentinel?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    kinds = {s["kind"] for s in body["signals"]}
    assert "attendance_absence" in kinds
    assert "action_item_overdue" in kinds
    assert body["count"] >= 2
    assert "urgent" in body["summary"]


async def test_sentinel_all_clear(client, db_session, world):
    _, owner, site = world
    db_session.add(_att(site.id, 0))  # attendance today, quiet otherwise
    await db_session.flush()
    resp = await client.get(f"/api/v1/sentinel?site_id={site.id}", headers=auth(owner))
    assert resp.json()["summary"] == "All clear — nothing's slipping."


async def test_sentinel_homeowner_blocked(client, factory, world):
    company, _, site = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.get(f"/api/v1/sentinel?site_id={site.id}", headers=auth(homeowner))
    assert resp.status_code == 403
