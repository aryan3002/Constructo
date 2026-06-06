"""Trust Membrane — single-message draft (2.4).

One committed ``SiteEvent`` renders two faces. This is the homeowner face: a
calm, plain-language draft with **crew rates, vendor names, and headcounts
stripped**, digits preserved verbatim (so ``numeric_guard`` passes by
construction). It is only ever a *draft* — the contractor reviews, edits, and
commits it through the existing publish gate; raw AI never auto-reaches the
homeowner. Events that carry nothing a homeowner should see (money, attendance)
return ``None`` — silence is calmer than noise.
"""
from __future__ import annotations

from datetime import date


def _num(v) -> str | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    return None


def draft_homeowner_update(
    event_type: str, fields: dict, occurred_on: date | None = None
) -> str | None:
    """A calm, digit-safe, price-stripped homeowner draft for one event, or
    ``None`` when the event shouldn't cross the membrane.

    Crossing (calm face): material arrival (qty/unit/material — NO vendor/rate),
    progress, drawing shared. Not crossing: attendance (headcounts are crew-
    internal), invoices/payments (money is masked), unknown/chatter.
    """
    fields = fields or {}
    if event_type == "material_delivery":
        qty = _num(fields.get("quantity"))
        unit = (fields.get("unit") or "").strip()
        material = (fields.get("material") or "material").strip()
        if qty and unit:
            return f"{qty} {unit} of {material} arrived on site."
        if qty:
            return f"{qty} {material} arrived on site."
        return f"{material.capitalize()} arrived on site."

    if event_type == "progress_update":
        room = (fields.get("room") or fields.get("area") or "").strip()
        desc = (fields.get("description") or fields.get("caption") or "").strip()
        if desc:
            return desc if desc.endswith(".") else f"{desc}."
        if room:
            return f"Work progressed in the {room}."
        return "Work progressed on site today."

    if event_type == "drawing_shared":
        sheet = (fields.get("sheet_name") or fields.get("title") or "").strip()
        return f"A new drawing was shared{f': {sheet}' if sheet else ''}."

    # Attendance (headcounts), invoices/payments (money), unknown → never crosses.
    return None
