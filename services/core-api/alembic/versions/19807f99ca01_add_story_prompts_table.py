"""add story_prompts table

Revision ID: 19807f99ca01
Revises: 4e7f2a9c8b13
Create Date: 2026-03-08 23:46:47.002572

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "19807f99ca01"
down_revision = "4e7f2a9c8b13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_prompts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.String(length=64), nullable=True),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default="active", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("acted_on_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("story_id", sa.UUID(), nullable=True),
        sa.Column("conversation_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_story_prompts_legacy_id"), "story_prompts", ["legacy_id"], unique=False
    )
    op.create_index(
        op.f("ix_story_prompts_status"), "story_prompts", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_story_prompts_user_id"), "story_prompts", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_story_prompts_user_id"), table_name="story_prompts")
    op.drop_index(op.f("ix_story_prompts_status"), table_name="story_prompts")
    op.drop_index(op.f("ix_story_prompts_legacy_id"), table_name="story_prompts")
    op.drop_table("story_prompts")
