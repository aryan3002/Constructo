from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VendorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=64)
    gstin: str | None = Field(default=None, max_length=32)
    phone: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=1000)


class VendorUpdate(BaseModel):
    """Partial vendor edit (owner/pm). Only provided fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=64)
    gstin: str | None = Field(default=None, max_length=32)
    phone: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str
    category: str | None
    gstin: str | None
    phone: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
