"""add response conversion and moderation columns

Revision ID: b0a29ab45f6d
Revises: 419b383433da
Create Date: 2026-07-10 00:38:21.213903

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b0a29ab45f6d"
down_revision = "419b383433da"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "story_responses",
        sa.Column("converted_story_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "story_responses",
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "story_responses",
        sa.Column("hidden_by_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "story_responses",
        sa.Column("offer_dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_foreign_key(
        "fk_story_responses_converted_story_id_stories",
        "story_responses",
        "stories",
        ["converted_story_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_story_responses_hidden_by_id_users",
        "story_responses",
        "users",
        ["hidden_by_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        op.f("ix_story_responses_converted_story_id"),
        "story_responses",
        ["converted_story_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_story_responses_converted_story_id"), table_name="story_responses"
    )
    op.drop_constraint(
        "fk_story_responses_hidden_by_id_users",
        "story_responses",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_story_responses_converted_story_id_stories",
        "story_responses",
        type_="foreignkey",
    )
    op.drop_column("story_responses", "offer_dismissed_at")
    op.drop_column("story_responses", "hidden_by_id")
    op.drop_column("story_responses", "hidden_at")
    op.drop_column("story_responses", "converted_story_id")
