"""Agent audit — agent_turns (Phase 2.1)

One row per @nivaan turn: utterance, actor, tool, terminal result kind, model,
token cost. The accountability trail + per-feature ROI ledger.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-06 01:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_turns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("utterance", sa.Text(), nullable=False),
        sa.Column(
            "result_kind",
            postgresql.ENUM("answer", "clarify", "cards", name="agent_result_kind"),
            nullable=False,
        ),
        sa.Column("tool", sa.String(), server_default="none", nullable=False),
        sa.Column("model", sa.String(), server_default="deterministic", nullable=False),
        sa.Column("token_cost", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("agent_turns")
    postgresql.ENUM(name="agent_result_kind").drop(op.get_bind(), checkfirst=True)
