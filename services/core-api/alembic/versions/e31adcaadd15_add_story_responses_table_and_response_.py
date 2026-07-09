"""add_story_responses_table_and_response_count

Revision ID: e31adcaadd15
Revises: e8c9f1a2b3d4
Create Date: 2026-07-09 09:54:55.511328

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e31adcaadd15"
down_revision = "e8c9f1a2b3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create story_responses table
    op.create_table(
        "story_responses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("story_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_story_responses_story_id"),
        "story_responses",
        ["story_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_story_responses_user_id"), "story_responses", ["user_id"], unique=False
    )

    # Add response_count to stories
    op.add_column(
        "stories",
        sa.Column("response_count", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("stories", "response_count")
    op.drop_index(op.f("ix_story_responses_user_id"), table_name="story_responses")
    op.drop_index(op.f("ix_story_responses_story_id"), table_name="story_responses")
    op.drop_table("story_responses")
