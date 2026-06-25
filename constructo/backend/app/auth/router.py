"""Auth routes: OTP-stub login, current-user lookup, profile + language update.

Phone+OTP only (no passwords). The dev OTP stays "000000" until an SMS provider
is wired. Sending an OTP is a polite no-op endpoint today so the web login can
present a real "request code -> enter code" flow (and re-OTP recovery) without
branching on whether SMS exists yet.
"""
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.auth.jwt import create_access_token, create_step_up_token
from app.auth.landing import landing_for
from app.auth.otp import assert_otp_valid, dev_otp_hint
from app.auth.phone import normalize_phone, phone_candidates
from app.common.errors import AppError
from app.config import settings
from app.db import get_session
from app.models import Company, PushToken, User, UserRole
from app.storage import get_storage

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

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


async def _get_or_create_default_company(session: AsyncSession) -> Company:
    company = (
        await session.execute(select(Company).where(Company.name == DEFAULT_COMPANY_NAME))
    ).scalar_one_or_none()
    if company is None:
        company = Company(name=DEFAULT_COMPANY_NAME)
        session.add(company)
        await session.flush()
    return company


@router.post("/request-otp", response_model=RequestOtpOut)
async def request_otp(body: RequestOtpIn) -> RequestOtpOut:
    """Request a login code. No-op until an SMS provider is wired (dev OTP
    stays 000000 while DEV_OTP_ENABLED). Always returns sent=true so the UI flow
    is identical in dev and prod, and powers re-OTP ("resend code") recovery."""
    return RequestOtpOut(dev_otp=dev_otp_hint())


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, session: AsyncSession = Depends(get_session)) -> TokenOut:
    assert_otp_valid(body.phone, body.otp)

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
        company = await _get_or_create_default_company(session)
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
    return RequestOtpOut(dev_otp=dev_otp_hint())


@router.post("/step-up/verify", response_model=StepUpTokenOut)
async def step_up_verify(
    body: StepUpVerifyIn, user: User = Depends(get_current_user)
) -> StepUpTokenOut:
    """Exchange a fresh OTP for a short-lived step-up token (for the current
    user) that unlocks one sensitive-action window (e.g. a Tally export)."""
    assert_otp_valid(user.phone, body.otp)
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
