"""Auth routes: OTP-stub login, current-user lookup, profile + language update.

Phone+OTP only (no passwords). The dev OTP stays "000000" until an SMS provider
is wired. Sending an OTP is a polite no-op endpoint today so the web login can
present a real "request code -> enter code" flow (and re-OTP recovery) without
branching on whether SMS exists yet.
"""
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import _bearer, get_current_user, require_role, require_step_up
from app.auth.jwt import STEP_UP_SCOPE, create_access_token, create_step_up_token, decode_token
from app.auth.landing import landing_for
from app.auth.otp import assert_otp_valid, dev_otp_hint
from app.auth.phone import normalize_phone, phone_candidates
from app.auth.scrub import identity_patterns, scrub_json, scrub_text
from app.common import ratelimit
from app.common.errors import AppError
from app.config import settings
from app.db import get_session
from app.invites.models import InviteStatus
from app.invites.service import pending_invite_for_phone
from app.models import (
    Company,
    HomeownerMember,
    PhotoComment,
    PushToken,
    RawMessageModel,
    RevokedToken,
    SiteEventModel,
    User,
    UserRole,
)
from app.storage import get_storage

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Placeholder name for a brand-new signup's company until the owner names it
# in the web first-run (which keys off "no sites yet", not this name).
DEFAULT_COMPANY_NAME = "Default Company"
SUPPORTED_LANGUAGES = ("en", "hi")


class RequestOtpIn(BaseModel):
    phone: str = Field(min_length=1)


class RequestOtpOut(BaseModel):
    sent: bool = True
    # The dev OTP, surfaced ONLY while the dev bypass is enabled (never leaked
    # once closed in prod). Set per-response via `dev_otp_hint()`.
    dev_otp: str | None = None


class LoginIn(BaseModel):
    phone: str
    otp: str
    # Only the web console (the builder signup surface) sends signup=true. An
    # unknown number without it is refused rather than given an account.
    signup: bool = False


class TokenOut(BaseModel):
    token: str


class MeOut(BaseModel):
    id: UUID
    company_id: UUID
    # Human-readable company name so clients never have to show the raw
    # company_id UUID. Null only if the company row is somehow missing.
    company_name: str | None = None
    name: str | None
    phone: str
    role: UserRole
    language: str | None


class MeUpdateIn(BaseModel):
    """Profile patch. Both fields optional; only provided ones change."""

    name: str | None = None
    language: Literal["en", "hi"] | None = None


class LandingOut(BaseModel):
    role: UserRole
    landing: str


class CompanyUpdateIn(BaseModel):
    """Partial company profile update (W4.2). Every field optional; only the
    provided ones change. `name`, if sent, must be non-empty."""

    name: str | None = Field(default=None, min_length=1)
    gstin: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=500)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    currency: str | None = Field(default=None, min_length=1, max_length=8)
    logo_key: str | None = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    gstin: str | None = None
    address: str | None = None
    timezone: str
    currency: str
    logo_url: str | None = None


def _company_out(company: Company) -> CompanyOut:
    out = CompanyOut.model_validate(company)
    out.logo_url = get_storage().url_for(company.logo_key)
    return out


async def _create_signup_company(session: AsyncSession) -> Company:
    """A brand-new company for every signup — never shared, never looked up by
    name (S3: a shared placeholder company pooled unrelated builders)."""
    company = Company(name=DEFAULT_COMPANY_NAME)
    session.add(company)
    await session.flush()
    return company


async def verify_otp_with_lockout(key: str, phone: str, otp: str) -> None:
    """``assert_otp_valid`` behind a per-``key`` lockout: after
    RATE_LIMIT_LOGIN_FAILURES wrong codes in the window, every try is 429."""
    await ratelimit.assert_not_locked(key, settings.rate_limit_login_failures)
    try:
        assert_otp_valid(phone, otp)
    except AppError as exc:
        if exc.code == "invalid_otp":
            await ratelimit.record_failure(key)
        raise


@router.post("/request-otp", response_model=RequestOtpOut)
async def request_otp(body: RequestOtpIn, request: Request) -> RequestOtpOut:
    """Request a login code. No-op until an SMS provider is wired (dev OTP
    stays 000000 while DEV_OTP_ENABLED). Always returns sent=true so the UI flow
    is identical in dev and prod, and powers re-OTP ("resend code") recovery."""
    await ratelimit.hit(f"otp:ip:{ratelimit.client_ip(request)}", settings.rate_limit_otp_per_ip)
    await ratelimit.hit(
        f"otp:phone:{normalize_phone(body.phone)}", settings.rate_limit_otp_per_phone
    )
    return RequestOtpOut(dev_otp=dev_otp_hint())


@router.post("/login", response_model=TokenOut)
async def login(
    body: LoginIn, request: Request, session: AsyncSession = Depends(get_session)
) -> TokenOut:
    await ratelimit.hit(
        f"login:ip:{ratelimit.client_ip(request)}", settings.rate_limit_login_per_ip
    )
    await verify_otp_with_lockout(
        f"login:fail:{normalize_phone(body.phone)}", body.phone, body.otp
    )

    # Tolerant lookup: match the existing user across equivalent phone forms
    # (+919800000001 / 919800000001 / 9800000001 / 0…), so a returning owner who
    # types their number in a slightly different format is NOT treated as new and
    # dumped into the first-run "create your company" flow. .first() is defensive
    # against a pre-existing duplicate (raw + canonical) row.
    user = (
        await session.execute(
            select(User).where(User.phone.in_(phone_candidates(body.phone)))
        )
    ).scalars().first()
    if user is None:
        invite = await pending_invite_for_phone(session, body.phone)
        if invite is not None:
            # An invited number signs straight in to the inviting company with
            # the invited role — no empty company first, no link needed.
            user = User(
                company_id=invite.company_id,
                phone=normalize_phone(body.phone),
                role=invite.role,
                name=invite.name,
            )
            session.add(user)
            await session.flush()
            invite.status = InviteStatus.accepted
            invite.accepted_user_id = user.id
            invite.accepted_at = datetime.now(UTC)
        elif not body.signup:
            raise AppError(
                404,
                "not_registered",
                "This number isn't registered. Ask your company for an invite, "
                "or sign up on the web.",
            )
        else:
            company = await _create_signup_company(session)
            user = User(
                company_id=company.id,
                phone=normalize_phone(body.phone),  # store canonical E.164 going forward
                role=UserRole.owner,
            )
            session.add(user)
            await session.flush()
    elif not user.is_active:
        # A deactivated member can't get a fresh token (W4.3).
        raise AppError(403, "deactivated", "This account has been deactivated")
    await session.commit()

    token = create_access_token(str(user.id), user.role.value)
    return TokenOut(token=token)


@router.post("/logout", status_code=204)
async def logout(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> None:
    """End the presented access token on the server (sign-out). Idempotent:
    an already-revoked token, or a pre-jti token with nothing to revoke, is a
    no-op. Expired revocations are purged here, so the table stays small."""
    if creds is None:
        raise AppError(401, "not_authenticated", "Missing bearer token")
    try:
        payload = decode_token(creds.credentials)
    except Exception as exc:
        raise AppError(401, "invalid_token", "Invalid or expired token") from exc
    jti = payload.get("jti")
    if jti is None or payload.get("scope") == STEP_UP_SCOPE:
        return
    now = datetime.now(UTC)
    await session.execute(
        pg_insert(RevokedToken)
        .values(jti=jti, expires_at=datetime.fromtimestamp(payload["exp"], UTC))
        .on_conflict_do_nothing(index_elements=["jti"])
    )
    await session.execute(delete(RevokedToken).where(RevokedToken.expires_at < now))
    await session.commit()


# --- step-up (re-verify for sensitive/irreversible actions) -----------------


class StepUpVerifyIn(BaseModel):
    otp: str


class StepUpTokenOut(BaseModel):
    step_up_token: str
    expires_in: int  # seconds the token is valid for


@router.post("/step-up/request-otp", response_model=RequestOtpOut)
async def step_up_request_otp(user: User = Depends(get_current_user)) -> RequestOtpOut:
    """Send a re-verification code to the current user (no-op in dev; OTP stays
    000000). Mirrors login's request-otp so the web step-up flow is identical."""
    await ratelimit.hit(f"stepup:otp:{user.id}", settings.rate_limit_otp_per_phone)
    return RequestOtpOut(dev_otp=dev_otp_hint())


@router.post("/step-up/verify", response_model=StepUpTokenOut)
async def step_up_verify(
    body: StepUpVerifyIn, user: User = Depends(get_current_user)
) -> StepUpTokenOut:
    """Exchange a fresh OTP for a short-lived step-up token (for the current
    user) that unlocks one sensitive-action window (e.g. a Tally export)."""
    await verify_otp_with_lockout(f"stepup:fail:{user.id}", user.phone, body.otp)
    return StepUpTokenOut(
        step_up_token=create_step_up_token(str(user.id)),
        expires_in=settings.step_up_expire_minutes * 60,
    )


def _me_out(user: User, company_name: str | None = None) -> MeOut:
    return MeOut(
        id=user.id,
        company_id=user.company_id,
        company_name=company_name,
        name=user.name,
        phone=user.phone,
        role=user.role,
        language=user.language,
    )


async def _me_out_with_company(session: AsyncSession, user: User) -> MeOut:
    """`_me_out` enriched with the company name (one cheap PK fetch)."""
    company = await session.get(Company, user.company_id)
    return _me_out(user, company_name=company.name if company else None)


@router.get("/me", response_model=MeOut)
async def me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    return await _me_out_with_company(session, user)


@router.get("/me/landing", response_model=LandingOut)
async def my_landing(user: User = Depends(get_current_user)) -> LandingOut:
    """Where this role's first-run should land (the IA 'where do I land' map)."""
    return LandingOut(role=user.role, landing=landing_for(user.role))


@router.get("/company", response_model=CompanyOut)
async def get_company(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CompanyOut:
    """The caller's company (id + name). Any signed-in member may read it; the
    Setup & Administration control plane prefills its Company Profile form from
    here (the rename PATCH below is the owner-only write side)."""
    company = await session.get(Company, user.company_id)
    if company is None:
        raise AppError(404, "not_found", "Company not found")
    return _company_out(company)


@router.patch("/company", response_model=CompanyOut)
async def update_company(
    body: CompanyUpdateIn,
    owner: User = Depends(require_role(UserRole.owner)),
    session: AsyncSession = Depends(get_session),
) -> CompanyOut:
    """Update the caller's company profile (name + GST / address / timezone /
    currency). Owner-only; partial — only provided fields change. Still serves
    the owner first-run rename (which sends just `name`)."""
    company = await session.get(Company, owner.company_id)
    if company is None:
        raise AppError(404, "not_found", "Company not found")
    data = body.model_dump(exclude_unset=True)
    # Tenant isolation: a logo_key may only point at THIS company's branding
    # path (the presign endpoint always mints keys under that prefix). null
    # clears the logo. This stops an owner pointing logo_url at another
    # company's object.
    logo_key = data.get("logo_key")
    if logo_key is not None and not logo_key.startswith(f"branding/{owner.company_id}/"):
        raise AppError(422, "bad_logo_key", "logo_key must be under your company's branding path")
    for field, value in data.items():
        setattr(company, field, value)
    await session.commit()
    await session.refresh(company)
    return _company_out(company)


_LOGO_EXT = {"image/png": "png", "image/jpeg": "jpg"}


class LogoPresignIn(BaseModel):
    content_type: str


class LogoPresignOut(BaseModel):
    key: str
    put_url: str | None
    upload_mode: str  # "presigned" | "unavailable"


@router.post("/company/logo/presign", response_model=LogoPresignOut)
async def presign_company_logo(
    body: LogoPresignIn,
    owner: User = Depends(require_role(UserRole.owner)),
) -> LogoPresignOut:
    """Direct-to-R2 upload ticket for the company logo (owner-only). Local/dev
    storage has no presigned PUT (NotImplementedError) → upload_mode=unavailable;
    the UI shows an honest note (there is no multipart fallback for the logo)."""
    ext = _LOGO_EXT.get(body.content_type)
    if ext is None:
        raise AppError(422, "bad_type", "Logo must be a PNG or JPEG image")
    key = f"branding/{owner.company_id}/logo-{uuid4().hex}.{ext}"
    put_url: str | None = None
    try:
        ticket = get_storage().presigned_put(key, body.content_type)
        put_url = ticket["url"]
    except NotImplementedError:
        put_url = None
    return LogoPresignOut(
        key=key, put_url=put_url, upload_mode="presigned" if put_url else "unavailable"
    )


# PATCH /api/v1/users/me — profile + UI language. The web i18n layer
# (web/src/i18n) already fire-and-forgets the language here on every switch;
# this is the endpoint it was waiting for. Lives on the auth router (closest
# owner of the User identity) and is exposed under the /users/me path the client
# expects via an explicit route prefix override.
users_router = APIRouter(prefix="/api/v1/users", tags=["auth"])


@users_router.patch("/me", response_model=MeOut)
async def update_me(
    body: MeUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        user.name = data["name"]
    if "language" in data and data["language"] is not None:
        if data["language"] not in SUPPORTED_LANGUAGES:
            raise AppError(422, "unsupported_language", "Unsupported language")
        user.language = data["language"]
    await session.commit()
    await session.refresh(user)
    return await _me_out_with_company(session, user)


@users_router.delete("/me", status_code=204)
async def delete_own_account(
    user: User = Depends(require_step_up),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Self-service account deletion (App Store / Play Store compliance).

    Anonymizes name/phone and deactivates the row rather than hard-deleting
    it: ~40 FKs from `users.id` are attribution columns on shared project
    history (decisions, audits, payments, photos) that the rest of the
    project team still relies on. A hard delete would SET NULL across all
    of them, making every deleted user's historical contributions
    indistinguishable from one another; anonymizing in place preserves
    per-row provenance while removing the person's identity. Deletion is
    unconditionally sensitive, so — unlike `update_me` — this always
    requires a fresh step-up token; there is no non-sensitive path.
    """
    original_phone = user.phone
    original_name = user.name
    user.name = "Deleted user"
    user.phone = f"deleted:{user.id}"
    user.is_active = False
    user.deleted_at = datetime.now(UTC)
    # HomeownerMember keeps its OWN denormalized phone/display_name (shown to
    # the rest of the household via the roster endpoint) — scrub those too, or
    # the caller's real phone/name would survive the users-row scrub above and
    # stay visible to their household. A user can belong to more than one
    # property (no unique constraint on user_id), so this clears every
    # membership row, not just one. display_name=None is the right value, not
    # just "blank": the model's own comment says it falls back to
    # User.name/phone when null, so this naturally falls back to the
    # already-scrubbed "Deleted user". phone=None is safe: that field is
    # "informational only; matching is by join_code" (see HomeownerMember.phone).
    await session.execute(
        update(HomeownerMember)
        .where(HomeownerMember.user_id == user.id)
        .values(phone=None, display_name=None)
    )
    # S6: stop every push to this person's devices (the contractor token table
    # and the homeowner notif_prefs path)...
    await _forget_push_tokens(session, user.id)
    # ...and scrub the name/phone snapshotted onto what they authored. Chat
    # messages resolve the sender from the users row (already scrubbed); the
    # raw capture/WhatsApp rows and photo comments keep their own copy. A
    # WhatsApp row's sender_id is the phone's JID, so that goes too.
    sender_ids = {str(user.id)} | {
        f"{c}@s.whatsapp.net" for c in phone_candidates(original_phone) if c.isdigit()
    }
    await session.execute(
        update(RawMessageModel)
        .where(RawMessageModel.sender_id.in_(sender_ids))
        .values(sender_name="Deleted user", sender_id=str(user.id))
    )
    await _scrub_sent_content(session, str(user.id), original_name, original_phone)
    member_ids = select(HomeownerMember.id).where(HomeownerMember.user_id == user.id)
    await session.execute(
        update(PhotoComment)
        .where(PhotoComment.member_id.in_(member_ids))
        .values(author_name="Deleted user")
    )
    await session.commit()


async def _scrub_sent_content(
    session: AsyncSession, sender_id: str, name: str | None, phone: str
) -> None:
    """Replace the person's full name and phone with "Deleted user" inside
    what they sent: the raw payload JSON (WhatsApp pushName/notifyName and any
    text) and the summary/fields of every event extracted from those
    messages. Other senders' rows are left alone."""
    patterns = identity_patterns(name, phone)
    raws = (
        await session.execute(
            select(RawMessageModel).where(RawMessageModel.sender_id == sender_id)
        )
    ).scalars().all()
    for raw in raws:
        scrubbed = scrub_json(raw.raw or {}, patterns, sender=True)
        if scrubbed != raw.raw:
            raw.raw = scrubbed
    raw_ids = [r.id for r in raws]
    if not raw_ids or not patterns:
        return
    events = (
        await session.execute(
            select(SiteEventModel).where(SiteEventModel.source_message_ids.overlap(raw_ids))
        )
    ).scalars().all()
    for ev in events:
        summary = scrub_text(ev.summary, patterns)
        if summary != ev.summary:
            ev.summary = summary
        fields = scrub_json(ev.fields or {}, patterns)
        if fields != ev.fields:
            ev.fields = fields


# POST /api/v1/me/push-token — register THIS device's Expo push token (C-F).
# Contractors are plain users rows with no homeowner_member, so they had nowhere
# to store a token; this upserts it into push_tokens. Authenticated; idempotent
# (re-registering the same token just bumps updated_at). The homeowner path still
# uses notif_prefs and is untouched — homeowners may use either harmlessly.
me_router = APIRouter(prefix="/api/v1/me", tags=["auth"])


class PushTokenIn(BaseModel):
    token: str = Field(min_length=1)
    platform: Literal["ios", "android", "web"] | None = None


class PushTokenOut(BaseModel):
    ok: bool = True


@me_router.post("/push-token", response_model=PushTokenOut)
async def register_push_token(
    body: PushTokenIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PushTokenOut:
    existing = (
        await session.execute(
            select(PushToken).where(
                PushToken.user_id == user.id, PushToken.token == body.token
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            PushToken(user_id=user.id, token=body.token, platform=body.platform)
        )
    elif body.platform is not None:
        existing.platform = body.platform
    await session.commit()
    return PushTokenOut()


class PushTokenDeleteIn(BaseModel):
    token: str = Field(min_length=1)


# DELETE /api/v1/me/push-token — sign-out / account switch: stop pushing to
# THIS device for the caller. Removes the caller's push_tokens row for the token
# and the same token from any of their homeowner memberships' notif_prefs (the
# homeowner path the sender also reads). Idempotent: an unknown token is a no-op.
@me_router.delete("/push-token", response_model=PushTokenOut)
async def unregister_push_token(
    body: PushTokenDeleteIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PushTokenOut:
    await _forget_push_tokens(session, user.id, body.token)
    await session.commit()
    return PushTokenOut()


async def _forget_push_tokens(
    session: AsyncSession, user_id: UUID, token: str | None = None
) -> None:
    """Remove ``token`` (or, with None, every token) of ``user_id`` from both
    push paths: the push_tokens rows and their homeowner memberships'
    notif_prefs. The caller commits."""
    stmt = delete(PushToken).where(PushToken.user_id == user_id)
    if token is not None:
        stmt = stmt.where(PushToken.token == token)
    await session.execute(stmt)
    members = (
        await session.execute(
            select(HomeownerMember).where(HomeownerMember.user_id == user_id)
        )
    ).scalars().all()
    for m in members:
        prefs = m.notif_prefs or {}
        if "push_token" in prefs and (token is None or prefs.get("push_token") == token):
            # Reassign (not mutate in place) so the JSONB change is tracked.
            m.notif_prefs = {k: v for k, v in prefs.items() if k != "push_token"}
