"""Ingestion endpoint: accept a RawMessage, persist it, enqueue extraction."""
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.config import settings
from app.contracts.events import RawMessage
from app.db import get_session
from app.models import RawMessageModel
from app.queue import enqueue_extraction

router = APIRouter(prefix="/api/v1", tags=["ingestion"])


@router.post("/ingest")
async def ingest(
    payload: RawMessage,
    session: AsyncSession = Depends(get_session),
    x_ingest_key: str | None = Header(default=None, alias="X-Ingest-Key"),
) -> dict[str, str]:
    if x_ingest_key != settings.ingest_api_key:
        raise AppError(401, "invalid_ingest_key", "Missing or invalid X-Ingest-Key")

    row = RawMessageModel(
        id=payload.id,
        source=payload.source,
        external_group_id=payload.external_group_id,
        sender_id=payload.sender_id,
        sender_name=payload.sender_name,
        media_type=payload.media_type.value,
        text=payload.text,
        media_url=payload.media_url,
        media_mime=payload.media_mime,
        sent_at=payload.sent_at,
        received_at=payload.received_at,
        raw=payload.raw,
    )
    session.add(row)
    await session.commit()

    await enqueue_extraction(row.id)
    return {"id": str(row.id)}
