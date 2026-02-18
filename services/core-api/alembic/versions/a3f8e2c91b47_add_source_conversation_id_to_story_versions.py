"""add_source_conversation_id_to_story_versions

Revision ID: a3f8e2c91b47
Revises: 57af04fc38a3
Create Date: 2026-02-17 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a3f8e2c91b47"
down_revision = "57af04fc38a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "story_versions",
        sa.Column(
            "source_conversation_id",
            sa.Uuid(),
            sa.ForeignKey("ai_conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_story_versions_source_conversation_id",
        "story_versions",
        ["source_conversation_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_story_versions_source_conversation_id", table_name="story_versions"
    )
    op.drop_column("story_versions", "source_conversation_id")
