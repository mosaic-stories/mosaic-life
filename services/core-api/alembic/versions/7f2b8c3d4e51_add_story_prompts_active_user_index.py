"""add story_prompts active user index

Revision ID: 7f2b8c3d4e51
Revises: 19807f99ca01
Create Date: 2026-03-09 00:30:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "7f2b8c3d4e51"
down_revision = "19807f99ca01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_story_prompts_active_user",
        "story_prompts",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_story_prompts_active_user", table_name="story_prompts")
