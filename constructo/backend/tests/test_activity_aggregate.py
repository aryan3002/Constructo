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


def _photo(site_id, *, at):
    return SimpleNamespace(id=uuid4(), site_id=site_id, caption="Slab poured",
                           published_at=at)


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


def _request(site_id, *, at, status="sent", overdue=False, title="Photo of kitchen"):
    sla = NOW - dt.timedelta(hours=1) if overdue else NOW + dt.timedelta(days=2)
    return SimpleNamespace(id=uuid4(), site_id=site_id, title=title, status=status,
                           sla_due_at=sla, created_at=at)


def _decision(site_id, *, at, kind="approval", state="pending", title="Approve advance"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, kind=kind, state=state,
                           title=title, created_at=at)


def _finding(site_id, *, on, status="open", severity="high", headline="Schedule drift"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, status=status,
                           severity=severity, headline=headline, detected_on=on)


def _empty(**over):
    base = dict(photos=[], updates=[], milestones=[], weekly_summaries=[],
                changes=[], requests=[], decisions=[], findings=[])
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
    assert by_id[f"site_health_flag:{finding.id}"]["link"] == {
        "type": "finding", "id": str(finding.id),
    }


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


def test_summary_counts():
    site = _site()
    today_photo = _photo(site.id, at=NOW)
    old_photo = _photo(site.id, at=NOW - dt.timedelta(days=3))
    open_req = _request(site.id, at=NOW, status="sent")
    done_req = _request(site.id, at=NOW, status="done")
    pending_dec = _decision(site.id, at=NOW, state="pending")
    resolved_dec = _decision(site.id, at=NOW, state="resolved")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[today_photo, old_photo],
                                  requests=[open_req, done_req],
                                  decisions=[pending_dec, resolved_dec]))
    summary = res["summary"]
    # both decisions are kind=approval so both surface as items; only pending
    # counts as needs_decision
    assert summary["updates_today"] == sum(
        1 for i in res["items"]
        if dt.datetime.fromisoformat(i["occurred_at"]).date() == TODAY
    )
    assert summary["needs_decision_count"] == 2  # open_req + pending_dec
    assert summary["sites_total"] == 1


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
                         **_empty(photos=[_photo(site.id, at=NOW)]))
    # next_cursor tuple → encoded string is the router's job; here assert the
    # item/summary shapes validate.
    page = ActivityPageOut(items=res["items"], summary=res["summary"],
                           next_cursor=None)
    assert page.items[0].kind == "photo_shared"
    assert page.items[0].link.type == "feed_photo"
    assert page.summary.sites_total == 1
    _ = NS  # keep import local, no external dep
