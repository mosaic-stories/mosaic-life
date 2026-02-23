"""add_persons_table_and_legacy_person_id

Revision ID: dee19bfd2478
Revises: b4c9d1e2f305
Create Date: 2026-02-23 13:53:31.936259

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'dee19bfd2478'
down_revision = 'b4c9d1e2f305'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create persons table
    op.create_table('persons',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('canonical_name', sa.String(length=200), nullable=False),
    sa.Column('aliases', postgresql.JSON(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('birth_date_approximate', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('death_date', sa.Date(), nullable=True),
    sa.Column('death_date_approximate', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('locations', postgresql.JSON(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_persons_canonical_name'), 'persons', ['canonical_name'], unique=False)

    # Trigram GIN index for fuzzy name matching
    op.execute(
        "CREATE INDEX ix_persons_canonical_name_trgm ON persons "
        "USING gin (canonical_name gin_trgm_ops)"
    )

    # Add person_id to legacies
    op.add_column('legacies', sa.Column('person_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_legacies_person_id'), 'legacies', ['person_id'], unique=False)
    op.create_foreign_key('fk_legacies_person_id', 'legacies', 'persons', ['person_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_legacies_person_id', 'legacies', type_='foreignkey')
    op.drop_index(op.f('ix_legacies_person_id'), table_name='legacies')
    op.drop_column('legacies', 'person_id')
    op.execute("DROP INDEX IF EXISTS ix_persons_canonical_name_trgm")
    op.drop_index(op.f('ix_persons_canonical_name'), table_name='persons')
    op.drop_table('persons')
