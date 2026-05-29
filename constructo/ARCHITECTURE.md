# Constructo Architecture & Contracts

This document is the source of truth for the cross-agent contracts established in Wave 0.
Downstream agents (extraction, briefs, sites, bridge, web app) MUST build on these without
changing them.

## System shape

```
WhatsApp (Baileys / forward bot / Cloud API / app)
        │  POST /api/v1/ingest  (X-Ingest-Key)
        ▼
   raw_messages  ──(stub) enqueue_extraction──▶  [Wave 1: extraction worker]
        │                                              │
        │                                              ▼
        │                                         site_events
        ▼                                              │
   FastAPI (JWT auth, /api/v1)                         ▼
                                              [Wave 1: Owner Morning Brief]  ──▶  owner_briefs
```

- **Python 3.12, FastAPI, SQLAlchemy 2.x async + asyncpg, Alembic, Pydantic v2.**
- **PostgreSQL 16** with the `pgvector` extension enabled (not yet used).
- **Redis 7** reserved for the Wave 1 extraction worker queue.

---

## CONTRACTS (implement EXACTLY)

### `backend/app/contracts/events.py`

```python
from datetime import datetime, date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
from uuid import UUID, uuid4

class EventType(str, Enum):
    attendance = "attendance"
    material_delivery = "material_delivery"
    progress_update = "progress_update"
    issue = "issue"
    invoice_received = "invoice_received"
    drawing_shared = "drawing_shared"
    approval = "approval"
    payment_request = "payment_request"
    unknown = "unknown"

class MediaType(str, Enum):
    text = "text"; image = "image"; voice = "voice"; video = "video"; document = "document"

class RawMessage(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    source: str                      # "baileys" | "forward_bot" | "app" | "cloud_api"
    external_group_id: str
    sender_id: str
    sender_name: Optional[str] = None
    media_type: MediaType
    text: Optional[str] = None
    media_url: Optional[str] = None
    media_mime: Optional[str] = None
    sent_at: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)
    raw: dict = Field(default_factory=dict)

class SiteEvent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    site_id: UUID
    event_type: EventType
    occurred_on: date
    summary: str
    fields: dict
    confidence: float = Field(ge=0.0, le=1.0)
    needs_clarification: bool = False
    source_message_ids: list[UUID]
    version: int = 1
    supersedes_event_id: Optional[UUID] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### `backend/app/ingestion/base.py`

```python
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from app.contracts.events import RawMessage

class IngestionSource(ABC):
    name: str
    @abstractmethod
    async def messages(self) -> AsyncIterator[RawMessage]: ...
```

---

## DATABASE TABLES (one Alembic migration: `0001_initial`)

- `companies(id, name, created_at)`
- `users(id, company_id, name, phone, role, created_at)` — role enum: `owner, pm, supervisor, accountant, procurement, labor_contractor`
- `sites(id, company_id, name, location, type, status, created_at)`
- `whatsapp_groups(id, company_id, site_id, external_group_id, source, label)` — `unique(external_group_id, source)`
- `raw_messages(id, source, external_group_id, sender_id, sender_name, media_type, text, media_url, media_mime, sent_at, received_at, raw jsonb)`
- `site_events(id, site_id, event_type, occurred_on, summary, fields jsonb, confidence, needs_clarification, source_message_ids uuid[], version, supersedes_event_id, created_at)`
- `owner_briefs(id, company_id, brief_date, payload jsonb, sent_at)`

The migration also runs `CREATE EXTENSION IF NOT EXISTS vector`.

---

## API + AUTH CONVENTIONS (every future agent follows these)

- Prefix `/api/v1`, JSON snake_case, OpenAPI at `/openapi.json`.
- Cursor pagination: `?limit=50&cursor=...` → `{"items":[...],"next_cursor":...}`.
- Errors: `{"error":{"code":str,"message":str}}` with proper HTTP status.
- Auth: JWT bearer. `POST /api/v1/auth/login {phone, otp}` — accept `otp=="000000"` for now,
  look up or create the user, return `{token}`. `get_current_user` dependency decodes JWT.
  `require_role(*roles)` dependency. `scoping.visible_site_ids(user)` → list[UUID]
  (owner/pm: all company sites; supervisor: assigned only).
- `/api/v1/ingest` accepts a `RawMessage` JSON, validates an `X-Ingest-Key` header
  == `INGEST_API_KEY`, stores it, stub-enqueues extraction, returns `{id}`.

---

## Import paths downstream agents should rely on

| What | Import |
|------|--------|
| Event/message contracts | `from app.contracts.events import RawMessage, SiteEvent, EventType, MediaType` |
| Ingestion source base class | `from app.ingestion.base import IngestionSource` |
| Stub extraction hook (replace in Wave 1) | `from app.ingestion.router import enqueue_extraction` |
| DB base + session | `from app.db import Base, get_session, engine, SessionLocal` |
| ORM models | `from app.models import Company, User, UserRole, Site, WhatsappGroup, RawMessageModel, SiteEventModel, OwnerBrief` |
| Settings | `from app.config import settings` |
| Auth deps | `from app.auth.deps import get_current_user, require_role` |
| JWT helpers | `from app.auth.jwt import create_access_token, decode_token` |
| Site scoping | `from app.auth.scoping import visible_site_ids` |
| Error envelope | `from app.common.errors import AppError, install_error_handlers` |
| Pagination | `from app.common.pagination import Page, encode_cursor, decode_cursor` |

### Naming note

ORM classes for the two contract-backed tables are suffixed `Model` to avoid colliding with the
Pydantic contracts of the same concept: `RawMessageModel` (table) vs `RawMessage` (contract),
`SiteEventModel` (table) vs `SiteEvent` (contract).

### Wave 0 deviations (see README for detail)

1. `visible_site_ids(session, user)` — async, takes the session; supervisor → `[]` until a
   user↔site assignment table exists.
2. Login auto-provisions users into a shared `"Default Company"` with role `owner`.
3. `enqueue_extraction` is a no-op stub.
