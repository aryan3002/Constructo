import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.extraction.llm import LLMClient
from app.models import User, UserRole
from app.models.profiler import (
    ProfilerArea,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerRanking,
    ProfilerReference,
    ProfilerReferenceAttributes,
    ProfileStatus,
)
from app.profiler.extraction import extract_reference_attributes, get_llm
from app.profiler.schemas import (
    AreaOut,
    ContributorIn,
    ContributorOut,
    ProfileCreate,
    ProfileDetailOut,
    ProfileOut,
    RankingIn,
    ReferenceIn,
    ReferenceOut,
)
from app.profiler.taste import build_taste_model, check_consistency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/design", tags=["design-profiler"])

# Who may create/edit a profile on the contractor side (homeowner-side gating is added in Plan 3).
_EDIT_ROLES = (UserRole.owner, UserRole.pm, UserRole.architect, UserRole.supervisor)


async def _load_owned_profile(
    session: AsyncSession, profile_id: UUID, user: User
) -> ProfilerProfile:
    profile = await session.get(ProfilerProfile, profile_id)
    if profile is None or profile.company_id != user.company_id:
        raise AppError(404, "not_found", "Profile not found")
    return profile


@router.post("/profiles", response_model=ProfileOut, status_code=201)
async def create_profile(
    body: ProfileCreate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ProfileOut:
    profile = ProfilerProfile(
        company_id=user.company_id,
        site_id=body.site_id,
        scope_type=body.scope_type,
        created_by=user.id,
        status=ProfileStatus.intake_started,
    )
    session.add(profile)
    await session.flush()
    for a in body.areas:
        session.add(
            ProfilerArea(
                profile_id=profile.id,
                area_kind=a.area_kind,
                area_key=a.area_key,
                space_id=a.space_id,
                component_id=a.component_id,
                recommended_count=a.recommended_count,
            )
        )
    for c in body.contributors:
        session.add(
            ProfilerContributor(
                profile_id=profile.id,
                member_id=c.member_id,
                user_id=c.user_id,
                role=c.role,
                is_decision_owner=c.is_decision_owner,
            )
        )
    await session.commit()
    await session.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.get("/profiles/{profile_id}", response_model=ProfileDetailOut)
async def get_profile(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileDetailOut:
    profile = await _load_owned_profile(session, profile_id, user)
    areas = (
        (await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile_id)))
        .scalars()
        .all()
    )
    contributors = (
        (
            await session.execute(
                select(ProfilerContributor).where(ProfilerContributor.profile_id == profile_id)
            )
        )
        .scalars()
        .all()
    )
    out = ProfileDetailOut.model_validate(profile)
    out.areas = [AreaOut.model_validate(a) for a in areas]
    out.contributors = [ContributorOut.model_validate(c) for c in contributors]
    return out


@router.post("/profiles/{profile_id}/contributors", status_code=201)
async def add_contributor(
    profile_id: UUID,
    body: ContributorIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    profile = await _load_owned_profile(session, profile_id, user)
    c = ProfilerContributor(
        profile_id=profile.id,
        member_id=body.member_id,
        user_id=body.user_id,
        role=body.role,
        is_decision_owner=body.is_decision_owner,
    )
    session.add(c)
    await session.commit()
    return {"id": str(c.id)}


@router.post("/references", response_model=ReferenceOut, status_code=201)
async def add_reference(
    body: ReferenceIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> ReferenceOut:
    area = await session.get(ProfilerArea, body.area_id)
    if area is None:
        raise AppError(404, "not_found", "Area not found")
    await _load_owned_profile(session, area.profile_id, user)
    ref = ProfilerReference(
        profile_id=area.profile_id,
        area_id=area.id,
        contributor_id=body.contributor_id,
        source_type=body.source_type,
        image_r2_key=body.image_r2_key,
        source_url=body.source_url,
        preset_id=body.preset_id,
    )
    session.add(ref)
    await session.flush()

    image_url = body.source_url or body.image_r2_key
    if image_url:
        try:
            attrs = await extract_reference_attributes(llm, image_url)
        except Exception:  # never fail the request on extraction
            logger.exception("profiler: vision extraction failed for reference %s", ref.id)
            attrs = None
        if attrs:
            confidence = float(attrs.get("confidence") or 0.0)
            session.add(
                ProfilerReferenceAttributes(
                    reference_id=ref.id, attributes=attrs, confidence=confidence
                )
            )
            verdict = check_consistency(attrs, area.taste_model or {})
            ref.consistency_status = verdict["status"]
            ref.consistency_note = verdict["reason"]

    await session.commit()
    await session.refresh(ref)
    return ReferenceOut.model_validate(ref)


@router.post("/references/{reference_id}/rankings", status_code=201)
async def rank_reference(
    reference_id: UUID,
    body: RankingIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    ref = await session.get(ProfilerReference, reference_id)
    if ref is None:
        raise AppError(404, "not_found", "Reference not found")
    await _load_owned_profile(session, ref.profile_id, user)
    existing = (
        await session.execute(
            select(ProfilerRanking).where(
                ProfilerRanking.reference_id == reference_id,
                ProfilerRanking.contributor_id == body.contributor_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.stars = body.stars
        existing.tags = body.tags
        existing.note = body.note
    else:
        session.add(
            ProfilerRanking(
                reference_id=reference_id,
                contributor_id=body.contributor_id,
                stars=body.stars,
                tags=body.tags,
                note=body.note,
            )
        )
    await session.commit()
    return {"ok": True}


@router.get("/profiles/{profile_id}/areas/{area_id}/taste")
async def get_area_taste(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    ref_ids = (
        (
            await session.execute(
                select(ProfilerReference.id).where(ProfilerReference.area_id == area_id)
            )
        )
        .scalars()
        .all()
    )
    rankings, attrs = [], []
    if ref_ids:
        rank_rows = (
            await session.execute(
                select(ProfilerRanking).where(ProfilerRanking.reference_id.in_(ref_ids))
            )
        ).scalars().all()
        attr_rows = (
            await session.execute(
                select(ProfilerReferenceAttributes).where(
                    ProfilerReferenceAttributes.reference_id.in_(ref_ids)
                )
            )
        ).scalars().all()
        rankings = [
            {
                "reference_id": str(r.reference_id),
                "contributor_id": str(r.contributor_id),
                "stars": r.stars,
                "tags": r.tags,
            }
            for r in rank_rows
        ]
        attrs = [
            {"reference_id": str(a.reference_id), "attributes": a.attributes}
            for a in attr_rows
        ]

    model = build_taste_model(rankings, attrs, area.recommended_count)
    # Persist the deterministic summary back onto the area (no LLM involved here).
    area.taste_model = model["dimensions"]
    area.confidence = model["confidence"]
    area.has_conflict = model["has_conflict"]
    await session.commit()
    return model
