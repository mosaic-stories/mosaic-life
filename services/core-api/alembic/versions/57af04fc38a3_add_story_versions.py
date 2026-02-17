"""add_story_versions

Revision ID: 57af04fc38a3
Revises: f7a1_memory
Create Date: 2026-02-16 03:06:20.498658

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


# revision identifiers, used by Alembic.
revision = "57af04fc38a3"
down_revision = "f7a1_memory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create story_versions table
    op.create_table(
        "story_versions",
        sa.Column(
            "id",
            PG_UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "story_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("stories.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="inactive"),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=True),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column(
            "stale", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "created_by",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
    )

    # Unique constraint: one version number per story
    op.create_unique_constraint(
        "uq_story_versions_story_id_version_number",
        "story_versions",
        ["story_id", "version_number"],
    )

    # Partial unique index: at most one active version per story
    op.execute(
        "CREATE UNIQUE INDEX uq_story_versions_one_active "
        "ON story_versions (story_id) WHERE status = 'active'"
    )

    # Partial unique index: at most one draft per story
    op.execute(
        "CREATE UNIQUE INDEX uq_story_versions_one_draft "
        "ON story_versions (story_id) WHERE status = 'draft'"
    )

    # 2. Add active_version_id to stories (nullable initially)
    op.add_column(
        "stories",
        sa.Column("active_version_id", PG_UUID(as_uuid=True), nullable=True),
    )

    # 3. Backfill: create v1 for every existing story
    op.execute(
        """
        INSERT INTO story_versions (id, story_id, version_number, title, content, status, source, change_summary, stale, created_by, created_at)
        SELECT
            gen_random_uuid(),
            s.id,
            1,
            s.title,
            s.content,
            'active',
            'manual_edit',
            'Initial version',
            false,
            s.author_id,
            s.created_at
        FROM stories s
        """
    )

    # 4. Set active_version_id for all backfilled rows
    op.execute(
        """
        UPDATE stories s
        SET active_version_id = sv.id
        FROM story_versions sv
        WHERE sv.story_id = s.id AND sv.status = 'active'
        """
    )

    # 5. Add FK constraint on active_version_id (after backfill)
    op.create_foreign_key(
        "fk_stories_active_version_id",
        "stories",
        "story_versions",
        ["active_version_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_stories_active_version_id", "stories", type_="foreignkey")
    op.drop_column("stories", "active_version_id")
    op.drop_table("story_versions")
