"""add_invitations_and_update_roles

Revision ID: d2b2655f45ed
Revises: 6a42baca319e
Create Date: 2025-11-29 18:48:08.042621

This migration:
1. Updates legacy_members roles: editor -> admin, member -> advocate
2. Deletes pending members (they'll use the new invitation system)
3. Creates invitations table for managing legacy access invitations
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'd2b2655f45ed'
down_revision = '6a42baca319e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Update existing roles in legacy_members
    # editor -> admin, member -> advocate
    op.execute("""
        UPDATE legacy_members
        SET role = 'admin'
        WHERE role = 'editor'
    """)

    op.execute("""
        UPDATE legacy_members
        SET role = 'advocate'
        WHERE role = 'member'
    """)

    # Step 2: Delete pending members (they'll use new invitation system)
    op.execute("""
        DELETE FROM legacy_members
        WHERE role = 'pending'
    """)

    # Step 3: Create invitations table
    op.create_table(
        'invitations',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column('legacy_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='advocate'),
        sa.Column('invited_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('token', sa.String(64), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['legacy_id'], ['legacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invited_by'], ['users.id'], ondelete='CASCADE'),
        sa.CheckConstraint(
            "role IN ('creator', 'admin', 'advocate', 'admirer')",
            name='ck_invitations_role'
        ),
    )

    # Step 4: Create indexes
    op.create_index('idx_invitations_token', 'invitations', ['token'], unique=True)
    op.create_index('idx_invitations_legacy_id', 'invitations', ['legacy_id'])
    op.create_index('idx_invitations_email', 'invitations', ['email'])


def downgrade() -> None:
    # Drop invitations table and indexes
    op.drop_index('idx_invitations_email', table_name='invitations')
    op.drop_index('idx_invitations_legacy_id', table_name='invitations')
    op.drop_index('idx_invitations_token', table_name='invitations')
    op.drop_table('invitations')

    # Reverse role updates
    op.execute("""
        UPDATE legacy_members
        SET role = 'editor'
        WHERE role = 'admin'
    """)

    op.execute("""
        UPDATE legacy_members
        SET role = 'member'
        WHERE role = 'advocate'
    """)
