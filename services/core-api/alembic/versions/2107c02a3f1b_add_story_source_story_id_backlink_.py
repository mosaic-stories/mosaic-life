"""add story source_story_id backlink column

Revision ID: 2107c02a3f1b
Revises: b0a29ab45f6d
Create Date: 2026-07-10 00:38:24.907324

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2107c02a3f1b"
down_revision = "b0a29ab45f6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stories",
        sa.Column("source_story_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_stories_source_story_id_stories",
        "stories",
        "stories",
        ["source_story_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_stories_source_story_id"),
        "stories",
        ["source_story_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_stories_source_story_id"), table_name="stories")
    op.drop_constraint(
        "fk_stories_source_story_id_stories",
        "stories",
        type_="foreignkey",
    )
    op.drop_column("stories", "source_story_id")
