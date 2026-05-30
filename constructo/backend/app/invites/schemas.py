"""Request/response schemas for the team-invite flow."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import UserRole


class InviteCreate(BaseModel):
    phone: str = Field(min_length=1)
    role: UserRole
    name: str | None = None


class InviteOut(BaseModel):
    id: UUID
    company_id: UUID
    phone: str
    role: UserRole
    name: str | None
    status: str
    token: str
    created_at: datetime


class InvitePreview(BaseModel):
    """Public, pre-login view of an invite (resolved from its token).

    Carries only what the join screen needs — never the inviter's identity or
    other PII — plus the company name so the invitee knows who invited them.
    """

    role: UserRole
    company_name: str
    name: str | None
    status: str


class InviteAcceptOut(BaseModel):
    token: str  # JWT access token for the now-onboarded user
    role: UserRole
    landing: str  # where the role-specific first-run should land (IA map)
