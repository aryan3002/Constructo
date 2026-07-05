"""Spec §6: the HOMEOWNER (owner/co_owner) holds theme/conflict/brief authority;
family can look, not commit; strangers see nothing.

AppError envelope shape: {"error": {"code", "message", <extra merged in>}}
(see app/common/errors.py::_envelope — ``extra`` keys are flattened directly
into ``error``, not nested under an ``extra`` key).
"""
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models.profiler import ConflictStatus, ProfilerConflict, ProfilerTheme
from app.profiler.extraction import get_llm
from tests.test_profiler_engine import auth
from tests.test_profiler_membrane import _world


def _brief_llm() -> FakeLLMClient:
    return FakeLLMClient(canned={
        "headline": "h", "summary": "s", "sections": [],
        "themes": [
            {"name": "T", "palette": ["beige"], "materials": ["light oak"], "rationale": "r"},
        ],
        "questions": ["q?"], "colors": ["dark"], "style": "minimal", "confidence": 0.9,
    })


async def _suggested_theme(db_session, pid, area_id) -> ProfilerTheme:
    t = ProfilerTheme(profile_id=pid, area_id=area_id, name="Warm Minimal",
                      palette=["oak"], materials=["light oak"], confidence=0.8,
                      evidence_reference_ids=[])
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)
    return t


async def test_owner_homeowner_approves_theme(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        # _world returns a dict: company, architect, site, pid, area_id, bid,
        # owner, co, family, advisor (tests/test_profiler_membrane.py:32-66)
        w = await _world(client, factory, db_session)
        theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
            json={"action": "approve"}, headers=auth(w["owner"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "approved"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_family_member_gets_comment_box_not_authority(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)  # w["family"] is already an active member
        theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
            json={"action": "approve"}, headers=auth(w["family"]))
        assert resp.status_code == 403
        body = resp.json()
        assert body["error"]["code"] == "approve_forbidden"
        assert body["error"]["can_comment"] is True
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_cross_company_homeowner_sees_404(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        stranger = await factory.user(role=w["owner"].role)  # no membership on this site
        theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
            json={"action": "approve"}, headers=auth(stranger))
        assert resp.status_code == 404  # membrane: existence not revealed
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_architect_path_still_works(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
            json={"action": "reject"}, headers=auth(w["architect"]))
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def _open_conflict(db_session, pid, area_id) -> ProfilerConflict:
    c = ProfilerConflict(profile_id=pid, area_id=area_id, dimension="colors",
                          value="dark", resolution_status=ConflictStatus.open)
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


async def test_owner_homeowner_resolves_conflict(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        conflict = await _open_conflict(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/conflicts/{conflict.id}/resolve",
            json={"resolution": "keep_a", "note": "warm woods win"}, headers=auth(w["owner"]))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["resolution_status"] == "resolved"
        assert body["decision_note"] == "warm woods win"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_owner_homeowner_defers_conflict_to_architect(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        conflict = await _open_conflict(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/conflicts/{conflict.id}/resolve",
            json={"resolution": "defer_to_architect"}, headers=auth(w["owner"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["resolution_status"] == "deferred_to_architect"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_family_member_cannot_resolve_conflict(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)  # w["family"] is already an active member
        conflict = await _open_conflict(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/conflicts/{conflict.id}/resolve",
            json={"resolution": "keep_a"}, headers=auth(w["family"]))
        assert resp.status_code == 403
        body = resp.json()
        assert body["error"]["code"] == "approve_forbidden"
        assert body["error"]["can_comment"] is True
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_cross_company_homeowner_sees_404_on_conflict(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        stranger = await factory.user(role=w["owner"].role)  # no membership on this site
        conflict = await _open_conflict(db_session, w["pid"], w["area_id"])
        resp = await client.post(f"/api/v1/design/conflicts/{conflict.id}/resolve",
            json={"resolution": "keep_a"}, headers=auth(stranger))
        assert resp.status_code == 404  # membrane: existence not revealed
    finally:
        app.dependency_overrides.pop(get_llm, None)
