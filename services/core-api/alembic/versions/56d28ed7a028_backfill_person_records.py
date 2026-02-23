"""Backfill person records from existing legacies.

Revision ID: 56d28ed7a028
Revises: dee19bfd2478
Create Date: 2026-02-23 14:09:37.437521

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "56d28ed7a028"
down_revision = "dee19bfd2478"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Backfill: create a Person for each legacy that doesn't have one
    op.execute("""
        INSERT INTO persons (id, canonical_name, birth_date, death_date, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            l.name,
            l.birth_date,
            l.death_date,
            l.created_at,
            NOW()
        FROM legacies l
        WHERE l.person_id IS NULL
    """)

    # Link legacies to their new Person records by matching name + dates
    op.execute("""
        UPDATE legacies l
        SET person_id = p.id
        FROM persons p
        WHERE l.person_id IS NULL
            AND p.canonical_name = l.name
            AND (p.birth_date IS NOT DISTINCT FROM l.birth_date)
            AND (p.death_date IS NOT DISTINCT FROM l.death_date)
    """)


def downgrade() -> None:
    # Set person_id back to NULL
    op.execute("UPDATE legacies SET person_id = NULL")
    # Delete all persons (only backfilled ones exist at this point)
    op.execute("DELETE FROM persons")
