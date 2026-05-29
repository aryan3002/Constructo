"""Extraction worker entry point.

Wave 1 wiring for the ``enqueue_extraction`` stub: given a stored
``RawMessageModel`` id, load it, resolve its site from the WhatsApp group
mapping, run :func:`app.extraction.extract.extract`, and persist the resulting
``SiteEventModel`` rows. Returns the new event ids.

If no WhatsApp group maps the message's ``(external_group_id, source)`` to a
site, the message is skipped gracefully (logged, returns ``[]``) — we never
invent site data.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.events import MediaType, RawMessage
from app.db import SessionLocal
from app.extraction.extract import extract
from app.extraction.llm import LLMClient
from app.extraction.ocr import OCRClient
from app.extraction.stt import STTClient
from app.models import RawMessageModel, SiteEventModel, WhatsappGroup

logger = logging.getLogger(__name__)

# A zero-arg callable returning an async-session context manager (e.g. SessionLocal).
SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


def _to_contract(row: RawMessageModel) -> RawMessage:
    """Rebuild the :class:`RawMessage` contract object from a stored row."""
    return RawMessage(
        id=row.id,
        source=row.source,
        external_group_id=row.external_group_id,
        sender_id=row.sender_id,
        sender_name=row.sender_name,
        media_type=MediaType(row.media_type),
        text=row.text,
        media_url=row.media_url,
        media_mime=row.media_mime,
        sent_at=row.sent_at,
        received_at=row.received_at,
        raw=row.raw or {},
    )


async def handle_ingested(
    raw_message_id: UUID,
    session_factory: SessionFactory = SessionLocal,
    *,
    llm: LLMClient | None = None,
    stt: STTClient | None = None,
    ocr: OCRClient | None = None,
) -> list[UUID]:
    """Extract and persist site events for one ingested raw message.

    Args:
        raw_message_id: id of a previously stored ``RawMessageModel`` row.
        session_factory: callable returning an ``AsyncSession`` context manager
            (defaults to :data:`app.db.SessionLocal`). Tests pass a factory bound
            to the transactional test session.
        llm/stt/ocr: optional injected extraction clients (Fakes in tests).

    Returns the ids of the persisted ``SiteEventModel`` rows (``[]`` if the
    message is unknown or its group is not mapped to a site).
    """
    async with session_factory() as session:
        raw_row = await session.get(RawMessageModel, raw_message_id)
        if raw_row is None:
            logger.warning("handle_ingested: raw_message %s not found", raw_message_id)
            return []

        group = (
            await session.execute(
                select(WhatsappGroup).where(
                    WhatsappGroup.external_group_id == raw_row.external_group_id,
                    WhatsappGroup.source == raw_row.source,
                )
            )
        ).scalar_one_or_none()

        if group is None or group.site_id is None:
            logger.info(
                "handle_ingested: no site mapping for group=%s source=%s; skipping",
                raw_row.external_group_id,
                raw_row.source,
            )
            return []

        raw = _to_contract(raw_row)
        events = await extract(raw, group.site_id, llm=llm, stt=stt, ocr=ocr)

        ids: list[UUID] = []
        for ev in events:
            model = SiteEventModel(
                id=ev.id,
                site_id=ev.site_id,
                event_type=ev.event_type.value,
                occurred_on=ev.occurred_on,
                summary=ev.summary,
                fields=ev.fields,
                confidence=ev.confidence,
                needs_clarification=ev.needs_clarification,
                source_message_ids=ev.source_message_ids,
                version=ev.version,
                supersedes_event_id=ev.supersedes_event_id,
            )
            session.add(model)
            ids.append(ev.id)

        await session.commit()
        return ids
