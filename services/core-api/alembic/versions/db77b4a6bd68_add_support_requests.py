"""add_support_requests

Revision ID: db77b4a6bd68
Revises: e26ab9a1bd95
Create Date: 2025-12-14 17:20:42.406231

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "db77b4a6bd68"
down_revision = "e26ab9a1bd95"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create support_requests table
    op.create_table(
        "support_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("subject", sa.String(length=100), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_support_requests_category"),
        "support_requests",
        ["category"],
        unique=False,
    )
    op.create_index(
        op.f("ix_support_requests_status"), "support_requests", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_support_requests_user_id"),
        "support_requests",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop support_requests table
    op.drop_index(op.f("ix_support_requests_user_id"), table_name="support_requests")
    op.drop_index(op.f("ix_support_requests_status"), table_name="support_requests")
    op.drop_index(op.f("ix_support_requests_category"), table_name="support_requests")
    op.drop_table("support_requests")
