from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MaterialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    unit: str | None = Field(default=None, max_length=32)
    category: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=1000)


class MaterialUpdate(BaseModel):
    """Partial material edit (owner/pm). Only provided fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    unit: str | None = Field(default=None, max_length=32)
    category: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class MaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str
    unit: str | None
    category: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
