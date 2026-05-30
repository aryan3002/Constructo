from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UserRole(StrEnum):
    owner = "owner"
    pm = "pm"
    supervisor = "supervisor"
    accountant = "accountant"
    procurement = "procurement"
    labor_contractor = "labor_contractor"
    # Homeowner-facing app role (H0). Branches the mobile nav to the Daylight
    # theme; never granted company-wide site visibility (scoped via
    # homeowner_members instead).
    homeowner = "homeowner"


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), nullable=False, default=UserRole.owner
    )
    # Phase B i18n: preferred UI/notification language (BCP-47-ish short code,
    # e.g. "en" | "hi"). Nullable with an "en" default so existing rows keep
    # working; not part of the frozen contracts.
    language: Mapped[str | None] = mapped_column(String, nullable=True, server_default="en")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
