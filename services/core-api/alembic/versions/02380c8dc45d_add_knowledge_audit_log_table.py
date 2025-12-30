"""add_knowledge_audit_log_table

Revision ID: 02380c8dc45d
Revises: cbbf93b19ed0
Create Date: 2025-12-30 20:47:14.274043

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = '02380c8dc45d'
down_revision = 'cbbf93b19ed0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_audit_log",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("story_id", sa.UUID(), nullable=True),  # NULL if story deleted
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("chunk_count", sa.Integer(), nullable=True),
        sa.Column("details", JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_knowledge_audit_log_legacy_id", "knowledge_audit_log", ["legacy_id"])
    op.create_index("ix_knowledge_audit_log_created_at", "knowledge_audit_log", ["created_at"])
    op.create_index("ix_knowledge_audit_log_story_id", "knowledge_audit_log", ["story_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_audit_log_story_id", table_name="knowledge_audit_log")
    op.drop_index("ix_knowledge_audit_log_created_at", table_name="knowledge_audit_log")
    op.drop_index("ix_knowledge_audit_log_legacy_id", table_name="knowledge_audit_log")
    op.drop_table("knowledge_audit_log")
