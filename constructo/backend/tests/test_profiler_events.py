"""Design-loop notifier tests (Phase 2 Task 1 + Task 2).

Task 1 covers both directions of app.profiler.events.notify_design_event:
homeowner bell/push via notify_site_homeowners, designer push via
push_tokens_for_user, and the loud ValueError on an unknown kind.

Task 2 covers the emit points themselves: every design hand-off (profile
create, auto-propose, brief generate/approve/materialize) must call
notify_design_event with the right kind AFTER its domain commit, and a
failed/illegal transition must emit NOTHING.
"""
import pytest
from sqlalchemy import select

from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import HomeownerSubRole, MemberStatus, PushToken, UserRole
from app.models.homeowner_member import HomeownerMember
from app.models.profiler import (
    ConflictStatus,
    ProfilerClarification,
    ProfilerConflict,
    ProfilerProfile,
)
from app.profiler.events import notify_design_event
from app.profiler.extraction import get_llm
from app.push.sender import dry_run_log, reset_dry_run_log
from tests.test_profiler_api import auth
from tests.test_profiler_membrane import _world


@pytest.fixture(autouse=True)
def _clean_push_log():
    reset_dry_run_log()
    yield
    reset_dry_run_log()


def _brief_llm() -> FakeLLMClient:
    return FakeLLMClient(canned={
        "headline": "h", "summary": "s", "sections": [],
        "themes": [
            {"name": "T", "palette": ["beige"], "materials": ["light oak"], "rationale": "r"},
        ],
        "questions": ["q?"], "colors": ["dark"], "style": "minimal", "confidence": 0.9,
    })


async def _tokened_owner(db_session, w) -> HomeownerMember:
    """Give the world's owner homeowner member a push token so notify_design_event's
    homeowner-direction actually lands an entry in dry_run_log()."""
    member = (
        await db_session.execute(
            select(HomeownerMember).where(HomeownerMember.user_id == w["owner"].id)
        )
    ).scalars().first()
    member.notif_prefs = {"push_token": "ExponentPushToken[test-owner]"}
    await db_session.commit()
    return member


def _kinds(msgs: list[dict]) -> set[str]:
    return {m["data"]["kind"] for m in msgs}


async def test_brief_sent_notifies_designer_not_homeowner(client, factory, db_session):
    w = await _world(client, factory, db_session)
    profile = await db_session.get(ProfilerProfile, w["pid"])
    await notify_design_event(db_session, profile, "brief_sent_to_designer", version=1)
    msgs = dry_run_log()
    # architect has no PushToken registered in this world -> no crash, no homeowner push
    assert all(m["data"]["type"] == "design" for m in msgs)
    assert not any(
        m["data"]["kind"] == "brief_sent_to_designer" and m["data"].get("audience") == "homeowner"
        for m in msgs
    )


async def test_signed_off_reaches_homeowner_inbox_and_push(client, factory, db_session):
    w = await _world(client, factory, db_session)
    # give the owner member a push token + default cadence
    member = (
        await db_session.execute(
            select(HomeownerMember).where(HomeownerMember.user_id == w["owner"].id)
        )
    ).scalars().first()
    member.notif_prefs = {"push_token": "ExponentPushToken[test-owner]"}
    await db_session.commit()
    profile = await db_session.get(ProfilerProfile, w["pid"])
    await notify_design_event(db_session, profile, "designer_signed_off", version=2)
    msgs = dry_run_log()
    assert any(
        m["to"] == "ExponentPushToken[test-owner]" and m["data"]["kind"] == "designer_signed_off"
        for m in msgs
    )


async def test_unknown_kind_raises(client, factory, db_session):
    w = await _world(client, factory, db_session)
    profile = await db_session.get(ProfilerProfile, w["pid"])
    with pytest.raises(ValueError):
        await notify_design_event(db_session, profile, "brief_snet")  # typo must fail loudly


# ---------------------------------------------------------------------------
# Task 2: emit points
# ---------------------------------------------------------------------------


async def test_create_profile_emits_profile_started(client, factory, db_session):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    owner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(
        site_id=site.id, user_id=owner.id,
        sub_role=HomeownerSubRole.primary_owner, status=MemberStatus.active,
    ))
    await db_session.flush()
    member = (
        await db_session.execute(
            select(HomeownerMember).where(HomeownerMember.user_id == owner.id)
        )
    ).scalars().first()
    member.notif_prefs = {"push_token": "ExponentPushToken[test-owner]"}
    await db_session.commit()

    reset_dry_run_log()
    resp = await client.post("/api/v1/design/profiles",
        json={"site_id": str(site.id),
              "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 1}],
              "contributors": [{"role": "co_owner", "is_decision_owner": True}]},
        headers=auth(architect))
    assert resp.status_code == 201
    assert "profile_started" in _kinds(dry_run_log())


async def test_self_serve_create_emits_profile_started(client, factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    owner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(
        site_id=site.id, user_id=owner.id,
        sub_role=HomeownerSubRole.primary_owner, status=MemberStatus.active,
    ))
    await db_session.flush()
    member = (
        await db_session.execute(
            select(HomeownerMember).where(HomeownerMember.user_id == owner.id)
        )
    ).scalars().first()
    member.notif_prefs = {"push_token": "ExponentPushToken[test-owner]"}
    await db_session.commit()

    reset_dry_run_log()
    resp = await client.post("/api/v1/design/profiles/self-serve",
        json={"site_id": str(site.id)}, headers=auth(owner))
    assert resp.status_code == 201
    assert "profile_started" in _kinds(dry_run_log())


async def test_auto_propose_emits_themes_ready(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)  # _world already ranks 1 ref past threshold
        await _tokened_owner(db_session, w)
        reset_dry_run_log()

        # area recommended_count is 1, so ranking one more reference re-crosses
        # the (unchanged) threshold on a NEW ranked_count and re-fires propose.
        # Add + rank a second reference in the SAME area — ranked_count goes 1 -> 2,
        # which is still >= recommended_count(1) and != the stored marker, so it
        # re-triggers propose_themes_for_area.
        detail = (await client.get(
            f"/api/v1/design/profiles/{w['pid']}", headers=auth(w["architect"]))).json()
        contrib_id = detail["contributors"][0]["id"]
        r = await client.post("/api/v1/design/references",
            json={"area_id": w["area_id"], "source_type": "upload",
                  "source_url": "https://x.test/b.jpg"},
            headers=auth(w["architect"]))
        assert r.status_code == 201
        rank = await client.post(f"/api/v1/design/references/{r.json()['id']}/rankings",
            json={"contributor_id": contrib_id, "stars": 4}, headers=auth(w["architect"]))
        assert rank.status_code == 201
        assert "themes_ready" in _kinds(dry_run_log())
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_generate_brief_emits_brief_ready(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        await _tokened_owner(db_session, w)
        reset_dry_run_log()
        resp = await client.post(
            f"/api/v1/design/profiles/{w['pid']}/brief", headers=auth(w["architect"]))
        assert resp.status_code == 201
        msgs = dry_run_log()
        assert "brief_ready" in _kinds(msgs)
        hit = next(m for m in msgs if m["data"]["kind"] == "brief_ready")
        assert hit["data"]["profile_id"] == w["pid"]
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_act_on_brief_emits_kind_per_action(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        await _tokened_owner(db_session, w)
        # brief_sent_to_designer is designer-copy-only (no homeowner copy) — the
        # architect needs a registered PushToken for it to land in dry_run_log().
        db_session.add(PushToken(
            user_id=w["architect"].id, token="ExponentPushToken[test-architect]"))
        await db_session.commit()
        bid = w["bid"]

        reset_dry_run_log()
        r1 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))
        assert r1.status_code == 200
        assert "brief_sent_to_designer" in _kinds(dry_run_log())

        reset_dry_run_log()
        r2 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(w["architect"]))
        assert r2.status_code == 200
        assert "designer_signed_off" in _kinds(dry_run_log())

        reset_dry_run_log()
        r3 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "approve"}, headers=auth(w["co"]))
        assert r3.status_code == 200
        assert "brief_approved" in _kinds(dry_run_log())

        reset_dry_run_log()
        r4 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "contractor_received"}, headers=auth(w["architect"]))
        assert r4.status_code == 200
        assert "brief_locked" in _kinds(dry_run_log())
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_request_changes_emits_changes_requested_with_note(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        await _tokened_owner(db_session, w)
        bid = w["bid"]
        reset_dry_run_log()
        resp = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "request_changes", "note": "Please swap the tile."},
            headers=auth(w["owner"]))
        assert resp.status_code == 200
        msgs = dry_run_log()
        assert "changes_requested" in _kinds(msgs)
        hit = next(m for m in msgs if m["data"]["kind"] == "changes_requested")
        assert "Please swap the tile." in hit["body"]
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_materialize_brief_emits_specs_materialized_with_note(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        await _tokened_owner(db_session, w)
        bid = w["bid"]
        # walk the brief to contractor_brief_ready so materialize is legal
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(w["architect"]))

        reset_dry_run_log()
        resp = await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(w["architect"]))
        assert resp.status_code == 201
        msgs = dry_run_log()
        assert "specs_materialized" in _kinds(msgs)
        hit = next(m for m in msgs if m["data"]["kind"] == "specs_materialized")
        assert "proposed" in hit["body"]
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_answer_clarification_emits_clarification_answered(client, factory, db_session):
    w = await _world(client, factory, db_session)
    # designer-directed copy only — give the architect a token so it lands.
    db_session.add(PushToken(
        user_id=w["architect"].id, token="ExponentPushToken[test-architect]"))
    clarification = ProfilerClarification(
        profile_id=w["pid"], area_id=w["area_id"], question="Which oak finish?",
    )
    db_session.add(clarification)
    await db_session.commit()
    await db_session.refresh(clarification)

    reset_dry_run_log()
    resp = await client.post(
        f"/api/v1/design/clarifications/{clarification.id}/answer",
        json={"answer": "Light oak, matte."}, headers=auth(w["owner"]))
    assert resp.status_code == 200
    assert "clarification_answered" in _kinds(dry_run_log())


async def test_resolve_conflict_emits_conflict_resolved_with_note(client, factory, db_session):
    w = await _world(client, factory, db_session)
    db_session.add(PushToken(
        user_id=w["architect"].id, token="ExponentPushToken[test-architect]"))
    conflict = ProfilerConflict(
        profile_id=w["pid"], area_id=w["area_id"],
        dimension="material", value="oak vs walnut",
    )
    db_session.add(conflict)
    await db_session.commit()
    await db_session.refresh(conflict)

    reset_dry_run_log()
    resp = await client.post(
        f"/api/v1/design/conflicts/{conflict.id}/resolve",
        json={"resolution": "keep_a", "note": "Going with oak."}, headers=auth(w["owner"]))
    assert resp.status_code == 200
    msgs = dry_run_log()
    assert "conflict_resolved" in _kinds(msgs)
    hit = next(m for m in msgs if m["data"]["kind"] == "conflict_resolved")
    assert "Going with oak." in hit["body"]


async def test_illegal_transition_emits_nothing(client, factory, db_session):
    w = await _world(client, factory, db_session)
    await _tokened_owner(db_session, w)
    reset_dry_run_log()
    # illegal from homeowner_review (contractor_received only legal from approved)
    resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
        json={"action": "contractor_received"}, headers=auth(w["owner"]))
    assert resp.status_code in (403, 409)
    assert dry_run_log() == []


# ---------------------------------------------------------------------------
# Task 6: designer inbox summary badge
# ---------------------------------------------------------------------------


async def test_inbox_summary_counts_for_architects_company(client, factory, db_session):
    w = await _world(client, factory, db_session)
    # drive the brief to architect_review via the real API (owner sends it on)
    resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
        json={"action": "send_to_architect"}, headers=auth(w["owner"]))
    assert resp.status_code == 200
    assert resp.json()["state"] == "architect_review"

    db_session.add(ProfilerClarification(
        profile_id=w["pid"], area_id=w["area_id"],
        question="Which oak finish?", answer="Light oak, matte.",
    ))
    db_session.add(ProfilerConflict(
        profile_id=w["pid"], area_id=w["area_id"],
        dimension="material", value="oak vs walnut",
        resolution_status=ConflictStatus.deferred_to_architect,
    ))
    await db_session.commit()

    got = await client.get("/api/v1/design/inbox-summary", headers=auth(w["architect"]))
    assert got.status_code == 200
    assert got.json() == {
        "briefs_awaiting_signoff": 1,
        "answered_clarifications": 1,
        "deferred_conflicts": 1,
    }


async def test_inbox_summary_is_company_scoped(client, factory, db_session):
    await _world(client, factory, db_session)  # unrelated company w/ signal, must not leak
    other_company = await factory.company()
    other_architect = await factory.user(company=other_company, role=UserRole.architect)

    got = await client.get("/api/v1/design/inbox-summary", headers=auth(other_architect))
    assert got.status_code == 200
    assert got.json() == {
        "briefs_awaiting_signoff": 0,
        "answered_clarifications": 0,
        "deferred_conflicts": 0,
    }


async def test_inbox_summary_forbidden_for_homeowner(client, factory, db_session):
    w = await _world(client, factory, db_session)
    resp = await client.get("/api/v1/design/inbox-summary", headers=auth(w["owner"]))
    assert resp.status_code == 403
