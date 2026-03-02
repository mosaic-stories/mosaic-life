"""add_user_favorites_table_and_favorite_counts

Revision ID: c2e17738da2d
Revises: c1d2e3f4a5b6
Create Date: 2026-03-02 14:23:42.741495

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c2e17738da2d"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_favorites table
    op.create_table(
        "user_favorites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "entity_type", "entity_id", name="uq_user_favorite"
        ),
    )
    op.create_index(
        op.f("ix_user_favorites_entity_id"),
        "user_favorites",
        ["entity_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_favorites_entity_type"),
        "user_favorites",
        ["entity_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_favorites_user_id"), "user_favorites", ["user_id"], unique=False
    )

    # Add favorite_count to legacies
    op.add_column(
        "legacies",
        sa.Column("favorite_count", sa.Integer(), server_default="0", nullable=False),
    )

    # Add favorite_count to media
    op.add_column(
        "media",
        sa.Column("favorite_count", sa.Integer(), server_default="0", nullable=False),
    )

    # Add favorite_count to stories
    op.add_column(
        "stories",
        sa.Column("favorite_count", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("stories", "favorite_count")
    op.drop_column("media", "favorite_count")
    op.drop_column("legacies", "favorite_count")
    op.drop_index(op.f("ix_user_favorites_user_id"), table_name="user_favorites")
    op.drop_index(op.f("ix_user_favorites_entity_type"), table_name="user_favorites")
    op.drop_index(op.f("ix_user_favorites_entity_id"), table_name="user_favorites")
    op.drop_table("user_favorites")
