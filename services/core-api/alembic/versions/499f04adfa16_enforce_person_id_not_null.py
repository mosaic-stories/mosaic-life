"""Enforce person_id NOT NULL on legacies.

Revision ID: 499f04adfa16
Revises: 56d28ed7a028
Create Date: 2026-02-23 14:10:07.083181

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '499f04adfa16'
down_revision = '56d28ed7a028'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("legacies", "person_id", nullable=False)


def downgrade() -> None:
    op.alter_column("legacies", "person_id", nullable=True)
