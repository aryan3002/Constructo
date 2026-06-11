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

from app.config import settings
from app.contracts.events import MediaType, RawMessage
from app.db import SessionLocal
from app.extraction.extract import extract
from app.extraction.llm import LLMClient
from app.extraction.ocr import OCRClient
from app.extraction.stt import STTClient
from app.models import RawMessageModel, Site, SiteEventModel, WhatsappGroup

logger = logging.getLogger(__name__)

# A zero-arg callable returning an async-session context manager (e.g. SessionLocal).
SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]

# App captures (source="app") and in-app chat messages (source="app_chat") carry
# their site directly in external_group_id as "app:{site_id}" — there is no
# WhatsApp group to map them through.
APP_SOURCE = "app"
APP_CHAT_SOURCE = "app_chat"
APP_GROUP_PREFIX = "app:"


async def _resolve_site_id(session: AsyncSession, raw_row: RawMessageModel) -> UUID | None:
    """Resolve the site a raw message belongs to.

    Two paths:
      * App captures (``source="app"``) carry ``external_group_id="app:{site_id}"``
        — parse + validate the site directly (no group mapping exists).
      * WhatsApp messages resolve via the ``whatsapp_groups`` (external_group_id,
        source) mapping, as before.
    Returns ``None`` (caller skips, never invents site data) when unresolved.
    """
    if raw_row.source in (APP_SOURCE, APP_CHAT_SOURCE):
        if not raw_row.external_group_id.startswith(APP_GROUP_PREFIX):
            return None
        try:
            site_id = UUID(raw_row.external_group_id[len(APP_GROUP_PREFIX) :])
        except ValueError:
            return None
        return site_id if await session.get(Site, site_id) is not None else None

    group = (
        await session.execute(
            select(WhatsappGroup).where(
                WhatsappGroup.external_group_id == raw_row.external_group_id,
                WhatsappGroup.source == raw_row.source,
            )
        )
    ).scalar_one_or_none()
    if group is None or group.site_id is None:
        return None
    return group.site_id


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

        site_id = await _resolve_site_id(session, raw_row)
        if site_id is None:
            logger.info(
                "handle_ingested: no site mapping for group=%s source=%s; skipping",
                raw_row.external_group_id,
                raw_row.source,
            )
            raw_row.status = "skipped"
            await session.commit()
            return []

        # Mark processing and increment attempt counter before calling the LLM/OCR.
        raw_row.status = "processing"
        raw_row.attempts = (raw_row.attempts or 0) + 1
        await session.commit()

        try:
            raw = _to_contract(raw_row)
            events = await extract(raw, site_id, llm=llm, stt=stt, ocr=ocr)
        except Exception as exc:
            raw_row.status = "failed"
            raw_row.last_error = str(exc)[:2000]
            await session.commit()
            raise  # RQ Retry owns the requeue/backoff

        # A non-crew (homeowner) capture books to the ledger but always lands
        # needs_clarification (amber) — crew confirm/correct it via the existing
        # dispute/dedupe rails before it's treated as settled truth (Slice D).
        from_homeowner = (raw_row.raw or {}).get("sender_side") == "homeowner"

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
                needs_clarification=ev.needs_clarification or from_homeowner,
                source_message_ids=ev.source_message_ids,
                version=ev.version,
                supersedes_event_id=ev.supersedes_event_id,
                # Stamp the event with the REAL message time, not the row-insert
                # time. For live WhatsApp/app messages sent_at ≈ now (no change);
                # for a back-dated import (replaying months of history in one run)
                # this is what stops every imported event collapsing onto the
                # import wall-clock. Falls back to the DB default when unknown.
                **({"created_at": raw.sent_at} if raw.sent_at is not None else {}),
            )
            session.add(model)
            ids.append(ev.id)

        raw_row.status = "done"
        raw_row.last_error = None
        await session.commit()

        # Make the new events searchable. Indexing failures must NEVER fail
        # ingestion (the events are already committed), so each event is indexed
        # best-effort and errors are logged and swallowed. The embeddings client
        # falls back to FakeEmbeddings when no provider creds are present, so
        # this stays network-free in dev/tests.
        await _index_events(session, ids)

        # Also index the chat message TEXT itself (2.3 message RAG) — the chatter
        # graveyard becomes searchable. Best-effort; never fails ingestion.
        if raw_row.source == APP_CHAT_SOURCE:
            await _index_chat_message(session, (raw_row.raw or {}).get("chat_message_id"))

        # Live event_update frame so clients upgrade the bubble to a Card in real
        # time without waiting for a poll (Task 8 spine A8).
        if raw_row.source == APP_CHAT_SOURCE and ids:
            await _publish_event_update(session, raw_row, ids)

        # Hand the inbound message to the bot (Nivaan) for a Guest-Rule
        # reaction/reply. Best-effort: a bot failure must NEVER fail ingestion.
        await _bot_handle(session, raw_message_id, llm=llm)

        return ids


async def _bot_handle(
    session: AsyncSession, raw_message_id: UUID, *, llm: LLMClient | None = None
) -> None:
    """Best-effort: let the bot react/reply to the inbound message. Never raises.

    Gated by ``settings.bot_enabled``. The bot's sender is dry-run by default, so
    this is network-free in dev/tests; intent uses the same (Fake) LLM as
    extraction when one is injected.
    """
    if not settings.bot_enabled:
        return
    try:
        from app.bot.handle import handle_inbound

        await handle_inbound(session, raw_message_id, llm=llm)
    except Exception:
        logger.exception("handle_ingested: bot handling failed for %s", raw_message_id)


async def _index_chat_message(session: AsyncSession, chat_message_id: str | None) -> None:
    """Best-effort: embed the chat message's text for RAG (2.3). Never raises."""
    if not chat_message_id:
        return
    try:
        from app.search.index_message import index_message

        await index_message(session, UUID(str(chat_message_id)))
        await session.commit()
    except Exception:
        logger.exception("handle_ingested: failed to index chat message %s", chat_message_id)


async def _index_events(session: AsyncSession, event_ids: list[UUID]) -> None:
    """Best-effort: embed and index each new SiteEvent. Never raises."""
    if not event_ids:
        return
    from app.search.index import index_event

    indexed = 0
    for event_id in event_ids:
        try:
            await index_event(session, event_id)
            indexed += 1
        except Exception:
            logger.exception("handle_ingested: failed to index event %s", event_id)
    if indexed:
        try:
            await session.commit()
        except Exception:
            logger.exception("handle_ingested: failed to commit indexed events")


async def _publish_event_update(
    session: AsyncSession, raw_row: RawMessageModel, event_ids: list[UUID]
) -> None:
    """Best-effort event_update frame through the (Redis) broadcaster."""
    try:
        from app.chat import realtime
        from app.models import ChatMessage  # SiteEventModel already imported at top

        chat_message_id = (raw_row.raw or {}).get("chat_message_id")
        if not chat_message_id:
            return
        msg = await session.get(ChatMessage, UUID(str(chat_message_id)))
        if msg is None:
            return
        events = (
            await session.execute(
                select(SiteEventModel).where(SiteEventModel.id.in_(event_ids))
            )
        ).scalars().all()
        await realtime.get_broadcaster().publish(
            msg.conversation_id,
            {
                "v": 1,
                "type": "event_update",
                "conv": str(msg.conversation_id),
                "message_id": str(msg.id),
                "raw_status": raw_row.status,
                "events": [
                    {
                        "id": str(e.id),
                        "event_type": e.event_type,
                        "summary": e.summary,
                        "fields": e.fields,
                        "confidence": e.confidence,
                        "needs_clarification": e.needs_clarification,
                    }
                    for e in events
                ],
            },
        )
    except Exception:  # pragma: no cover - live upgrade is best-effort
        logger.exception("event_update publish failed for raw %s", raw_row.id)
