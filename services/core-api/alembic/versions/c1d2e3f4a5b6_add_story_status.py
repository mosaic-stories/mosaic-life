"""add_story_status

Revision ID: c1d2e3f4a5b6
Revises: a8797dc9de71
Create Date: 2026-03-01 22:40:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c1d2e3f4a5b6"
down_revision = "a8797dc9de71"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add status column to stories table with default 'published'
    op.add_column(
        "stories",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="published",
        ),
    )
    # Create index on status column
    op.create_index(op.f("ix_stories_status"), "stories", ["status"], unique=False)


def downgrade() -> None:
    # Remove index and column
    op.drop_index(op.f("ix_stories_status"), table_name="stories")
    op.drop_column("stories", "status")
