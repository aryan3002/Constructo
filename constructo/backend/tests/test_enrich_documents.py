"""Document-enrichment pass (scripts.enrich_documents).

Seeds the imported company/site + a Conversation + 2 PDF ChatMessages pointing at
real on-disk PDFs (built with fitz), injects a network-free FakeLLM whose canned
vision result classifies the page as a floor plan with rooms, and asserts:
  * a PublishedDrawing is upserted per PDF,
  * a floor + room Space skeleton is created from the rooms,
  * rooms are deduped across the two PDFs (same canned rooms ⇒ created once),
  * a second run() creates no duplicates.
"""
from contextlib import asynccontextmanager
from uuid import uuid4

import fitz
import pytest
from sqlalchemy import func, select

import scripts.enrich_documents as ed
from app.extraction.llm import FakeLLMClient
from app.models import (
    ChatMessage,
    Company,
    Conversation,
    ConversationKind,
    DrawingKind,
    MessageSide,
    PublishedDrawing,
    Site,
    Space,
    SpaceKind,
)

# Canned vision result every read_pdf call returns: a floor plan with 3 rooms.
_CANNED = {
    "kind": "floor_plan",
    "rooms": ["Master Bedroom", "Kitchen", "Pooja Room"],
    "summary": "Ground floor architectural plan.",
}


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


def _make_pdf(tmp_path, name: str) -> str:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Floor plan — Master Bedroom / Kitchen / Pooja Room")
    path = str(tmp_path / name)
    doc.save(path)
    doc.close()
    return path


@pytest.fixture(autouse=True)
def _fake_vision(monkeypatch):
    """Force run() onto a canned, network-free FakeLLM (no Azure)."""
    monkeypatch.setattr(ed, "get_llm_client", lambda tier="vision": FakeLLMClient(canned=_CANNED))


async def _seed(db_session, tmp_path):
    """Imported company + site + a site Conversation + 2 PDF chat messages."""
    company = Company(id=ed._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ed._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()
    conv = Conversation(
        id=uuid4(), company_id=company.id, site_id=site.id, kind=ConversationKind.site
    )
    db_session.add(conv)
    await db_session.flush()

    for i in range(2):
        key = _make_pdf(tmp_path, f"plan_{i}.pdf")
        db_session.add(
            ChatMessage(
                id=uuid4(),
                conversation_id=conv.id,
                sender_id=None,
                sender_side=MessageSide.contractor,
                client_msg_id=uuid4(),
                seq=i + 1,
                media_type="document",
                attachment_key=key,
                attachment_mime="application/pdf",
            )
        )
    await db_session.flush()
    return site


async def test_enrich_documents_creates_drawings_and_spaces(db_session, tmp_path):
    site = await _seed(db_session, tmp_path)
    sf = _session_factory(db_session)

    counts = await ed.run(session_factory=sf)

    assert counts["pdfs_read"] == 2
    assert counts["drawings"] == 2

    # One drawing per PDF, classified as a plan.
    drawings = (
        await db_session.execute(
            select(PublishedDrawing).where(PublishedDrawing.site_id == site.id)
        )
    ).scalars().all()
    assert len(drawings) == 2
    assert all(d.kind == DrawingKind.plan for d in drawings)
    assert all(d.file_url for d in drawings)

    # Spaces: 1 floor + 3 rooms = 4 (rooms NOT duplicated across the 2 PDFs).
    spaces = (
        await db_session.execute(select(Space).where(Space.site_id == site.id))
    ).scalars().all()
    assert len(spaces) == 4
    assert sum(1 for s in spaces if s.kind == SpaceKind.floor) == 1
    room_names = {s.name for s in spaces if s.kind == SpaceKind.room}
    assert room_names == {"Master Bedroom", "Kitchen", "Pooja Room"}
    assert counts["spaces"] == 4


async def test_enrich_documents_is_idempotent(db_session, tmp_path):
    site = await _seed(db_session, tmp_path)
    sf = _session_factory(db_session)

    await ed.run(session_factory=sf)
    second = await ed.run(session_factory=sf)  # re-run

    # The second run upserts the same rows — no new ones.
    assert second["drawings"] == 2  # still reads + upserts both PDFs
    n_draw = (
        await db_session.execute(
            select(func.count()).select_from(PublishedDrawing).where(
                PublishedDrawing.site_id == site.id
            )
        )
    ).scalar()
    assert n_draw == 2  # not 4
    n_space = (
        await db_session.execute(
            select(func.count()).select_from(Space).where(Space.site_id == site.id)
        )
    ).scalar()
    assert n_space == 4  # not 8


async def test_enrich_documents_dedupes_against_existing_rooms(db_session, tmp_path):
    """A room already present for the site (case-insensitively) is not re-created."""
    site = await _seed(db_session, tmp_path)
    # Pre-existing room with different casing/spacing than the canned "Kitchen".
    db_session.add(
        Space(id=uuid4(), site_id=site.id, parent_id=None, name="  kitchen ",
              kind=SpaceKind.room, order=0)
    )
    await db_session.flush()

    await ed.run(session_factory=_session_factory(db_session))

    rooms = (
        await db_session.execute(
            select(Space).where(Space.site_id == site.id, Space.kind == SpaceKind.room)
        )
    ).scalars().all()
    # "kitchen" already existed → only Master Bedroom + Pooja Room added (+ the
    # pre-existing kitchen) = 3 rooms, no duplicate kitchen.
    assert len(rooms) == 3
    kitchens = [r for r in rooms if r.name.strip().lower() == "kitchen"]
    assert len(kitchens) == 1
