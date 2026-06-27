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
from app.specs.schemas import SpecOut


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
    # Populated by the router (not on the ORM row): how many references this area
    # holds, and how many the requesting user has ranked. Powers "X of N ranked".
    reference_count: int = 0
    my_ranked_count: int = 0


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
    # The requesting user's own contributor on this profile (so a client can rank
    # as themselves). None when the caller is not a contributor (e.g. a contractor).
    my_contributor_id: UUID | None = None


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
    image_r2_key: str | None = None
    source_url: str | None = None
    preset_id: str | None = None
    # Computed by the router: a fetchable URL the app can render (presigned GET
    # from image_r2_key, else the external source_url). Not on the ORM row.
    image_url: str | None = None
    consistency_status: str | None = None
    created_at: datetime


class ReferenceFromLinkIn(BaseModel):
    area_id: UUID
    contributor_id: UUID | None = None
    url: str = Field(min_length=4, max_length=2048)


class ReferenceFromPresetIn(BaseModel):
    area_id: UUID
    contributor_id: UUID | None = None
    preset_id: UUID


class PresetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_kind: str
    area_key: str | None = None
    pack: str
    title: str
    # Computed by the router: a fetchable URL the app renders.
    image_url: str | None = None


class DesignMediaPresignIn(BaseModel):
    profile_id: UUID
    kind: str = "image"


class DesignMediaPresignOut(BaseModel):
    key: str
    put_url: str | None
    upload_mode: str  # "presigned" | "multipart"


class DesignMediaUploadOut(BaseModel):
    key: str


class RankingIn(BaseModel):
    contributor_id: UUID
    stars: int = Field(ge=1, le=5)
    tags: dict = Field(default_factory=lambda: {"positive": [], "negative": []})
    note: str | None = None


class ThemeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID | None = None
    name: str
    confidence: float
    palette: list = []
    materials: list = []
    rationale: str | None = None
    evidence_reference_ids: list = []
    status: str
    created_at: datetime


class ThemeDecisionIn(BaseModel):
    action: str = Field(pattern="^(approve|adjust|reject)$")
    note: str | None = None


class ConflictOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID
    dimension: str
    value: str
    contributor_a_id: UUID | None = None
    contributor_b_id: UUID | None = None
    resolution_status: str
    decision_note: str | None = None


class ConflictResolveIn(BaseModel):
    resolution: str = Field(pattern="^(keep_a|keep_b|compromise|defer_to_architect)$")
    note: str | None = None


class BriefRenderingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    brief_id: UUID
    audience: str
    scope: str
    area_id: UUID | None = None
    content_json: dict = {}
    created_at: datetime


class BriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    profile_id: UUID
    version: int
    state: str
    created_at: datetime


class BriefDetailOut(BriefOut):
    renderings: list[BriefRenderingOut] = []


class BriefApprovalIn(BaseModel):
    action: str = Field(
        pattern="^(approve|request_changes|send_to_architect|architect_sign_off|contractor_received)$"
    )
    note: str | None = None


class BriefApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    brief_id: UUID
    actor_user_id: UUID | None = None
    actor_member_id: UUID | None = None
    actor_role: str
    action: str
    note: str | None = None
    created_at: datetime


class ClarificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID | None = None
    question: str
    answer: str | None = None
    asked_at: datetime
    answered_at: datetime | None = None


class ClarificationAnswerIn(BaseModel):
    answer: str = Field(min_length=1)


class MaterializeOut(BaseModel):
    materials_created: int
    materials_reused: int
    specs_created: int
    specs_reused: int
    skipped_areas: list[str] = []
    specs: list[SpecOut] = []
