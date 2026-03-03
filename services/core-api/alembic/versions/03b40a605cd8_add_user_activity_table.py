"""add user_activity table

Revision ID: 03b40a605cd8
Revises: c2e17738da2d
Create Date: 2026-03-02 18:31:59.550733

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "03b40a605cd8"
down_revision = "c2e17738da2d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_activity",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_activity_action"), "user_activity", ["action"], unique=False
    )
    op.create_index(
        op.f("ix_user_activity_entity_type"),
        "user_activity",
        ["entity_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_activity_user_id"), "user_activity", ["user_id"], unique=False
    )
    op.create_index(
        "ix_user_activity_feed",
        "user_activity",
        ["user_id", sa.text("created_at DESC")],
        unique=False,
    )
    op.create_index(
        "ix_user_activity_dedup",
        "user_activity",
        ["user_id", "entity_type", "entity_id", sa.text("created_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_user_activity_dedup", table_name="user_activity")
    op.drop_index("ix_user_activity_feed", table_name="user_activity")
    op.drop_index(op.f("ix_user_activity_user_id"), table_name="user_activity")
    op.drop_index(op.f("ix_user_activity_entity_type"), table_name="user_activity")
    op.drop_index(op.f("ix_user_activity_action"), table_name="user_activity")
    op.drop_table("user_activity")
