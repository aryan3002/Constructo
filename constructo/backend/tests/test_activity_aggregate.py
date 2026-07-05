"""Unit tests for the pure activity aggregation (no DB, no network)."""
from __future__ import annotations

import datetime as dt
from types import SimpleNamespace
from uuid import uuid4

from app.activity.aggregate import build_activity

NOW = dt.datetime(2026, 7, 3, 12, 0, 0, tzinfo=dt.UTC)
TODAY = NOW.date()
YESTERDAY = TODAY - dt.timedelta(days=1)


def _site(name="Tower B"):
    return SimpleNamespace(id=uuid4(), name=name)


def _photo(site_id, *, at, source_chat_message_id=None):
    return SimpleNamespace(id=uuid4(), site_id=site_id, caption="Slab poured",
                           published_at=at,
                           source_chat_message_id=source_chat_message_id)


def _update(site_id, *, at, type="progress", title="Wall done"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, type=type, title=title,
                           body=None, published_at=at)


def _milestone(site_id, *, on, status="done", name="Foundation"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, status=status, name=name,
                           completed_on=on)


def _weekly(site_id, *, week_start):
    return SimpleNamespace(id=uuid4(), site_id=site_id, week_start=week_start,
                           text="Week 3 summary")


def _change(site_id, *, at, description="Add powder room"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, description=description,
                           created_at=at)


def _request(site_id, *, at, status="sent", overdue=False, title="Photo of kitchen",
             detail=None):
    sla = NOW - dt.timedelta(hours=1) if overdue else NOW + dt.timedelta(days=2)
    return SimpleNamespace(id=uuid4(), site_id=site_id, title=title, status=status,
                           sla_due_at=sla, created_at=at, detail=detail)


def _decision(site_id, *, at, kind="approval", state="pending", title="Approve advance",
              detail=None):
    # detail defaults to None (not omitted): Decision.detail is always a
    # present attribute on the real ORM model (nullable in value, not in
    # existence) — _map_decision reads d.detail unconditionally, so a fake
    # standing in for a Decision must have the attribute too.
    return SimpleNamespace(id=uuid4(), site_id=site_id, kind=kind, state=state,
                           title=title, created_at=at, detail=detail)


def _finding(site_id, *, on, status="open", severity="high", headline="Schedule drift"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, status=status,
                           severity=severity, headline=headline, detected_on=on)


def _profile(site_id):
    return SimpleNamespace(id=uuid4(), site_id=site_id)


def _design_approval(*, at, action="send_to_architect", note=None, actor_role="homeowner"):
    return SimpleNamespace(id=uuid4(), brief_id=uuid4(), action=action, note=note,
                           actor_role=actor_role, created_at=at)


def _design_brief(*, at, version=1):
    return SimpleNamespace(id=uuid4(), profile_id=uuid4(), version=version, created_at=at)


def _empty(**over):
    # updates_today/needs_decision_count/sites_total default to 0: build_activity
    # no longer computes these itself (the router's dedicated un-capped COUNT
    # queries do — see test_activity_api.py::test_activity_summary_counts and
    # test_activity_summary_not_undercounted_by_page_limit), it only threads
    # whatever the caller passes straight through into the returned summary.
    # Tests that care about the summary values pass them explicitly via `over`.
    base = dict(photos=[], updates=[], milestones=[], weekly_summaries=[],
                changes=[], requests=[], decisions=[], findings=[],
                updates_today=0, needs_decision_count=0, sites_total=0)
    base.update(over)
    return base


def test_maps_each_source_to_activity_item():
    site = _site()
    photo = _photo(site.id, at=NOW)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[photo]))
    assert len(res["items"]) == 1
    item = res["items"][0]
    assert item["id"] == f"photo_shared:{photo.id}"
    assert item["kind"] == "photo_shared"
    assert item["site_id"] == str(site.id)
    assert item["site_name"] == "Tower B"
    assert item["link"] == {"type": "feed_photo", "id": str(photo.id)}
    assert item["severity"] == "success"
    assert item["occurred_at"] == NOW.isoformat()


def test_photo_item_carries_scroll_message_id():
    # A "Send to feed" photo keeps a source_chat_message_id → the web deep-link
    # opens the site thread AND scrolls to that message.
    site = _site()
    msg_id = uuid4()
    photo = _photo(site.id, at=NOW, source_chat_message_id=msg_id)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[photo]))
    assert res["items"][0]["link"]["scroll_message_id"] == str(msg_id)


def test_photo_without_source_message_omits_scroll_id():
    # A direct upload has no source message → no scroll-target key on the link.
    site = _site()
    photo = _photo(site.id, at=NOW)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[photo]))
    assert "scroll_message_id" not in res["items"][0]["link"]


def test_request_item_subtitle_is_detail():
    # The homeowner-request row carries its detail as the subtitle so a terse
    # title ("Boy") reads with its context (room / urgency / message).
    site = _site()
    req = _request(site.id, at=NOW, detail="Room: Kitchen Urgency: Normal")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(requests=[req]))
    assert res["items"][0]["subtitle"] == "Room: Kitchen Urgency: Normal"


def test_orders_all_sources_by_occurred_at_desc_id_tiebreak():
    site = _site()
    older = _update(site.id, at=NOW - dt.timedelta(hours=2))
    newer = _photo(site.id, at=NOW)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[newer], updates=[older]))
    ids = [i["id"] for i in res["items"]]
    assert ids == [f"photo_shared:{newer.id}", f"update_posted:{older.id}"]


def test_date_sourced_rows_normalize_to_midnight_utc():
    site = _site()
    ms = _milestone(site.id, on=YESTERDAY)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(milestones=[ms]))
    item = res["items"][0]
    assert item["kind"] == "milestone_reached"
    assert item["occurred_at"] == dt.datetime(
        YESTERDAY.year, YESTERDAY.month, YESTERDAY.day, tzinfo=dt.UTC
    ).isoformat()


def test_delay_update_is_warning_progress_is_info():
    site = _site()
    delay = _update(site.id, at=NOW, type="delay", title="Rain delay")
    prog = _update(site.id, at=NOW - dt.timedelta(minutes=1), type="progress")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(updates=[delay, prog]))
    by_id = {i["id"]: i for i in res["items"]}
    assert by_id[f"update_posted:{delay.id}"]["severity"] == "warning"
    assert by_id[f"update_posted:{prog.id}"]["severity"] == "info"


def test_overdue_request_is_warning_and_finding_severity_maps():
    site = _site()
    req = _request(site.id, at=NOW, overdue=True)
    finding = _finding(site.id, on=TODAY, severity="high")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(requests=[req], findings=[finding]))
    by_id = {i["id"]: i for i in res["items"]}
    assert by_id[f"homeowner_request:{req.id}"]["severity"] == "warning"
    assert by_id[f"homeowner_request:{req.id}"]["link"] == {"type": "request", "id": str(req.id)}
    assert by_id[f"site_health_flag:{finding.id}"]["severity"] == "warning"
    # The item's own id/kind stays keyed by the finding row, but link.id must
    # be the SITE id, not the finding id: the web route is /health/:siteId
    # (SiteHealth calls getSiteHealth(siteId)) — a finding id there 403/404s.
    assert by_id[f"site_health_flag:{finding.id}"]["link"] == {
        "type": "finding", "id": str(site.id),
    }
    assert by_id[f"site_health_flag:{finding.id}"]["link"]["id"] != str(finding.id)


def test_scope_change_links_to_project_timeline_via_site_id():
    # R7 (controller decision): a scope_change deep-links like other updates —
    # {"type": "update", "id": <site_id>} — NOT the change row's own id/kind.
    site = _site()
    change = _change(site.id, at=NOW)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(changes=[change]))
    item = res["items"][0]
    assert item["kind"] == "scope_change"
    assert item["link"] == {"type": "update", "id": str(site.id)}
    assert item["severity"] == "warning"


def test_design_approval_maps_to_design_update_item():
    from app.activity.aggregate import _map_design_approval

    site = _site()
    profile = _profile(site.id)
    approval = _design_approval(at=NOW, action="send_to_architect", note="looks good",
                                actor_role="homeowner")
    item = _map_design_approval(approval, profile, site)
    assert item["id"] == f"design_update:{approval.id}"
    assert item["kind"] == "design_update"
    assert item["title"] == "Design brief sent to designer"
    assert item["subtitle"] == "looks good"
    assert item["actor"] == "homeowner"
    assert item["severity"] == "info"
    assert item["occurred_at"] == NOW.isoformat()
    assert item["link"] == {"type": "design_brief", "id": str(site.id)}


def test_design_brief_creation_maps_to_design_update_item():
    site = _site()
    profile = _profile(site.id)
    brief = _design_brief(at=NOW, version=2)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(design_briefs=[(brief, profile)]))
    item = res["items"][0]
    assert item["kind"] == "design_update"
    assert item["title"] == "Design brief v2 ready"
    assert item["subtitle"] is None
    assert item["actor"] is None
    assert item["link"] == {"type": "design_brief", "id": str(site.id)}


def test_design_approval_included_via_build_activity():
    site = _site()
    profile = _profile(site.id)
    approval = _design_approval(at=NOW, action="approve")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(design_approvals=[(approval, profile)]))
    assert len(res["items"]) == 1
    assert res["items"][0]["title"] == "Design brief approved"


def test_summary_passes_through_caller_supplied_counts_unchanged():
    # build_activity no longer DERIVES the summary counts from the (possibly
    # page-capped) row lists it's given — the router computes them separately
    # via dedicated un-capped COUNT queries (see test_activity_api.py) and
    # passes them in. This asserts the pass-through: the returned summary must
    # equal exactly what was supplied, regardless of how many/few rows are in
    # the page's item lists (deliberately mismatched here — 1 photo row, but a
    # caller-supplied updates_today of 47 — to prove there is no re-derivation
    # from `items` happening under the hood).
    site = _site()
    photo = _photo(site.id, at=NOW)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[photo], updates_today=47,
                                  needs_decision_count=3, sites_total=5))
    summary = res["summary"]
    assert summary["updates_today"] == 47
    assert summary["needs_decision_count"] == 3
    assert summary["sites_total"] == 5


def test_keyset_trim_and_next_cursor():
    site = _site()
    items = [_photo(site.id, at=NOW - dt.timedelta(minutes=m)) for m in range(5)]
    res = build_activity(sites=[site], now=NOW, limit=2, cursor=None,
                         **_empty(photos=items))
    assert len(res["items"]) == 2
    last = res["items"][-1]
    assert res["next_cursor"] == (last["occurred_at"], last["id"])
    # Second page: pass the cursor, get the next 2 strictly-older items.
    page2 = build_activity(sites=[site], now=NOW, limit=2, cursor=res["next_cursor"],
                           **_empty(photos=items))
    assert len(page2["items"]) == 2
    assert all(
        (i["occurred_at"], i["id"]) < res["next_cursor"] for i in page2["items"]
    )
    assert res["items"][-1]["id"] not in {i["id"] for i in page2["items"]}


def test_last_page_returns_null_cursor():
    site = _site()
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[_photo(site.id, at=NOW)]))
    assert res["next_cursor"] is None


def test_schemas_accept_aggregator_items():
    from types import SimpleNamespace as NS

    from app.activity.schemas import ActivityPageOut

    site = _site()
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[_photo(site.id, at=NOW)], sites_total=1))
    # next_cursor tuple → encoded string is the router's job; here assert the
    # item/summary shapes validate.
    page = ActivityPageOut(items=res["items"], summary=res["summary"],
                           next_cursor=None)
    assert page.items[0].kind == "photo_shared"
    assert page.items[0].link.type == "feed_photo"
    assert page.summary.sites_total == 1
    _ = NS  # keep import local, no external dep
