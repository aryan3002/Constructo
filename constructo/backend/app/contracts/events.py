from datetime import date, datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


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
    text = "text"
    image = "image"
    voice = "voice"
    video = "video"
    document = "document"


class RawMessage(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    source: str  # "baileys" | "forward_bot" | "app" | "cloud_api"
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
