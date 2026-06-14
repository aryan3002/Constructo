from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DocumentCreateIn(BaseModel):
    site_id: UUID | None = None
    doc_type: str
    title: str
    file_url: str
    expiry_on: date | None = None
    notes: str | None = None


class DocumentUpdateIn(BaseModel):
    """Partial document edit. Only provided fields change."""

    title: str | None = None
    doc_type: str | None = None
    expiry_on: date | None = None
    notes: str | None = None
    is_active: bool | None = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    site_id: UUID | None
    doc_type: str
    title: str
    file_url: str  # resolved URL (not the bare key)
    expiry_on: date | None
    notes: str | None
    is_active: bool
    created_by: UUID | None
    created_at: datetime


class DocPresignIn(BaseModel):
    filename: str
    content_type: str
    site_id: UUID | None = None


class DocPresignOut(BaseModel):
    key: str
    put_url: str | None
    mode: Literal["presigned", "unavailable"]
