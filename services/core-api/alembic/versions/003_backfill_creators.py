"""backfill_legacy_creators

Revision ID: 003_backfill_creators
Revises: 02380c8dc45d
Create Date: 2026-02-10 12:00:00.000000

Backfill legacy_members table with creator entries for any legacies
that are missing them. This ensures all legacy creators have proper
membership records so their legacies show up in list_user_legacies.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "003_backfill_creators"
down_revision = "02380c8dc45d"  # Latest head in production
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert missing creator memberships for legacies."""
    # Insert creator memberships for any legacies that don't have them
    op.execute("""
        INSERT INTO legacy_members (legacy_id, user_id, role, joined_at)
        SELECT 
            l.id AS legacy_id,
            l.created_by AS user_id,
            'creator' AS role,
            l.created_at AS joined_at
        FROM legacies l
        WHERE NOT EXISTS (
            SELECT 1 
            FROM legacy_members lm 
            WHERE lm.legacy_id = l.id 
              AND lm.user_id = l.created_by
        )
        ON CONFLICT (legacy_id, user_id) DO NOTHING
    """)


def downgrade() -> None:
    """No downgrade - we don't want to remove creator memberships."""
    pass
