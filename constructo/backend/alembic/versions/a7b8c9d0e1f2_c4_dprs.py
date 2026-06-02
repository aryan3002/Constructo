"""C4 PM Auto-DPR — dprs table

Adds ``dprs`` (daily progress report): one auto-drafted report per site+date.
``site_id`` FK CASCADEs. ``sections`` (JSONB) holds the structured + prose
sections; ``status`` is a ``dpr_status`` enum (draft|sent) that only ever flips
draft→sent on an explicit human Send (CA1 — never auto-sent); ``sent_at`` is
stamped at that moment. ``evidence_event_ids`` (JSONB) anchors the draft to the
real ``site_events`` it was built from.

Revision ID: a7b8c9d0e1f2
Revises: e4f5a6b7c8d9
Create Date: 2026-06-01 00:00:10.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    dpr_status = pg.ENUM("draft", "sent", name="dpr_status", create_type=False)
    dpr_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "dprs",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column(
            "sections",
            pg.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "status",
            dpr_status,
            server_default="draft",
            nullable=False,
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "evidence_event_ids",
            pg.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dprs_site_id", "dprs", ["site_id"], unique=False)
    op.create_index(
        "ix_dprs_site_date", "dprs", ["site_id", "report_date"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_dprs_site_date", table_name="dprs")
    op.drop_index("ix_dprs_site_id", table_name="dprs")
    op.drop_table("dprs")
    pg.ENUM(name="dpr_status").drop(op.get_bind(), checkfirst=True)
