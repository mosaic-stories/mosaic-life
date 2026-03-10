"""add member relationship profiles

Revision ID: 1551fa901644
Revises: 7f2b8c3d4e51
Create Date: 2026-03-10 01:07:28.712349

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "1551fa901644"
down_revision = "7f2b8c3d4e51"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("legacies", sa.Column("gender", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("gender", sa.String(20), nullable=True))
    op.add_column("legacy_members", sa.Column("profile", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("legacy_members", "profile")
    op.drop_column("users", "gender")
    op.drop_column("legacies", "gender")
