"""add_story_reactions_table_and_reaction_counts

Revision ID: 8402872b3670
Revises: e31adcaadd15
Create Date: 2026-07-09 10:30:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "8402872b3670"
down_revision = "e31adcaadd15"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create story_reactions table
    op.create_table(
        "story_reactions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("story_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("reaction_type", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "story_id", "user_id", "reaction_type", name="uq_story_reaction"
        ),
    )
    op.create_index(
        op.f("ix_story_reactions_story_id"),
        "story_reactions",
        ["story_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_story_reactions_user_id"), "story_reactions", ["user_id"], unique=False
    )

    # Add reaction_*_count columns to stories
    op.add_column(
        "stories",
        sa.Column(
            "reaction_heart_count", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "stories",
        sa.Column(
            "reaction_candle_count", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "stories",
        sa.Column(
            "reaction_smile_count", sa.Integer(), server_default="0", nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_column("stories", "reaction_smile_count")
    op.drop_column("stories", "reaction_candle_count")
    op.drop_column("stories", "reaction_heart_count")
    op.drop_index(op.f("ix_story_reactions_user_id"), table_name="story_reactions")
    op.drop_index(op.f("ix_story_reactions_story_id"), table_name="story_reactions")
    op.drop_table("story_reactions")
