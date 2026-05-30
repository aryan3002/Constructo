"""phaseB: invites table

Revision ID: cd10db24e039
Revises: b9b464b07c0b
Create Date: 2026-05-29 17:44:41.306073

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cd10db24e039"
down_revision: str | None = "b9b464b07c0b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Reuse the existing user_role enum (created in 0001) — must NOT recreate it.
user_role = postgresql.ENUM(
    "owner",
    "pm",
    "supervisor",
    "accountant",
    "procurement",
    "labor_contractor",
    name="user_role",
    create_type=False,
)
# New enum for this table; created/dropped explicitly below.
invite_status = postgresql.ENUM(
    "pending", "accepted", "revoked", name="invite_status", create_type=False
)


def upgrade() -> None:
    invite_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("status", invite_status, nullable=False),
        sa.Column(
            "accepted_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token"),
    )


def downgrade() -> None:
    op.drop_table("invites")
    invite_status.drop(op.get_bind(), checkfirst=True)
