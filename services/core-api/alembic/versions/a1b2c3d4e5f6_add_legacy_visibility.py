"""add legacy visibility

Revision ID: a1b2c3d4e5f6
Revises: 560bebc328ed
Create Date: 2025-11-30 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "560bebc328ed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add visibility column with default 'private' for new legacies
    op.add_column(
        "legacies",
        sa.Column(
            "visibility",
            sa.String(length=20),
            server_default="private",
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_legacies_visibility"), "legacies", ["visibility"], unique=False
    )

    # Set all existing legacies to 'public' to preserve current behavior
    op.execute("UPDATE legacies SET visibility = 'public'")


def downgrade() -> None:
    op.drop_index(op.f("ix_legacies_visibility"), table_name="legacies")
    op.drop_column("legacies", "visibility")
