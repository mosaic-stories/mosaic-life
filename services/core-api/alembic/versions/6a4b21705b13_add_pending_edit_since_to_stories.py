"""add pending_edit_since to stories

Revision ID: 6a4b21705b13
Revises: 14315480d216
Create Date: 2026-08-14 09:16:17.150171

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "6a4b21705b13"
down_revision = "14315480d216"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stories",
        sa.Column("pending_edit_since", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stories", "pending_edit_since")
