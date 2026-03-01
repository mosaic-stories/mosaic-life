"""add story context and context facts tables

Revision ID: a8797dc9de71
Revises: d9165e9a4b0b
Create Date: 2026-03-01 06:19:35.330885

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a8797dc9de71'
down_revision = 'd9165e9a4b0b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('story_contexts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('story_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('summary', sa.Text(), nullable=True),
    sa.Column('extracting', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('summary_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('story_id', 'user_id', name='uq_story_contexts_story_user')
    )
    op.create_index(op.f('ix_story_contexts_story_id'), 'story_contexts', ['story_id'], unique=False)
    op.create_index(op.f('ix_story_contexts_user_id'), 'story_contexts', ['user_id'], unique=False)
    op.create_table('context_facts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('story_context_id', sa.UUID(), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('content', sa.String(length=500), nullable=False),
    sa.Column('detail', sa.String(length=1000), nullable=True),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('source_message_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.String(length=20), server_default='active', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.ForeignKeyConstraint(['source_message_id'], ['ai_messages.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['story_context_id'], ['story_contexts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_context_facts_story_context_id'), 'context_facts', ['story_context_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_context_facts_story_context_id'), table_name='context_facts')
    op.drop_table('context_facts')
    op.drop_index(op.f('ix_story_contexts_user_id'), table_name='story_contexts')
    op.drop_index(op.f('ix_story_contexts_story_id'), table_name='story_contexts')
    op.drop_table('story_contexts')
