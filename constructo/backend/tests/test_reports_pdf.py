"""Smoke test: WeasyPrint can render a minimal PDF.

Task 4 extension: render() in app/reports/pdf.py produces valid PDFs
from the dpr_pack.html and progress.html templates.
"""
from __future__ import annotations


def test_weasyprint_renders_minimal_pdf():
    from weasyprint import HTML

    pdf = HTML(string="<h1>hello</h1>").write_pdf()
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 500


# ---------------------------------------------------------------------------
# Task 4 render tests
# ---------------------------------------------------------------------------

# Literal sample dicts matching the builder output shapes.

_SAMPLE_DPR_PACK = {
    "company": {
        "name": "CivilArch Builders Pvt Ltd",
        "gstin": "07AABCC1234D1Z5",
        "address": "Plot 14, Sector 18, Gurugram, Haryana 122015",
    },
    "site": {"name": "Tower A — Sector 62", "id": "00000000-0000-0000-0000-000000000001"},
    "date": "2026-06-10",
    "status": "draft",
    "sections": {
        "labor": {
            "headcount": 24,
            "entries": [
                {
                    "summary": "18 mazdoor aaye",
                    "headcount": 18,
                    "needs_clarification": False,
                    "event_id": "00000000-0000-0000-0000-000000000010",
                },
                {
                    "summary": "6 mistri aaye",
                    "headcount": 6,
                    "needs_clarification": False,
                    "event_id": "00000000-0000-0000-0000-000000000011",
                },
            ],
        },
        "materials": {
            "deliveries": [
                {
                    "summary": "cement 280 bori",
                    "material": "Cement",
                    "quantity": 280.0,
                    "unit": "bag",
                    "vendor": "Acme Cement",
                    "needs_clarification": False,
                    "event_id": "00000000-0000-0000-0000-000000000020",
                },
                {
                    "summary": "steel bars unverified",
                    "material": "Steel",
                    "quantity": 5.0,
                    "unit": "MT",
                    "vendor": None,
                    "needs_clarification": True,
                    "event_id": "00000000-0000-0000-0000-000000000021",
                },
            ]
        },
        "work_done": {
            "items": [
                {
                    "summary": "3rd floor slab poured",
                    "event_id": "00000000-0000-0000-0000-000000000030",
                }
            ]
        },
        "blockers": {
            "items": [
                {
                    "summary": "water leak in basement",
                    "description": "Pump failure causing seepage",
                    "severity": "high",
                    "event_id": "00000000-0000-0000-0000-000000000040",
                }
            ]
        },
        "next": {
            "items": [
                "Follow up: Pump failure causing seepage",
                "Confirm delivery: steel bars unverified",
            ]
        },
        "summary": "Aaj 24 site par, cement aaya, ek dikkat (water leak).",
    },
}

_SAMPLE_PROGRESS = {
    "company": {
        "name": "CivilArch Builders Pvt Ltd",
        "gstin": "07AABCC1234D1Z5",
        "address": "Plot 14, Sector 18, Gurugram, Haryana 122015",
    },
    "range": {"from": "2026-06-01", "to": "2026-06-10"},
    "sites": [
        {
            "name": "Tower A",
            "status": "warn",
            "stage": {
                "stage_index": 3,
                "stage_total": 8,
                "variance_days": -2,
                "progress_updates": 2,
                "issues": 1,
            },
            "expected_headcount": 20,
            "risks": [
                {
                    "kind": "labor_shortfall",
                    "severity": "medium",
                    "message": "Only 12 on site vs 20 expected",
                },
            ],
            "money": {
                "quotation": "5000000.00",
                "billed": "2000000.00",
                "received": "1000000.00",
                "outstanding": "1000000.00",
                "currency": "INR",
            },
        },
        {
            "name": "Site Beta",
            "status": "ok",
            "stage": {},
            "expected_headcount": None,
            "risks": [],
            "money": {
                "quotation": None,
                "billed": None,
                "received": "0",
                "outstanding": "0",
                "currency": "INR",
            },
        },
    ],
}


def test_render_dpr_pack_produces_pdf():
    """render('dpr_pack.html', data) returns valid PDF bytes."""
    from app.reports.pdf import render

    pdf = render("dpr_pack.html", _SAMPLE_DPR_PACK)
    assert pdf[:5] == b"%PDF-", "Output must start with PDF magic bytes"
    assert len(pdf) > 800, f"Expected at least 800 bytes, got {len(pdf)}"


def test_render_progress_produces_pdf():
    """render('progress.html', data) returns valid PDF bytes."""
    from app.reports.pdf import render

    pdf = render("progress.html", _SAMPLE_PROGRESS)
    assert pdf[:5] == b"%PDF-", "Output must start with PDF magic bytes"
    assert len(pdf) > 800, f"Expected at least 800 bytes, got {len(pdf)}"


def test_render_dpr_pack_no_stage_baseline():
    """DPR pack renders without error when sections are minimal (empty day)."""
    from app.reports.pdf import render

    minimal = {
        "company": {"name": "No-Data Co", "gstin": None, "address": None},
        "site": {"name": "Empty Site", "id": "00000000-0000-0000-0000-000000000099"},
        "date": "2026-06-10",
        "status": "draft",
        "sections": {
            "labor": {"headcount": None, "entries": []},
            "materials": {"deliveries": []},
            "work_done": {"items": []},
            "blockers": {"items": []},
            "next": {"items": []},
            "summary": "No site activity recorded.",
        },
    }
    pdf = render("dpr_pack.html", minimal)
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 800


def test_render_progress_stage_not_set():
    """Progress report renders 'stages not set' when stage facts are empty."""
    from app.reports.pdf import render

    data = {
        "company": {"name": "Stage-less Co", "gstin": None, "address": None},
        "range": {"from": "2026-06-01", "to": "2026-06-10"},
        "sites": [
            {
                "name": "Baseline-free Site",
                "status": "ok",
                "stage": {},  # no stage_index
                "expected_headcount": None,
                "risks": [],
                "money": {
                    "quotation": None,
                    "billed": None,
                    "received": "0",
                    "outstanding": "0",
                    "currency": "INR",
                },
            }
        ],
    }
    pdf = render("progress.html", data)
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 800
