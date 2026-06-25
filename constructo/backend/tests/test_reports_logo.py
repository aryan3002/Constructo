"""Tests for Task 3: company logo on the report letterhead.

Strategy: render base.html standalone via _env (no WeasyPrint, no DB).
base.html renders fine standalone — its {% block %} slots are empty but the
letterhead section is fully evaluated from the 'company' context variable.
"""
from __future__ import annotations

_LOGO_IMG_MARKER = 'class="letterhead__logo"'


def test_letterhead_renders_logo_when_present():
    """Logo img tag and URL appear when company.logo_url is set."""
    from app.reports.pdf import _env

    html = _env.get_template("base.html").render(
        company={
            "name": "CivilArch",
            "gstin": None,
            "address": None,
            "logo_url": "https://r2.example/branding/x/logo.png",
        },
    )
    assert _LOGO_IMG_MARKER in html
    assert "https://r2.example/branding/x/logo.png" in html


def test_letterhead_omits_logo_when_absent():
    """No logo img tag when company.logo_url is None."""
    from app.reports.pdf import _env

    html = _env.get_template("base.html").render(
        company={
            "name": "CivilArch",
            "gstin": None,
            "address": None,
            "logo_url": None,
        },
    )
    assert _LOGO_IMG_MARKER not in html


def test_letterhead_omits_logo_when_key_missing():
    """No logo img tag when company dict has no logo_url key at all (legacy dict)."""
    from app.reports.pdf import _env

    html = _env.get_template("base.html").render(
        company={
            "name": "Legacy Co",
            "gstin": None,
            "address": None,
        },
    )
    assert _LOGO_IMG_MARKER not in html
