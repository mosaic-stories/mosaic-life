"""add_user_preferences

Revision ID: e26ab9a1bd95
Revises: bdc85d7aa67a
Create Date: 2025-12-14 16:56:53.170010

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "e26ab9a1bd95"
down_revision = "bdc85d7aa67a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "users",
        sa.Column("bio", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "bio")
    op.drop_column("users", "preferences")
