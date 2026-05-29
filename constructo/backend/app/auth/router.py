"""Auth routes: OTP-stub login and current-user lookup."""
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.common.errors import AppError
from app.db import get_session
from app.models import Company, User, UserRole

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Placeholder OTP accepted during Wave 0 (no SMS provider wired yet).
STUB_OTP = "000000"
DEFAULT_COMPANY_NAME = "Default Company"


class LoginIn(BaseModel):
    phone: str
    otp: str


class TokenOut(BaseModel):
    token: str


class MeOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str | None
    phone: str
    role: UserRole


async def _get_or_create_default_company(session: AsyncSession) -> Company:
    company = (
        await session.execute(select(Company).where(Company.name == DEFAULT_COMPANY_NAME))
    ).scalar_one_or_none()
    if company is None:
        company = Company(name=DEFAULT_COMPANY_NAME)
        session.add(company)
        await session.flush()
    return company


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, session: AsyncSession = Depends(get_session)) -> TokenOut:
    if body.otp != STUB_OTP:
        raise AppError(401, "invalid_otp", "Invalid OTP")

    user = (
        await session.execute(select(User).where(User.phone == body.phone))
    ).scalar_one_or_none()
    if user is None:
        company = await _get_or_create_default_company(session)
        user = User(company_id=company.id, phone=body.phone, role=UserRole.owner)
        session.add(user)
        await session.flush()
    await session.commit()

    token = create_access_token(str(user.id), user.role.value)
    return TokenOut(token=token)


@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(get_current_user)) -> MeOut:
    return MeOut(
        id=user.id,
        company_id=user.company_id,
        name=user.name,
        phone=user.phone,
        role=user.role,
    )
