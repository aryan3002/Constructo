"""WeasyPrint PDF renderer for Constructo reports — Task 4 of W5 Slice 1.

Provides a single public function: render(template_name, data) -> bytes.

The Jinja2 environment is module-level (built once, shared across calls).
WeasyPrint is imported lazily inside render() so it does not import at
module-load time (avoids dylib startup cost for non-PDF code paths).
"""
from __future__ import annotations

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES = Path(__file__).parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES)),
    autoescape=select_autoescape(["html"]),
)


# ---------------------------------------------------------------------------
# custom filters
# ---------------------------------------------------------------------------


def _inr(value: object) -> str:
    """Format a number in Indian numbering (lakh/crore commas).

    Returns "—" for None or non-numeric input so the template never crashes.
    Uses the Indian comma system: last 3 digits, then pairs of 2.

    Examples:
        1234567  -> "12,34,567"
        100000   -> "1,00,000"
        None     -> "—"
    """
    try:
        n = int(round(float(value)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "—"

    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return ("-" if n < 0 else "") + s


_env.filters["inr"] = _inr


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------


def render(template_name: str, data: dict) -> bytes:
    """Render a Jinja2 template to PDF bytes via WeasyPrint.

    Args:
        template_name: filename relative to app/reports/templates/ (e.g. "dpr_pack.html").
        data: context dict — typically the output of a builder function.

    Returns:
        Raw PDF bytes, always starting with b"%PDF-".
    """
    from weasyprint import HTML  # lazy import — avoids dylib cost at import time

    html = _env.get_template(template_name).render(**data)
    return HTML(string=html, base_url=str(_TEMPLATES)).write_pdf()
