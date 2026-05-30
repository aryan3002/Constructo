"""Request/response schemas for the search API."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.search.query import ParsedQuery


class SearchRequest(BaseModel):
    """A hybrid-search request.

    ``q`` is the plain-language query. Explicit filters, when provided, OVERRIDE
    whatever the parser would infer from ``q`` (the UI sends them when the user
    picks a chip). All filters are intersected with the caller's visible sites.
    """

    q: str = Field(min_length=1, max_length=500)
    site_id: UUID | None = None
    event_type: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    limit: int = Field(default=20, ge=1, le=50)


class SearchEvidence(BaseModel):
    """Provenance for a hit: the raw messages the event was extracted from."""

    source_message_ids: list[UUID]
    confidence: float
    needs_clarification: bool


class SearchHit(BaseModel):
    """One search result — a site event with its similarity score + evidence."""

    event_id: UUID
    site_id: UUID
    site_name: str
    event_type: str
    occurred_on: date
    summary: str
    fields: dict
    score: float  # 0..1 cosine similarity (1 = identical direction)
    evidence: SearchEvidence
    created_at: datetime


class ParsedQueryOut(BaseModel):
    """Echoes how the query was understood — drives the UI's filter chips and
    keeps the AI honest (the user sees exactly what we searched for)."""

    semantic_text: str
    event_type: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    site_name_hint: str | None = None

    @classmethod
    def from_parsed(cls, p: ParsedQuery) -> "ParsedQueryOut":
        return cls(
            semantic_text=p.semantic_text,
            event_type=p.event_type.value if p.event_type else None,
            date_from=p.date_from,
            date_to=p.date_to,
            site_name_hint=p.site_name_hint,
        )


class SearchResponse(BaseModel):
    """Hybrid-search response.

    ``answerable`` is ``False`` when we are NOT confident enough to answer (no
    visible sites, or no hit clears the similarity floor) — the UI then says
    "not sure" and offers to broaden, rather than presenting weak guesses as
    fact (principle P5: honest AI).
    """

    query: ParsedQueryOut
    hits: list[SearchHit]
    answerable: bool
