"""Hybrid search endpoint over the site ledger.

POST /api/v1/search — semantic (pgvector cosine) + structured filters
(site / date / event_type), scoped to the caller's visible sites and role.
Every hit carries its evidence (source message ids + confidence). When nothing
clears the relevance floor we return ``answerable=false`` instead of presenting
weak guesses as fact (P5: honest AI).
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.models import (
    ChatMessage,
    Conversation,
    EventEmbedding,
    MessageEmbedding,
    Site,
    SiteEventModel,
    User,
)
from app.search.embeddings import EmbeddingsClient, get_embeddings_client
from app.search.query import parse_query
from app.search.schemas import (
    ParsedQueryOut,
    SearchEvidence,
    SearchHit,
    SearchRequest,
    SearchResponse,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["search"])

# Cosine SIMILARITY floor. pgvector's ``<=>`` is cosine *distance* in [0, 2];
# similarity = 1 - distance. A hit below this floor is treated as "not a real
# match" so we can say "not sure" rather than hallucinate a confident answer.
SIMILARITY_FLOOR = 0.15


def _get_client() -> EmbeddingsClient:
    """FastAPI dependency; overridable in tests with a FakeEmbeddings."""
    return get_embeddings_client()


class MessageSearchRequest(BaseModel):
    query: str
    site_id: UUID | None = None
    limit: int = 10


class MessageHit(BaseModel):
    message_id: UUID
    site_id: UUID
    body: str
    seq: int
    score: float
    created_at: datetime


class MessageSearchResponse(BaseModel):
    hits: list[MessageHit]
    answerable: bool


@router.post("/search/messages", response_model=MessageSearchResponse)
async def search_messages(
    body: MessageSearchRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    client: EmbeddingsClient = Depends(_get_client),
) -> MessageSearchResponse:
    """Semantic search over the chat thread (2.3 RAG). Scoped to the caller's
    visible sites (narrow-never-widen); abstains below the relevance floor."""
    visible = list(await effective_visible_site_ids(session, user))
    if body.site_id is not None:
        visible = [sid for sid in visible if sid == body.site_id]
    if not visible:
        return MessageSearchResponse(hits=[], answerable=False)

    [query_vector] = await client.embed([body.query])
    distance = MessageEmbedding.embedding.cosine_distance(query_vector).label("distance")
    rows = (
        await session.execute(
            select(ChatMessage, Conversation.site_id, distance)
            .join(MessageEmbedding, MessageEmbedding.chat_message_id == ChatMessage.id)
            .join(Conversation, Conversation.id == ChatMessage.conversation_id)
            .where(Conversation.site_id.in_(visible))
            .order_by(distance)
            .limit(max(1, min(body.limit, 50)))
        )
    ).all()

    hits: list[MessageHit] = []
    for msg, site_id, dist in rows:
        score = 1.0 - float(dist)
        if score < SIMILARITY_FLOOR:
            continue
        hits.append(
            MessageHit(
                message_id=msg.id, site_id=site_id, body=msg.body or "",
                seq=msg.seq, score=score, created_at=msg.created_at,
            )
        )
    return MessageSearchResponse(hits=hits, answerable=bool(hits))


@router.post("/search", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    client: EmbeddingsClient = Depends(_get_client),
) -> SearchResponse:
    parsed = parse_query(body.q)

    # Explicit filters from the request override the parsed ones.
    event_type = body.event_type or (parsed.event_type.value if parsed.event_type else None)
    date_from = body.date_from or parsed.date_from
    date_to = body.date_to or parsed.date_to

    # --- scoping: never search outside the caller's visible sites -----------
    visible = await effective_visible_site_ids(session, user)
    if body.site_id is not None:
        # A requested site only narrows; it can never widen scope.
        visible = [sid for sid in visible if sid == body.site_id]

    # Resolve a plain-language site-name hint ("Site A") against visible names.
    if body.site_id is None and parsed.site_name_hint:
        matched = await _match_site_by_hint(session, visible, parsed.site_name_hint)
        if matched is not None:
            visible = [matched]

    parsed_out = ParsedQueryOut.from_parsed(parsed)
    if not visible:
        return SearchResponse(query=parsed_out, hits=[], answerable=False)

    # A query that resolved to a structured filter ("cement deliveries",
    # "attendance last week") has already told us *what* it wants — the SQL
    # filter IS the relevance signal. In that case we must NOT additionally gate
    # on the semantic similarity floor: a single residual token ("cement") embeds
    # to a weak vector that can score below the floor even when hundreds of rows
    # match the filter, which would make us abstain on a perfectly answerable
    # query. The floor only guards PURE semantic queries (no structured filter),
    # where a weak match really does mean "not sure" (P5: honest AI).
    has_structured_filter = (
        event_type is not None or date_from is not None or date_to is not None
    )

    # --- semantic vector for the residual text ------------------------------
    [query_vector] = await client.embed([parsed.semantic_text])

    # --- hybrid query: ANN over embeddings JOIN events, filtered + scoped ----
    distance = EventEmbedding.embedding.cosine_distance(query_vector).label("distance")
    stmt = (
        select(
            SiteEventModel,
            Site.name,
            distance,
        )
        .join(EventEmbedding, EventEmbedding.site_event_id == SiteEventModel.id)
        .join(Site, Site.id == SiteEventModel.site_id)
        .where(SiteEventModel.site_id.in_(visible), latest_event_clause())
    )
    if event_type is not None:
        stmt = stmt.where(SiteEventModel.event_type == event_type)
    if date_from is not None:
        stmt = stmt.where(SiteEventModel.occurred_on >= date_from)
    if date_to is not None:
        stmt = stmt.where(SiteEventModel.occurred_on <= date_to)
    stmt = stmt.order_by(distance).limit(body.limit)

    rows = (await session.execute(stmt)).all()

    hits: list[SearchHit] = []
    for event, site_name, dist in rows:
        score = 1.0 - float(dist)
        # Pure semantic queries gate on the relevance floor; structured-filter
        # queries trust the filter and return its rows (still ranked by score).
        if not has_structured_filter and score < SIMILARITY_FLOOR:
            continue
        hits.append(
            SearchHit(
                event_id=event.id,
                site_id=event.site_id,
                site_name=site_name,
                event_type=event.event_type,
                occurred_on=event.occurred_on,
                summary=event.summary,
                fields=event.fields or {},
                score=round(score, 4),
                evidence=SearchEvidence(
                    source_message_ids=list(event.source_message_ids or []),
                    confidence=event.confidence,
                    needs_clarification=event.needs_clarification,
                ),
                created_at=event.created_at,
            )
        )

    return SearchResponse(query=parsed_out, hits=hits, answerable=bool(hits))


async def _match_site_by_hint(
    session: AsyncSession, visible: list[UUID], hint: str
) -> UUID | None:
    """Match a one-word site hint against visible site names (case-insensitive
    substring). Returns a single id only on an unambiguous match."""
    if not visible:
        return None
    rows = await session.execute(
        select(Site.id, Site.name).where(Site.id.in_(visible))
    )
    matches = [sid for sid, name in rows if hint.lower() in (name or "").lower()]
    return matches[0] if len(matches) == 1 else None
