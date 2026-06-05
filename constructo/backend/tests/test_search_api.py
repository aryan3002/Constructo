"""Search endpoint tests: filters, scoping, evidence, and 'not sure' (FakeEmbeddings).

Network-free. These assert *plumbing* (filter push-down, site scoping, evidence
presence, the answerable=false path) — NOT ANN recall quality, which a fake
embedder can't represent.
"""
from datetime import date

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.main import app
from app.models import SiteEventModel, UserRole
from app.search.embeddings import FakeEmbeddings
from app.search.index import index_event
from app.search.router import _get_client
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(autouse=True)
def _fake_embeddings():
    """Force the endpoint to use deterministic FakeEmbeddings (no network)."""
    app.dependency_overrides[_get_client] = lambda: FakeEmbeddings()
    yield
    app.dependency_overrides.pop(_get_client, None)


async def _add_event(db_session, site_id, **kw):
    defaults = dict(
        event_type="material_delivery",
        occurred_on=date(2026, 5, 28),
        summary="50 bags cement delivered by ACC",
        fields={"material": "cement", "quantity": 50},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    defaults.update(kw)
    ev = SiteEventModel(site_id=site_id, **defaults)
    db_session.add(ev)
    await db_session.flush()
    await index_event(db_session, ev.id, client=FakeEmbeddings())
    return ev


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def test_search_returns_hits_with_evidence(client, factory, db_session, owner):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    site = await factory.site(company=company, name="Site A")
    from uuid import uuid4

    msg_id = uuid4()
    await _add_event(db_session, site.id, source_message_ids=[msg_id])

    resp = await client.post(
        "/api/v1/search", json={"q": "cement deliveries"}, headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answerable"] is True
    assert len(body["hits"]) >= 1
    hit = body["hits"][0]
    assert hit["site_name"] == "Site A"
    # Every result carries its evidence (P1).
    assert str(msg_id) in hit["evidence"]["source_message_ids"]
    assert 0.0 <= hit["score"] <= 1.0
    # The parse is echoed back so the user sees how we understood the query.
    assert body["query"]["event_type"] == "material_delivery"


async def test_event_type_filter_excludes_other_types(client, factory, db_session, owner):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    site = await factory.site(company=company, name="Site A")
    await _add_event(db_session, site.id, event_type="material_delivery", summary="cement in")
    await _add_event(
        db_session,
        site.id,
        event_type="attendance",
        summary="24 workers present",
        fields={"headcount": 24},
    )

    # "deliveries" parses to material_delivery -> attendance row must be filtered
    # out by the structured pre-filter. "cement" gives the fake embedder a token
    # to match the delivery row's document.
    resp = await client.post(
        "/api/v1/search", json={"q": "cement deliveries"}, headers=auth(owner)
    )
    body = resp.json()
    assert all(h["event_type"] == "material_delivery" for h in body["hits"])
    assert len(body["hits"]) == 1


async def test_date_filter_pushes_down(client, factory, db_session, owner):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    site = await factory.site(company=company, name="Site A")
    await _add_event(db_session, site.id, occurred_on=date(2026, 5, 28), summary="cement old")
    await _add_event(db_session, site.id, occurred_on=date(2026, 1, 1), summary="cement ancient")

    resp = await client.post(
        "/api/v1/search",
        json={"q": "cement", "date_from": "2026-05-01"},
        headers=auth(owner),
    )
    body = resp.json()
    dates = {h["occurred_on"] for h in body["hits"]}
    assert dates == {"2026-05-28"}


async def test_scoping_supervisor_only_sees_assigned_site(
    client, factory, db_session, owner
):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    assigned = await factory.site(company=company, name="Assigned Site")
    other = await factory.site(company=company, name="Other Site")
    await _add_event(db_session, assigned.id, summary="cement at assigned")
    await _add_event(db_session, other.id, summary="cement at other")

    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=assigned.id, user_id=sup.id))
    await db_session.flush()

    resp = await client.post(
        "/api/v1/search", json={"q": "cement"}, headers=auth(sup)
    )
    body = resp.json()
    site_ids = {h["site_id"] for h in body["hits"]}
    assert site_ids == {str(assigned.id)}


async def test_supervisor_with_no_sites_is_not_answerable(client, factory, db_session, owner):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    site = await factory.site(company=company, name="Site A")
    await _add_event(db_session, site.id, summary="cement")

    lonely = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.post(
        "/api/v1/search", json={"q": "cement"}, headers=auth(lonely)
    )
    body = resp.json()
    # No visible sites -> say "not sure", don't leak other sites' data.
    assert body["answerable"] is False
    assert body["hits"] == []


async def test_empty_index_is_not_answerable(client, factory, db_session, owner):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    await factory.site(company=company, name="Site A")  # site exists, no events
    resp = await client.post(
        "/api/v1/search", json={"q": "anything"}, headers=auth(owner)
    )
    body = resp.json()
    assert body["answerable"] is False
    assert body["hits"] == []


async def test_requires_auth(client):
    resp = await client.post("/api/v1/search", json={"q": "cement"})
    assert resp.status_code == 401


async def test_explicit_site_filter_narrows(client, factory, db_session, owner):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    a = await factory.site(company=company, name="Site A")
    b = await factory.site(company=company, name="Site B")
    await _add_event(db_session, a.id, summary="cement at A")
    await _add_event(db_session, b.id, summary="cement at B")

    resp = await client.post(
        "/api/v1/search",
        json={"q": "cement", "site_id": str(a.id)},
        headers=auth(owner),
    )
    body = resp.json()
    assert {h["site_id"] for h in body["hits"]} == {str(a.id)}


class _ConstantEmbeddings:
    """Returns one fixed unit vector for every text — lets a test pin the cosine
    score exactly. Index with a vector at one bucket, query with another bucket:
    the two are orthogonal, so cosine distance = 1.0 and similarity = 0.0 (below
    the 0.15 floor). That isolates the floor logic from FakeEmbeddings' hashing.
    """

    def __init__(self, bucket: int) -> None:
        from app.search.embeddings import EMBEDDING_DIM

        self.dim = EMBEDDING_DIM
        self.model = "constant-test"
        self._vec = [0.0] * EMBEDDING_DIM
        self._vec[bucket] = 1.0

    async def embed(self, texts):
        return [list(self._vec) for _ in texts]


async def test_structured_filter_returns_rows_even_below_similarity_floor(
    client, factory, db_session, owner
):
    """P2-8: a query that resolved to a structured filter (event_type) must
    return its rows even when the semantic score is below the floor — the filter
    IS the relevance signal. Regression for 'Cement' wrongly abstaining despite
    hundreds of matching delivery events."""
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    site = await factory.site(company=company, name="Site A")
    # Index the event at bucket 0; query embeds at bucket 1 -> orthogonal -> 0.0.
    ev = SiteEventModel(
        site_id=site.id, event_type="material_delivery",
        occurred_on=date(2026, 5, 28), summary="280 bags cement from ACC",
        fields={"material": "cement", "quantity": 280}, confidence=0.9,
        needs_clarification=False, source_message_ids=[], version=1,
    )
    db_session.add(ev)
    await db_session.flush()
    await index_event(db_session, ev.id, client=_ConstantEmbeddings(0))

    app.dependency_overrides[_get_client] = lambda: _ConstantEmbeddings(1)
    try:
        # "cement deliveries" -> event_type=material_delivery (structured filter).
        resp = await client.post(
            "/api/v1/search", json={"q": "cement deliveries"}, headers=auth(owner)
        )
    finally:
        app.dependency_overrides[_get_client] = lambda: FakeEmbeddings()
    body = resp.json()
    assert body["query"]["event_type"] == "material_delivery"
    assert body["answerable"] is True
    assert len(body["hits"]) == 1
    assert body["hits"][0]["score"] < 0.15  # genuinely below the floor


async def test_pure_semantic_query_still_abstains_below_floor(
    client, factory, db_session, owner
):
    """P2-8 guard: with NO structured filter, the similarity floor still gates —
    a weak/irrelevant semantic match must abstain (answerable=false), so honest
    AI is preserved for true gibberish queries."""
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    site = await factory.site(company=company, name="Site A")
    ev = SiteEventModel(
        site_id=site.id, event_type="progress_update",
        occurred_on=date(2026, 5, 28), summary="slab work continuing",
        fields={}, confidence=0.9, needs_clarification=False,
        source_message_ids=[], version=1,
    )
    db_session.add(ev)
    await db_session.flush()
    await index_event(db_session, ev.id, client=_ConstantEmbeddings(0))

    app.dependency_overrides[_get_client] = lambda: _ConstantEmbeddings(1)
    try:
        # "zzz" parses to no event_type/date -> pure semantic -> floor applies.
        resp = await client.post(
            "/api/v1/search", json={"q": "zzz"}, headers=auth(owner)
        )
    finally:
        app.dependency_overrides[_get_client] = lambda: FakeEmbeddings()
    body = resp.json()
    assert body["query"]["event_type"] is None
    assert body["answerable"] is False
    assert body["hits"] == []
