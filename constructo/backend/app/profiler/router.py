import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.extraction.llm import LLMClient
from app.homeowner.authority import can_approve
from app.homeowner.scoping import homeowner_site_ids, member_sub_role
from app.models import (
    Component,
    HomeownerMember,
    Material,
    MemberStatus,
    Space,
    Spec,
    User,
    UserRole,
)
from app.models.profiler import (
    BriefAction,
    BriefAudience,
    BriefState,
    ConflictStatus,
    ProfilerArea,
    ProfilerBrief,
    ProfilerBriefApproval,
    ProfilerBriefRendering,
    ProfilerClarification,
    ProfilerConflict,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerRanking,
    ProfilerReference,
    ProfilerReferenceAttributes,
    ProfilerTheme,
    ProfileStatus,
    ReferenceSource,
    ThemeStatus,
)
from app.profiler.bridge import bridge_id, plan_proposals
from app.profiler.brief import build_area_brief_payload, generate_clarifications, narrate_brief
from app.profiler.extraction import extract_reference_attributes, get_llm
from app.profiler.pinterest import PinResolver, get_pin_resolver
from app.profiler.schemas import (
    AreaOut,
    BriefApprovalIn,
    BriefApprovalOut,
    BriefDetailOut,
    BriefOut,
    BriefRenderingOut,
    ClarificationAnswerIn,
    ClarificationOut,
    ConflictOut,
    ConflictResolveIn,
    ContributorIn,
    ContributorOut,
    DesignMediaPresignIn,
    DesignMediaPresignOut,
    DesignMediaUploadOut,
    MaterializeOut,
    ProfileCreate,
    ProfileDetailOut,
    ProfileOut,
    RankingIn,
    ReferenceFromLinkIn,
    ReferenceIn,
    ReferenceOut,
    ThemeDecisionIn,
    ThemeOut,
)
from app.profiler.taste import build_taste_model, check_consistency
from app.profiler.themes import narrate_themes, top_reference_ids
from app.specs.schemas import SpecOut
from app.storage import Storage, get_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/design", tags=["design-profiler"])

# Who may create/edit a profile on the contractor side (homeowner-side gating is added in Plan 3).
_EDIT_ROLES = (UserRole.owner, UserRole.pm, UserRole.architect, UserRole.supervisor)

# (action, from_state) -> to_state. Any pair not present is an illegal transition.
_BRIEF_TRANSITIONS: dict[tuple[BriefAction, BriefState], BriefState] = {
    (BriefAction.request_changes, BriefState.homeowner_review): BriefState.revision_requested,
    (BriefAction.request_changes, BriefState.architect_review): BriefState.revision_requested,
    (BriefAction.send_to_architect, BriefState.homeowner_review): BriefState.architect_review,
    (BriefAction.architect_sign_off, BriefState.architect_review): (
        BriefState.contractor_brief_ready
    ),
    (BriefAction.approve, BriefState.contractor_brief_ready): BriefState.approved,
    (BriefAction.contractor_received, BriefState.approved): BriefState.locked,
}


# Direct-to-R2 upload (mirrors the chat media flow, scoped to a design profile).
_DESIGN_MAX_MEDIA_BYTES = 15 * 1024 * 1024  # 15 MB, same ceiling as chat media
_DESIGN_MEDIA_EXT = {"image": "jpg", "document": "bin"}
_DESIGN_MEDIA_CONTENT_TYPE = {"image": "image/jpeg", "document": "application/octet-stream"}


def _reference_out(ref: ProfilerReference, storage: Storage) -> ReferenceOut:
    """Serialize a reference with a fetchable image_url (presigned GET from the
    stored key, else the external source_url) so the app can render the photo."""
    out = ReferenceOut.model_validate(ref)
    out.image_url = storage.url_for(ref.image_r2_key) or ref.source_url
    return out


async def _run_vision(
    session: AsyncSession,
    llm: LLMClient,
    ref: ProfilerReference,
    area: ProfilerArea,
    vision_url: str | None,
) -> None:
    """Extract design attributes from the reference image and flag consistency vs
    the area's running taste model. Shared by every add path (upload / link /
    preset). Never raises — extraction failure leaves attributes empty."""
    if not vision_url:
        return
    try:
        attrs = await extract_reference_attributes(llm, vision_url)
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


async def _area_counts(
    session: AsyncSession, profile_id: UUID, my_contributor_id: UUID | None
) -> dict[UUID, tuple[int, int]]:
    """Per-area (reference_count, my_ranked_count) for a profile, in 2 aggregate
    queries. my_ranked_count is 0 for every area when the caller is not a
    contributor (my_contributor_id is None)."""
    ref_rows = (
        await session.execute(
            select(ProfilerReference.area_id, func.count())
            .where(ProfilerReference.profile_id == profile_id)
            .group_by(ProfilerReference.area_id)
        )
    ).all()
    counts: dict[UUID, tuple[int, int]] = {area_id: (n, 0) for area_id, n in ref_rows}
    if my_contributor_id is not None:
        ranked_rows = (
            await session.execute(
                select(
                    ProfilerReference.area_id,
                    func.count(func.distinct(ProfilerRanking.reference_id)),
                )
                .join(ProfilerReference, ProfilerReference.id == ProfilerRanking.reference_id)
                .where(
                    ProfilerReference.profile_id == profile_id,
                    ProfilerRanking.contributor_id == my_contributor_id,
                )
                .group_by(ProfilerReference.area_id)
            )
        ).all()
        for area_id, ranked in ranked_rows:
            ref_count = counts.get(area_id, (0, 0))[0]
            counts[area_id] = (ref_count, ranked)
    return counts


def _area_out(area: ProfilerArea, counts: dict[UUID, tuple[int, int]]) -> AreaOut:
    out = AreaOut.model_validate(area)
    ref_count, ranked = counts.get(area.id, (0, 0))
    out.reference_count = ref_count
    out.my_ranked_count = ranked
    return out


async def _load_owned_profile(
    session: AsyncSession, profile_id: UUID, user: User
) -> ProfilerProfile:
    profile = await session.get(ProfilerProfile, profile_id)
    if profile is None or profile.company_id != user.company_id:
        raise AppError(404, "not_found", "Profile not found")
    return profile


async def _load_accessible_profile(
    session: AsyncSession, profile_id: UUID, user: User
) -> ProfilerProfile:
    """Load a profile the caller may ACCESS (read-class), enforcing the membrane.

    Homeowner Users share the contractor's company_id (POST /homeowner/join sets
    company_id = site.company_id), so company-scope alone is too permissive for them.
    Mirror app/homeowner/router.py::_can_access_site: a homeowner must hold an active
    membership on the profile's site; contractor-side roles keep company-scope.
    """
    profile = await session.get(ProfilerProfile, profile_id)
    if profile is None:
        raise AppError(404, "not_found", "Profile not found")
    if user.role is UserRole.homeowner:
        if profile.site_id not in await homeowner_site_ids(session, user):
            raise AppError(404, "not_found", "Profile not found")
    elif profile.company_id != user.company_id:
        raise AppError(404, "not_found", "Profile not found")
    return profile


async def _validate_contributor(
    session: AsyncSession, profile: ProfilerProfile, contributor_id: UUID, user: User
) -> ProfilerContributor:
    """The contributor must belong to ``profile``; a homeowner may act only as THEIR
    own contributor (mapped by user_id, or by an active HomeownerMember of theirs)."""
    contributor = await session.get(ProfilerContributor, contributor_id)
    if contributor is None or contributor.profile_id != profile.id:
        raise AppError(404, "not_found", "Contributor not found")
    if user.role is UserRole.homeowner:
        member_ids = (
            await session.execute(
                select(HomeownerMember.id).where(
                    HomeownerMember.user_id == user.id,
                    HomeownerMember.site_id == profile.site_id,
                    HomeownerMember.status == MemberStatus.active,
                )
            )
        ).scalars().all()
        owns = contributor.user_id == user.id or contributor.member_id in set(member_ids)
        if not owns:
            raise AppError(403, "not_your_contributor", "You can only rank as yourself.")
    return contributor


_HOMEOWNER_BRIEF_ACTIONS = {
    BriefAction.approve, BriefAction.request_changes, BriefAction.send_to_architect,
}


def _audience_allowed(user: User, audience: BriefAudience) -> bool:
    """Which audience renderings a role may read (the homeowner controls the contractor view)."""
    if user.role is UserRole.homeowner:
        return True  # their own data — any audience
    if user.role is UserRole.architect:
        return audience in (BriefAudience.architect, BriefAudience.contractor)
    return audience is BriefAudience.contractor  # other contractor-side roles = "the contractor"


_CONTRACTOR_VISIBLE_STATES = {
    BriefState.contractor_brief_ready, BriefState.approved, BriefState.locked,
}


async def _resolve_area_component(
    session: AsyncSession, area: ProfilerArea | None, site_id: UUID
) -> UUID | None:
    """The area's bound Component id IF it exists and belongs to ``site_id`` (via its
    Space). Returns None when the area has no component or the component is off-site."""
    if area is None or area.component_id is None:
        return None
    component = await session.get(Component, area.component_id)
    if component is None:
        return None
    space = await session.get(Space, component.space_id)
    if space is None or space.site_id != site_id:
        return None
    return component.id


async def _my_contributor_id(
    session: AsyncSession,
    profile: ProfilerProfile,
    contributors: list[ProfilerContributor],
    user: User,
) -> UUID | None:
    """The requesting user's own contributor on this profile, if any (so a client can
    rank as themselves). Maps by user_id, or by an active HomeownerMember of theirs."""
    member_ids: set[UUID] = set()
    if user.role is UserRole.homeowner:
        member_ids = set(
            (
                await session.execute(
                    select(HomeownerMember.id).where(
                        HomeownerMember.user_id == user.id,
                        HomeownerMember.site_id == profile.site_id,
                        HomeownerMember.status == MemberStatus.active,
                    )
                )
            ).scalars().all()
        )
    for c in contributors:
        if c.user_id == user.id or (c.member_id is not None and c.member_id in member_ids):
            return c.id
    return None


async def _area_signals(
    session: AsyncSession, area_id: UUID
) -> tuple[list[dict], list[dict]]:
    """The (rankings, attributes) dict-lists the reducer expects, for one area."""
    ref_ids = (
        (
            await session.execute(
                select(ProfilerReference.id).where(ProfilerReference.area_id == area_id)
            )
        )
        .scalars()
        .all()
    )
    if not ref_ids:
        return [], []
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
        {"reference_id": str(a.reference_id), "attributes": a.attributes} for a in attr_rows
    ]
    return rankings, attrs


async def _sync_conflicts(
    session: AsyncSession, profile_id: UUID, area_id: UUID, conflicts: list[dict]
) -> None:
    """Replace this area's OPEN conflicts with the freshly-detected set.

    Resolved conflicts are preserved; only OPEN ones are replaced.
    """
    existing = (
        await session.execute(
            select(ProfilerConflict).where(
                ProfilerConflict.area_id == area_id,
                ProfilerConflict.resolution_status == ConflictStatus.open,
            )
        )
    ).scalars().all()
    for c in existing:
        await session.delete(c)
    for cf in conflicts:
        session.add(
            ProfilerConflict(
                profile_id=profile_id,
                area_id=area_id,
                dimension=cf["dimension"],
                value=cf["value"],
                contributor_a_id=UUID(cf["contributor_a"]),
                contributor_b_id=UUID(cf["contributor_b"]),
            )
        )


async def _brief_payload(session: AsyncSession, profile: ProfilerProfile) -> dict:
    """Deterministically gather the whole-profile structured brief payload.

    For each area: the reducer's taste model + APPROVED/adjusted themes + RESOLVED
    conflicts. No LLM here — every number/material is computed."""
    areas = (
        await session.execute(
            select(ProfilerArea).where(ProfilerArea.profile_id == profile.id)
        )
    ).scalars().all()
    area_payloads: list[dict] = []
    for area in areas:
        rankings, attrs = await _area_signals(session, area.id)
        model = build_taste_model(rankings, attrs, area.recommended_count)
        themes = (
            await session.execute(
                select(ProfilerTheme).where(ProfilerTheme.area_id == area.id)
            )
        ).scalars().all()
        conflicts = (
            await session.execute(
                select(ProfilerConflict).where(ProfilerConflict.area_id == area.id)
            )
        ).scalars().all()
        area_payloads.append(
            build_area_brief_payload(
                area.area_key,
                model,
                [
                    {
                        "name": t.name,
                        "palette": t.palette,
                        "materials": t.materials,
                        "status": t.status.value if hasattr(t.status, "value") else t.status,
                    }
                    for t in themes
                ],
                [
                    {
                        "dimension": c.dimension,
                        "value": c.value,
                        "decision_note": c.decision_note,
                        "resolution_status": (
                            c.resolution_status.value
                            if hasattr(c.resolution_status, "value")
                            else c.resolution_status
                        ),
                    }
                    for c in conflicts
                ],
            )
        )
    return {
        "scope_type": (
            profile.scope_type.value
            if hasattr(profile.scope_type, "value")
            else profile.scope_type
        ),
        "areas": area_payloads,
    }


def _brief_detail(
    brief: ProfilerBrief, renderings: list[ProfilerBriefRendering]
) -> BriefDetailOut:
    out = BriefDetailOut.model_validate(brief)
    out.renderings = [BriefRenderingOut.model_validate(r) for r in renderings]
    return out


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


@router.get("/profiles", response_model=list[ProfileOut])
async def list_profiles(
    site_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ProfileOut]:
    """List design profiles for the company (optionally filtered to one site).

    Powers the owner Design hub. Contractor-side roles stay company-scoped, but
    homeowners share the contractor's company_id, so company-scope alone would
    leak other clients' profiles — they are restricted to the sites they hold an
    active membership on (mirrors ``_load_accessible_profile``).
    """
    stmt = select(ProfilerProfile).where(ProfilerProfile.company_id == user.company_id)
    if user.role is UserRole.homeowner:
        stmt = stmt.where(
            ProfilerProfile.site_id.in_(await homeowner_site_ids(session, user))
        )
    if site_id is not None:
        stmt = stmt.where(ProfilerProfile.site_id == site_id)
    stmt = stmt.order_by(ProfilerProfile.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [ProfileOut.model_validate(p) for p in rows]


@router.get("/profiles/{profile_id}", response_model=ProfileDetailOut)
async def get_profile(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileDetailOut:
    profile = await _load_accessible_profile(session, profile_id, user)
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
    out.contributors = [ContributorOut.model_validate(c) for c in contributors]
    out.my_contributor_id = await _my_contributor_id(session, profile, contributors, user)
    counts = await _area_counts(session, profile_id, out.my_contributor_id)
    out.areas = [_area_out(a, counts) for a in areas]
    return out


@router.get("/profiles/by-site/{site_id}", response_model=ProfileDetailOut)
async def get_profile_by_site(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileDetailOut:
    """Resolve the most recent profile for a site, membrane-scoped (homeowner needs
    membership; contractor company-scope). 404 if none accessible."""
    profile = (
        await session.execute(
            select(ProfilerProfile)
            .where(ProfilerProfile.site_id == site_id)
            .order_by(ProfilerProfile.created_at.desc())
            .limit(1)
        )
    ).scalars().first()
    if profile is None:
        raise AppError(404, "not_found", "No design profile for this site")
    await _load_accessible_profile(session, profile.id, user)
    areas = (
        await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile.id))
    ).scalars().all()
    contributors = (
        await session.execute(
            select(ProfilerContributor).where(ProfilerContributor.profile_id == profile.id)
        )
    ).scalars().all()
    out = ProfileDetailOut.model_validate(profile)
    out.contributors = [ContributorOut.model_validate(c) for c in contributors]
    out.my_contributor_id = await _my_contributor_id(session, profile, contributors, user)
    counts = await _area_counts(session, profile.id, out.my_contributor_id)
    out.areas = [_area_out(a, counts) for a in areas]
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


@router.post("/media/presign", response_model=DesignMediaPresignOut)
async def presign_design_media(
    body: DesignMediaPresignIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DesignMediaPresignOut:
    """Direct-to-R2 upload ticket for an inspiration image, scoped to a design
    profile (the caller must be able to access it). Mirrors /chat/media/presign:
    LocalStorage (CI/dev) has no presigned PUT, so the client falls back to the
    multipart POST /design/media."""
    profile = await _load_accessible_profile(session, body.profile_id, user)
    ext = _DESIGN_MEDIA_EXT.get(body.kind, "bin")
    key = f"design/{profile.site_id}/{uuid4().hex}.{ext}"
    storage = get_storage()
    content_type = _DESIGN_MEDIA_CONTENT_TYPE.get(body.kind, "application/octet-stream")
    put_url: str | None = None
    try:
        ticket = storage.presigned_put(key, content_type)
        put_url = ticket["url"]
    except NotImplementedError:
        put_url = None
    return DesignMediaPresignOut(
        key=key, put_url=put_url, upload_mode="presigned" if put_url else "multipart"
    )


@router.post("/media", response_model=DesignMediaUploadOut)
async def upload_design_media(
    file: UploadFile = File(...),
    profile_id: UUID = Form(...),
    kind: str = Form("image"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DesignMediaUploadOut:
    """Multipart fallback for the local/CI backend (no presigned PUT): the server
    streams the image to object storage and returns the bare key, which the client
    then attaches via POST /design/references."""
    profile = await _load_accessible_profile(session, profile_id, user)
    data = await file.read()
    if not data:
        raise AppError(422, "empty_file", "No file content")
    if len(data) > _DESIGN_MAX_MEDIA_BYTES:
        raise AppError(413, "media_too_large", "Image exceeds 15 MB")
    ext = _DESIGN_MEDIA_EXT.get(kind, "bin")
    key = f"design/{profile.site_id}/{uuid4().hex}.{ext}"
    get_storage().put_bytes(key, data, file.content_type or "application/octet-stream")
    return DesignMediaUploadOut(key=key)


@router.post("/references", response_model=ReferenceOut, status_code=201)
async def add_reference(
    body: ReferenceIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> ReferenceOut:
    area = await session.get(ProfilerArea, body.area_id)
    if area is None:
        raise AppError(404, "not_found", "Area not found")
    profile = await _load_accessible_profile(session, area.profile_id, user)
    if body.contributor_id is not None:
        await _validate_contributor(session, profile, body.contributor_id, user)
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

    storage = get_storage()
    # Vision needs a FETCHABLE url, never a bare R2 key — resolve the stored key
    # (presigned GET) or pass the external source_url through.
    vision_url = body.source_url or storage.url_for(body.image_r2_key)
    await _run_vision(session, llm, ref, area, vision_url)

    await session.commit()
    await session.refresh(ref)
    return _reference_out(ref, storage)


@router.post("/references/from-link", response_model=ReferenceOut, status_code=201)
async def add_reference_from_link(
    body: ReferenceFromLinkIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
    resolver: PinResolver = Depends(get_pin_resolver),
) -> ReferenceOut:
    """Add an inspiration reference from a pasted Pinterest pin link. The pin's
    preview image is RE-HOSTED into our R2 so the reference is permanent and flows
    through display + vision + ranking exactly like an upload."""
    area = await session.get(ProfilerArea, body.area_id)
    if area is None:
        raise AppError(404, "not_found", "Area not found")
    profile = await _load_accessible_profile(session, area.profile_id, user)
    if body.contributor_id is not None:
        await _validate_contributor(session, profile, body.contributor_id, user)

    try:
        data, content_type, _resolved = await resolver.fetch(body.url)
    except AppError:
        raise
    except Exception as exc:  # network/parse failure -> friendly 422, never 500
        logger.info("profiler: pinterest resolve failed for %s: %s", body.url, exc)
        raise AppError(
            422, "pinterest_unresolved",
            "Couldn't read that Pinterest link. Try copying the pin link again.",
        ) from exc

    storage = get_storage()
    key = f"design/{profile.site_id}/{uuid4().hex}.jpg"
    storage.put_bytes(key, data, content_type or "image/jpeg")

    ref = ProfilerReference(
        profile_id=area.profile_id,
        area_id=area.id,
        contributor_id=body.contributor_id,
        source_type=ReferenceSource.pinterest_link,
        image_r2_key=key,
        source_url=body.url,
    )
    session.add(ref)
    await session.flush()
    await _run_vision(session, llm, ref, area, storage.url_for(key))

    await session.commit()
    await session.refresh(ref)
    return _reference_out(ref, storage)


@router.get(
    "/profiles/{profile_id}/areas/{area_id}/references", response_model=list[ReferenceOut]
)
async def list_references(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ReferenceOut]:
    """The references for one area (membrane-scoped read). The homeowner intake
    ranking screen lists these to rank."""
    await _load_accessible_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")
    rows = (
        await session.execute(
            select(ProfilerReference)
            .where(ProfilerReference.area_id == area_id)
            .order_by(ProfilerReference.created_at)
        )
    ).scalars().all()
    storage = get_storage()
    return [_reference_out(r, storage) for r in rows]


@router.post("/references/{reference_id}/rankings", status_code=201)
async def rank_reference(
    reference_id: UUID,
    body: RankingIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    ref = await session.get(ProfilerReference, reference_id)
    if ref is None:
        raise AppError(404, "not_found", "Reference not found")
    profile = await _load_accessible_profile(session, ref.profile_id, user)
    await _validate_contributor(session, profile, body.contributor_id, user)
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
    await _load_accessible_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    rankings, attrs = await _area_signals(session, area_id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
    # Persist the deterministic summary back onto the area (no LLM involved here).
    area.taste_model = model["dimensions"]
    area.confidence = model["confidence"]
    area.has_conflict = model["has_conflict"]
    await session.commit()
    return model


@router.post(
    "/profiles/{profile_id}/areas/{area_id}/themes",
    response_model=list[ThemeOut],
    status_code=201,
)
async def generate_themes(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> list[ThemeOut]:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    rankings, attrs = await _area_signals(session, area_id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
    evidence = top_reference_ids(rankings)

    try:
        proposals = await narrate_themes(llm, area.area_key, model)
    except Exception:  # narration must never 500 the request
        logger.exception("profiler: theme narration failed for area %s", area_id)
        proposals = []

    # Replace prior SUGGESTED themes for this area (keep approved/adjusted/rejected).
    prior = (
        await session.execute(
            select(ProfilerTheme).where(
                ProfilerTheme.area_id == area_id, ProfilerTheme.status == ThemeStatus.suggested
            )
        )
    ).scalars().all()
    for t in prior:
        await session.delete(t)

    created: list[ProfilerTheme] = []
    for p in proposals:
        theme = ProfilerTheme(
            profile_id=profile_id, area_id=area_id,
            name=(p.get("name") or "Untitled"),
            palette=(p.get("palette") or []),
            materials=(p.get("materials") or []),
            rationale=p.get("rationale"),
            evidence_reference_ids=evidence,
            confidence=model["confidence"],  # reducer math, never the LLM
        )
        session.add(theme)
        created.append(theme)

    await _sync_conflicts(session, profile_id, area_id, model["conflicts"])
    await session.commit()
    for t in created:
        await session.refresh(t)
    return [ThemeOut.model_validate(t) for t in created]


@router.get("/profiles/{profile_id}/areas/{area_id}/themes", response_model=list[ThemeOut])
async def list_themes(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ThemeOut]:
    await _load_accessible_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")
    rows = (
        await session.execute(
            select(ProfilerTheme)
            .where(ProfilerTheme.area_id == area_id)
            .order_by(ProfilerTheme.created_at)
        )
    ).scalars().all()
    return [ThemeOut.model_validate(t) for t in rows]


@router.get("/profiles/{profile_id}/conflicts", response_model=list[ConflictOut])
async def list_conflicts(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConflictOut]:
    await _load_accessible_profile(session, profile_id, user)
    rows = (
        await session.execute(
            select(ProfilerConflict)
            .where(ProfilerConflict.profile_id == profile_id)
            .order_by(ProfilerConflict.created_at)
        )
    ).scalars().all()
    return [ConflictOut.model_validate(c) for c in rows]


@router.post("/themes/{theme_id}/decision", response_model=ThemeOut)
async def decide_theme(
    theme_id: UUID,
    body: ThemeDecisionIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ThemeOut:
    theme = await session.get(ProfilerTheme, theme_id)
    if theme is None:
        raise AppError(404, "not_found", "Theme not found")
    await _load_owned_profile(session, theme.profile_id, user)
    theme.status = {
        "approve": ThemeStatus.approved,
        "adjust": ThemeStatus.adjusted,
        "reject": ThemeStatus.rejected,
    }[body.action]
    theme.decided_by = user.id
    theme.decided_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(theme)
    return ThemeOut.model_validate(theme)


@router.post("/conflicts/{conflict_id}/resolve", response_model=ConflictOut)
async def resolve_conflict(
    conflict_id: UUID,
    body: ConflictResolveIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ConflictOut:
    conflict = await session.get(ProfilerConflict, conflict_id)
    if conflict is None:
        raise AppError(404, "not_found", "Conflict not found")
    await _load_owned_profile(session, conflict.profile_id, user)
    conflict.resolution_status = (
        ConflictStatus.deferred_to_architect
        if body.resolution == "defer_to_architect"
        else ConflictStatus.resolved
    )
    conflict.resolved_by = user.id
    conflict.decision_note = body.note or body.resolution
    conflict.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(conflict)
    return ConflictOut.model_validate(conflict)


# ---------------------------------------------------------------------------
# Task 4: Brief generation
# ---------------------------------------------------------------------------


@router.post("/profiles/{profile_id}/brief", response_model=BriefDetailOut, status_code=201)
async def generate_brief(
    profile_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> BriefDetailOut:
    profile = await _load_owned_profile(session, profile_id, user)
    payload = await _brief_payload(session, profile)

    next_version = (
        await session.scalar(
            select(func.coalesce(func.max(ProfilerBrief.version), 0)).where(
                ProfilerBrief.profile_id == profile_id
            )
        )
    ) + 1
    brief = ProfilerBrief(
        profile_id=profile_id,
        version=next_version,
        state=BriefState.homeowner_review,
        summary_json=payload,
        created_by=user.id,
    )
    session.add(brief)
    await session.flush()

    renderings: list[ProfilerBriefRendering] = []
    for audience in (
        BriefAudience.homeowner,
        BriefAudience.architect,
        BriefAudience.contractor,
    ):
        try:
            prose = await narrate_brief(llm, audience.value, payload)
        except Exception:  # narration must never 500 the request
            logger.exception(
                "profiler: brief narration failed for %s/%s", profile_id, audience
            )
            prose = {"headline": "", "summary": "", "sections": []}
        # content = deterministic payload (numbers/materials) + LLM prose (phrasing only)
        content = {
            "areas": payload["areas"],
            "scope_type": payload["scope_type"],
            "narrative": prose,
        }
        rendering = ProfilerBriefRendering(
            brief_id=brief.id,
            audience=audience,
            scope="whole_house",
            content_json=content,
        )
        session.add(rendering)
        renderings.append(rendering)

    await session.commit()
    await session.refresh(brief)
    for r in renderings:
        await session.refresh(r)
    return _brief_detail(brief, renderings)


# ---------------------------------------------------------------------------
# Task 5: Brief approval state-machine
# ---------------------------------------------------------------------------


@router.post("/briefs/{brief_id}/approval", response_model=BriefOut)
async def act_on_brief(
    brief_id: UUID,
    body: BriefApprovalIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BriefOut:
    brief = await session.get(ProfilerBrief, brief_id)
    if brief is None:
        raise AppError(404, "not_found", "Brief not found")
    profile = await _load_accessible_profile(session, brief.profile_id, user)

    action = BriefAction(body.action)
    target = _BRIEF_TRANSITIONS.get((action, brief.state))
    if target is None:
        raise AppError(
            409, "invalid_transition",
            f"Cannot {action.value} a brief in state {brief.state.value}",
        )

    # --- the membrane: authority per action ---------------------------------
    actor_member_id: UUID | None = None
    if action in _HOMEOWNER_BRIEF_ACTIONS:
        # Money/scope commit -> owner/co_owner only. Family/advisor get a comment box.
        sub_role = await member_sub_role(session, user, profile.site_id)
        if sub_role is None or not can_approve(sub_role):
            raise AppError(
                403, "approve_forbidden",
                "Only a property owner can approve this. You can add a comment.",
                extra={"can_comment": True},
            )
        actor_role = sub_role.value
        actor_member_id = (
            await session.execute(
                select(HomeownerMember.id).where(
                    HomeownerMember.user_id == user.id,
                    HomeownerMember.site_id == profile.site_id,
                    HomeownerMember.status == MemberStatus.active,
                )
            )
        ).scalars().first()
    elif action is BriefAction.architect_sign_off:
        if user.role is not UserRole.architect:
            raise AppError(403, "architect_only", "Only the architect can sign off this brief.")
        actor_role = user.role.value
    else:  # contractor_received
        if user.role not in _EDIT_ROLES:
            raise AppError(403, "contractor_only", "Only the contractor can mark this received.")
        actor_role = user.role.value

    brief.state = target
    session.add(
        ProfilerBriefApproval(
            brief_id=brief.id, actor_user_id=user.id, actor_member_id=actor_member_id,
            actor_role=actor_role, action=action, note=body.note,
        )
    )
    await session.commit()
    await session.refresh(brief)
    return BriefOut.model_validate(brief)


@router.get("/profiles/{profile_id}/brief", response_model=BriefRenderingOut)
async def get_brief_rendering(
    profile_id: UUID,
    audience: str = "homeowner",
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BriefRenderingOut:
    await _load_accessible_profile(session, profile_id, user)
    try:
        aud = BriefAudience(audience)
    except ValueError as exc:
        raise AppError(422, "bad_audience", "Unknown audience") from exc

    brief = (
        await session.execute(
            select(ProfilerBrief)
            .where(ProfilerBrief.profile_id == profile_id)
            .order_by(ProfilerBrief.version.desc())
            .limit(1)
        )
    ).scalars().first()
    if brief is None:
        raise AppError(404, "not_found", "No brief generated yet")

    if not _audience_allowed(user, aud):
        raise AppError(403, "audience_forbidden", "Not permitted to view this rendering")
    # The contractor (non-architect contractor-side) sees the brief only once shared.
    if (
        user.role is not UserRole.homeowner
        and user.role is not UserRole.architect
        and brief.state not in _CONTRACTOR_VISIBLE_STATES
    ):
        raise AppError(
            403, "brief_not_shared", "This brief has not been shared with the contractor yet"
        )

    rendering = (
        await session.execute(
            select(ProfilerBriefRendering).where(
                ProfilerBriefRendering.brief_id == brief.id,
                ProfilerBriefRendering.audience == aud,
            )
        )
    ).scalars().first()
    if rendering is None:
        raise AppError(404, "not_found", "Rendering not found")
    return BriefRenderingOut.model_validate(rendering)


@router.get("/briefs/{brief_id}/approvals", response_model=list[BriefApprovalOut])
async def list_brief_approvals(
    brief_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BriefApprovalOut]:
    """The attributed approval timeline (§8): every action with actor name + role.

    Membrane-scoped — only someone who can access the profile sees its timeline.
    """
    brief = await session.get(ProfilerBrief, brief_id)
    if brief is None:
        raise AppError(404, "not_found", "Brief not found")
    await _load_accessible_profile(session, brief.profile_id, user)
    rows = (
        await session.execute(
            select(ProfilerBriefApproval)
            .where(ProfilerBriefApproval.brief_id == brief_id)
            .order_by(ProfilerBriefApproval.created_at)
        )
    ).scalars().all()
    return [BriefApprovalOut.model_validate(r) for r in rows]


@router.post("/briefs/{brief_id}/materialize", response_model=MaterializeOut, status_code=201)
async def materialize_brief(
    brief_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> MaterializeOut:
    """Propose Material + Spec rows (pending) from a SHARED brief's deterministic
    payload. No LLM; quantities left NULL; a human confirms via /specs/{id}/approve.
    Idempotent via uuid5 keys — re-running reuses, never duplicates."""
    brief = await session.get(ProfilerBrief, brief_id)
    if brief is None:
        raise AppError(404, "not_found", "Brief not found")
    profile = await _load_owned_profile(session, brief.profile_id, user)
    if brief.state not in _CONTRACTOR_VISIBLE_STATES:
        raise AppError(
            409, "brief_not_ready",
            "Materialize a brief only after architect sign-off (contractor_brief_ready+).",
        )

    areas = (
        await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile.id))
    ).scalars().all()
    areas_by_key = {a.area_key: a for a in areas}

    materials_created = materials_reused = specs_created = specs_reused = 0
    skipped: list[str] = []
    created_specs: list[Spec] = []

    for prop in plan_proposals(brief.summary_json or {}):
        area = areas_by_key.get(prop["area_key"])
        mat_id = bridge_id("material", profile.company_id, prop["material_name"])
        material = await session.get(Material, mat_id)
        if material is None:
            material = Material(
                id=mat_id, company_id=profile.company_id, name=prop["material_name"],
                category="design-brief",
            )
            session.add(material)
            await session.flush()
            materials_created += 1
        else:
            materials_reused += 1

        component_id = await _resolve_area_component(session, area, profile.site_id)
        if component_id is None:
            if prop["area_key"] not in skipped:
                skipped.append(prop["area_key"])
            continue

        spec_id = bridge_id("spec", component_id, prop["label"])
        spec = await session.get(Spec, spec_id)
        if spec is None:
            spec = Spec(
                id=spec_id, company_id=profile.company_id, site_id=profile.site_id,
                component_id=component_id, material_id=material.id, label=prop["label"],
                notes="Proposed from the design brief — confirm.",
            )
            session.add(spec)
            await session.flush()
            specs_created += 1
        else:
            specs_reused += 1
        created_specs.append(spec)

    await session.commit()
    for s in created_specs:
        await session.refresh(s)
    return MaterializeOut(
        materials_created=materials_created, materials_reused=materials_reused,
        specs_created=specs_created, specs_reused=specs_reused,
        skipped_areas=skipped, specs=[SpecOut.model_validate(s) for s in created_specs],
    )


# ---------------------------------------------------------------------------
# Task 6: Clarifications — generate / list / answer
# ---------------------------------------------------------------------------


@router.post(
    "/profiles/{profile_id}/areas/{area_id}/clarifications",
    response_model=list[ClarificationOut],
    status_code=201,
)
async def generate_clarifications_endpoint(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> list[ClarificationOut]:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    rankings, attrs = await _area_signals(session, area_id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
    try:
        questions = await generate_clarifications(llm, area.area_key, model)
    except Exception:  # never 500 on narration
        logger.exception(
            "profiler: clarification generation failed for area %s", area_id
        )
        questions = []

    created: list[ProfilerClarification] = []
    for q in questions:
        row = ProfilerClarification(
            profile_id=profile_id,
            area_id=area_id,
            question=q,
            source_attribution={
                "confidence": model["confidence"],
                "has_conflict": model["has_conflict"],
            },
        )
        session.add(row)
        created.append(row)
    await session.commit()
    for row in created:
        await session.refresh(row)
    return [ClarificationOut.model_validate(c) for c in created]


@router.get("/profiles/{profile_id}/clarifications", response_model=list[ClarificationOut])
async def list_clarifications(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ClarificationOut]:
    await _load_accessible_profile(session, profile_id, user)
    rows = (
        await session.execute(
            select(ProfilerClarification)
            .where(ProfilerClarification.profile_id == profile_id)
            .order_by(ProfilerClarification.asked_at)
        )
    ).scalars().all()
    return [ClarificationOut.model_validate(c) for c in rows]


@router.post("/clarifications/{clarification_id}/answer", response_model=ClarificationOut)
async def answer_clarification(
    clarification_id: UUID,
    body: ClarificationAnswerIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ClarificationOut:
    row = await session.get(ProfilerClarification, clarification_id)
    if row is None:
        raise AppError(404, "not_found", "Clarification not found")
    await _load_accessible_profile(session, row.profile_id, user)
    row.answer = body.answer
    row.answered_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return ClarificationOut.model_validate(row)
