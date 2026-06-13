from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import SiteChangeStatus


class SiteChangeCreate(BaseModel):
    site_id: UUID
    title: str = Field(min_length=1, max_length=300)
    note: str = Field(min_length=1, max_length=4000)
    room: str | None = Field(default=None, max_length=200)
    impact: str | None = Field(default=None, max_length=4000)
    photo_url: str | None = Field(default=None, max_length=2000)


class SiteChangeUpdate(BaseModel):
    status: SiteChangeStatus | None = None
    impact: str | None = Field(default=None, max_length=4000)
    linked_drawing_id: UUID | None = None


class SiteChangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    site_id: UUID
    room: str | None
    title: str
    note: str
    impact: str | None
    photo_url: str | None
    reported_by: UUID | None
    status: SiteChangeStatus
    linked_drawing_id: UUID | None
    created_at: datetime
    resolved_at: datetime | None
