"""add_pgvector_extension

Revision ID: 264e9d8db7e1
Revises: 8858dd29e723
Create Date: 2025-12-30 20:37:15.864248

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "264e9d8db7e1"
down_revision = "8858dd29e723"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    # Note: Dropping extension will fail if tables use vector type
    op.execute("DROP EXTENSION IF EXISTS vector")
