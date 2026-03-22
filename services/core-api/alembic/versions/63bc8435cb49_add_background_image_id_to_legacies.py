"""add background_image_id to legacies

Revision ID: 63bc8435cb49
Revises: f2a9c6e1b4d7
Create Date: 2026-03-22 04:58:50.183649

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '63bc8435cb49'
down_revision = 'f2a9c6e1b4d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('legacies', sa.Column('background_image_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_legacies_background_image_id'), 'legacies', ['background_image_id'], unique=False)
    op.create_foreign_key(
        'fk_legacies_background_image_id',
        'legacies', 'media',
        ['background_image_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_legacies_background_image_id', 'legacies', type_='foreignkey')
    op.drop_index(op.f('ix_legacies_background_image_id'), table_name='legacies')
    op.drop_column('legacies', 'background_image_id')
