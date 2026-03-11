"""add media metadata tags and people

Revision ID: a78de85d6fdb
Revises: 1551fa901644
Create Date: 2026-03-11 04:10:56.101383

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a78de85d6fdb'
down_revision: str | None = '1551fa901644'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add columns to media table
    op.add_column('media', sa.Column('caption', sa.Text(), nullable=True))
    op.add_column('media', sa.Column('date_taken', sa.String(100), nullable=True))
    op.add_column('media', sa.Column('location', sa.String(255), nullable=True))
    op.add_column('media', sa.Column('era', sa.String(50), nullable=True))
    op.add_column('media', sa.Column('ai_description', sa.Text(), nullable=True))
    op.add_column('media', sa.Column('ai_insights', postgresql.JSON(astext_type=sa.Text()), nullable=True))

    # Create tags table
    op.create_table(
        'tags',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('legacy_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['legacy_id'], ['legacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('name', 'legacy_id', name='uq_tags_name_legacy_id'),
    )
    op.create_index('ix_tags_legacy_id', 'tags', ['legacy_id'])

    # Create media_tags table
    op.create_table(
        'media_tags',
        sa.Column('media_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tag_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['media_id'], ['media.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('media_id', 'tag_id'),
        sa.UniqueConstraint('media_id', 'tag_id', name='uq_media_tags_media_tag'),
    )

    # Create media_persons table
    op.create_table(
        'media_persons',
        sa.Column('media_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('person_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role', sa.String(50), nullable=False, server_default='subject'),
        sa.ForeignKeyConstraint(['media_id'], ['media.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('media_id', 'person_id'),
        sa.UniqueConstraint('media_id', 'person_id', name='uq_media_persons_media_person'),
    )


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_table('media_persons')
    op.drop_table('media_tags')
    op.drop_index('ix_tags_legacy_id', table_name='tags')
    op.drop_table('tags')

    # Drop columns from media table
    op.drop_column('media', 'ai_insights')
    op.drop_column('media', 'ai_description')
    op.drop_column('media', 'era')
    op.drop_column('media', 'location')
    op.drop_column('media', 'date_taken')
    op.drop_column('media', 'caption')
