"""add_invite_prompt_dismissed_at_to_legacies

Revision ID: 419b383433da
Revises: 8402872b3670
Create Date: 2026-07-09 10:45:05.673736

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "419b383433da"
down_revision = "8402872b3670"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "legacies",
        sa.Column(
            "invite_prompt_dismissed_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("legacies", "invite_prompt_dismissed_at")
