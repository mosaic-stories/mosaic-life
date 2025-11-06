"""Initial MVP schema

Revision ID: 001
Revises:
Create Date: 2025-01-05 12:00:00.000000

Creates the core 5-table schema for Mosaic Life MVP:
1. users - Google OAuth user accounts
2. legacies - People being remembered
3. legacy_members - Access control and join requests
4. stories - Markdown stories with visibility controls
5. media - S3 media file references
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable UUID extension
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # Enable pg_trgm extension for similarity search (used in legacy name search)
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # =========================================================================
    # 1. USERS TABLE
    # =========================================================================
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('uuid_generate_v4()')),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('google_id', sa.String(255), nullable=False, unique=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('avatar_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP'))
    )

    # Indexes for users
    op.create_index('idx_users_email', 'users', ['email'])
    op.create_index('idx_users_google_id', 'users', ['google_id'])

    # =========================================================================
    # 2. LEGACIES TABLE
    # =========================================================================
    op.create_table(
        'legacies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('uuid_generate_v4()')),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('birth_date', sa.Date, nullable=True),
        sa.Column('death_date', sa.Date, nullable=True),
        sa.Column('biography', sa.Text, nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE')
    )

    # Indexes for legacies
    op.create_index('idx_legacies_name', 'legacies', ['name'])
    # Trigram index for similarity search on name
    op.create_index('idx_legacies_name_trgm', 'legacies', ['name'],
                    postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.create_index('idx_legacies_created_by', 'legacies', ['created_by'])
    op.create_index('idx_legacies_created_at', 'legacies', ['created_at'])

    # =========================================================================
    # 3. LEGACY_MEMBERS TABLE (Access Control)
    # =========================================================================
    op.create_table(
        'legacy_members',
        sa.Column('legacy_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='member'),
        # Roles: 'creator', 'editor', 'member', 'pending'
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('legacy_id', 'user_id'),
        sa.ForeignKeyConstraint(['legacy_id'], ['legacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )

    # Indexes for legacy_members
    op.create_index('idx_legacy_members_user', 'legacy_members', ['user_id'])
    op.create_index('idx_legacy_members_legacy', 'legacy_members', ['legacy_id'])
    op.create_index('idx_legacy_members_role', 'legacy_members', ['role'])

    # =========================================================================
    # 4. STORIES TABLE
    # =========================================================================
    op.create_table(
        'stories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('uuid_generate_v4()')),
        sa.Column('legacy_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('content', sa.Text, nullable=False),  # Markdown format
        sa.Column('visibility', sa.String(20), nullable=False, server_default='private'),
        # Visibility: 'public', 'private', 'personal'
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['legacy_id'], ['legacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE')
    )

    # Indexes for stories
    # Compound index for listing stories by legacy (most common query)
    op.create_index('idx_stories_legacy_created', 'stories',
                    ['legacy_id', 'created_at'], postgresql_ops={'created_at': 'DESC'})
    op.create_index('idx_stories_author', 'stories', ['author_id'])
    op.create_index('idx_stories_visibility', 'stories', ['visibility'])

    # =========================================================================
    # 5. MEDIA TABLE
    # =========================================================================
    op.create_table(
        'media',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('uuid_generate_v4()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('legacy_id', postgresql.UUID(as_uuid=True), nullable=True),
        # legacy_id is optional - media can exist without being attached to a legacy
        sa.Column('s3_bucket', sa.String(100), nullable=False),
        sa.Column('s3_key', sa.String(500), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('content_type', sa.String(100), nullable=False),
        sa.Column('size_bytes', sa.BigInteger, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('s3_bucket', 's3_key', name='uq_media_s3_location'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['legacy_id'], ['legacies.id'], ondelete='SET NULL')
    )

    # Indexes for media
    op.create_index('idx_media_user', 'media', ['user_id'])
    # Partial index for legacy media (only when legacy_id is not null)
    op.create_index('idx_media_legacy', 'media', ['legacy_id'],
                    postgresql_where=sa.text('legacy_id IS NOT NULL'))
    op.create_index('idx_media_created_at', 'media', ['created_at'])

    # =========================================================================
    # TRIGGERS FOR UPDATED_AT
    # =========================================================================
    # Create trigger function to auto-update updated_at timestamps
    op.execute("""
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';
    """)

    # Apply trigger to tables with updated_at
    for table in ['users', 'legacies', 'stories']:
        op.execute(f"""
        CREATE TRIGGER update_{table}_updated_at
        BEFORE UPDATE ON {table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
        """)


def downgrade() -> None:
    # Drop triggers
    for table in ['users', 'legacies', 'stories']:
        op.execute(f'DROP TRIGGER IF EXISTS update_{table}_updated_at ON {table}')

    op.execute('DROP FUNCTION IF EXISTS update_updated_at_column()')

    # Drop tables in reverse order (respect foreign keys)
    op.drop_table('media')
    op.drop_table('stories')
    op.drop_table('legacy_members')
    op.drop_table('legacies')
    op.drop_table('users')

    # Note: We don't drop extensions as they might be used by other databases
