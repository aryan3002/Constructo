"""Trust Membrane single-message draft (2.4) — calm face, price/headcount
stripped, digits preserved (numeric_guard holds by construction)."""
from app.homeowner.numeric_guard import numeric_guard
from app.publish.membrane import draft_homeowner_update


def test_delivery_crosses_calm_and_price_stripped():
    draft = draft_homeowner_update(
        "material_delivery",
        {"material": "cement", "quantity": 50, "unit": "bori", "vendor": "ACC", "rate": 380},
    )
    assert draft == "50 bori of cement arrived on site."
    # Vendor and rate (crew-side) never appear on the homeowner face.
    assert "ACC" not in draft
    assert "380" not in draft


def test_delivery_digits_preserved_numeric_guard_holds():
    fields = {"material": "cement", "quantity": 50, "unit": "bori"}
    draft = draft_homeowner_update("material_delivery", fields)
    # The quantity is carried verbatim — numeric_guard between source and draft holds.
    assert numeric_guard("50", draft)


def test_attendance_never_crosses():
    assert draft_homeowner_update("attendance", {"headcount": 24}) is None


def test_money_never_crosses():
    assert draft_homeowner_update("invoice_received", {"amount": 85000, "vendor": "X"}) is None
    assert draft_homeowner_update("payment_request", {"amount": 45000, "to": "Ramesh"}) is None


def test_progress_uses_description_then_room():
    assert draft_homeowner_update(
        "progress_update", {"description": "Living room walls got their second coat"}
    ) == "Living room walls got their second coat."
    assert (
        draft_homeowner_update("progress_update", {"room": "kitchen"})
        == "Work progressed in the kitchen."
    )


def test_unknown_returns_none():
    assert draft_homeowner_update("unknown", {}) is None


# --- endpoint (2.4 suggest-from-event) -------------------------------------
import pytest_asyncio  # noqa: E402

from app.auth.jwt import create_access_token  # noqa: E402
from app.models import SiteEventModel, UserRole  # noqa: E402


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory, db_session):
    from datetime import date

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    event = SiteEventModel(
        site_id=site.id, event_type="material_delivery", occurred_on=date.today(),
        summary="delivery",
        fields={"material": "cement", "quantity": 50, "unit": "bori", "vendor": "ACC"},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )
    db_session.add(event)
    await db_session.flush()
    return company, owner, site, event


async def test_suggest_endpoint_returns_calm_draft(client, world):
    _, owner, _, event = world
    resp = await client.post(
        "/api/v1/membrane/suggest", json={"event_id": str(event.id)}, headers=_auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["crosses"] is True
    assert "ACC" not in body["draft"]  # vendor stripped
    assert "50" in body["draft"]  # quantity preserved


async def test_suggest_endpoint_scoped(client, factory, world):
    company, _, _, event = world
    other = await factory.user(company=company, role=UserRole.supervisor)  # unassigned
    resp = await client.post(
        "/api/v1/membrane/suggest", json={"event_id": str(event.id)}, headers=_auth(other)
    )
    assert resp.status_code == 403
