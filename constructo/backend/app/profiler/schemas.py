from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.profiler import (
    AreaKind,
    ContributorRole,
    ProfileScope,
    ProfileStatus,
    ReferenceSource,
)


class AreaIn(BaseModel):
    area_kind: AreaKind
    area_key: str = Field(min_length=1, max_length=64)
    space_id: UUID | None = None
    component_id: UUID | None = None
    recommended_count: int = 6


class ContributorIn(BaseModel):
    member_id: UUID | None = None
    user_id: UUID | None = None
    role: ContributorRole
    is_decision_owner: bool = False


class ProfileCreate(BaseModel):
    site_id: UUID
    scope_type: ProfileScope = ProfileScope.whole_house
    areas: list[AreaIn] = Field(default_factory=list)
    contributors: list[ContributorIn] = Field(default_factory=list)


class AreaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_kind: AreaKind
    area_key: str
    recommended_count: int
    status: str
    confidence: float
    has_conflict: bool


class ContributorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    role: ContributorRole
    is_decision_owner: bool


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    site_id: UUID
    scope_type: ProfileScope
    status: ProfileStatus
    created_at: datetime


class ProfileDetailOut(ProfileOut):
    areas: list[AreaOut] = []
    contributors: list[ContributorOut] = []


class ReferenceIn(BaseModel):
    area_id: UUID
    contributor_id: UUID | None = None
    source_type: ReferenceSource = ReferenceSource.upload
    image_r2_key: str | None = None
    source_url: str | None = None
    preset_id: str | None = None


class ReferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID
    source_type: ReferenceSource
    consistency_status: str | None = None
    created_at: datetime


class RankingIn(BaseModel):
    contributor_id: UUID
    stars: int = Field(ge=1, le=5)
    tags: dict = Field(default_factory=lambda: {"positive": [], "negative": []})
    note: str | None = None
