"""Increase avatar_url column length

Revision ID: 002
Revises: 001
Create Date: 2025-11-06 04:45:00.000000

Google avatar URLs can exceed 500 characters. Increase to 2000 to accommodate
long URLs with query parameters.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "avatar_url",
        existing_type=sa.String(500),
        type_=sa.String(2000),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "avatar_url",
        existing_type=sa.String(2000),
        type_=sa.String(500),
        existing_nullable=True,
    )
