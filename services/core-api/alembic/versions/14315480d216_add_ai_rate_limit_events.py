"""add ai_rate_limit_events

Revision ID: 14315480d216
Revises: 2107c02a3f1b
Create Date: 2026-08-12 14:21:01.183717

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "14315480d216"
down_revision = "2107c02a3f1b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_rate_limit_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("bucket", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_rate_limit_events_user_bucket_created",
        "ai_rate_limit_events",
        ["user_id", "bucket", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_rate_limit_events_user_id"),
        "ai_rate_limit_events",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_rate_limit_events_user_id"), table_name="ai_rate_limit_events"
    )
    op.drop_index(
        "ix_ai_rate_limit_events_user_bucket_created", table_name="ai_rate_limit_events"
    )
    op.drop_table("ai_rate_limit_events")
