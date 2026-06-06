"""Entity resolver (2.5 prerequisite) — GSTIN/phone exact, fuzzy name → merge."""
from app.reconcile.entities import Candidate, name_similarity, resolve_vendor

CANDS = [
    Candidate(id="v1", name="Ramesh Steel", phone="+91 98000 11111", gstin="29ABCDE1234F1Z5"),
    Candidate(id="v2", name="Sharma Trading Co", phone="9800022222"),
    Candidate(id="v3", name="ACC Cement Depot"),
]


def test_gstin_exact_links():
    m = resolve_vendor("totally different name", CANDS, gstin="29abcde1234f1z5")
    assert m.decision == "link"
    assert m.vendor_id == "v1"
    assert m.reason == "gstin"


def test_phone_exact_links_on_last10():
    m = resolve_vendor("whatever", CANDS, phone="098000-22222")
    assert m.decision == "link"
    assert m.vendor_id == "v2"
    assert m.reason == "phone"


def test_exact_name_links():
    m = resolve_vendor("Ramesh Steel", CANDS)
    assert m.decision == "link"
    assert m.vendor_id == "v1"


def test_supplier_suffixes_normalize_to_a_strong_link():
    # "Sharma Traders" and "Sharma Trading Co" both normalise to "sharma" — the
    # registry canonicalisation makes them the SAME vendor (a strong link).
    m = resolve_vendor("Sharma Traders", CANDS)
    assert m.decision == "link"
    assert m.vendor_id == "v2"


def test_fuzzy_partial_name_proposes_confirm():
    # "Ramesh Kumar Steel" shares 2/3 distinctive tokens with "Ramesh Steel" →
    # below the strong floor, so it proposes a one-tap merge, not a silent link.
    m = resolve_vendor("Ramesh Kumar Steel", CANDS)
    assert m.decision == "confirm"
    assert m.vendor_id == "v1"
    assert any(c["id"] == "v1" for c in m.candidates)


def test_no_match_creates():
    m = resolve_vendor("Tata Power", CANDS)
    assert m.decision == "create"
    assert m.vendor_id is None


def test_name_similarity_prefix_aware():
    assert name_similarity("Sharma Traders", "Sharma Trading Co") >= 0.45
    assert name_similarity("ACC", "Ultratech") == 0.0


# --- endpoint --------------------------------------------------------------
import pytest_asyncio  # noqa: E402

from app.auth.jwt import create_access_token  # noqa: E402
from app.models import UserRole, Vendor  # noqa: E402


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    db_session.add(Vendor(company_id=company.id, name="Ramesh Steel", gstin="29ABCDE1234F1Z5"))
    await db_session.flush()
    return company, owner


async def test_resolve_endpoint_links_by_gstin(client, world):
    _, owner = world
    resp = await client.post(
        "/api/v1/vendors/resolve",
        json={"name": "anything", "gstin": "29abcde1234f1z5"},
        headers=_auth(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["decision"] == "link"
    assert resp.json()["vendor_id"] is not None


async def test_resolve_endpoint_creates_on_no_match(client, world):
    _, owner = world
    resp = await client.post(
        "/api/v1/vendors/resolve", json={"name": "Tata Power"}, headers=_auth(owner)
    )
    assert resp.json()["decision"] == "create"
    assert resp.json()["vendor_id"] is None
