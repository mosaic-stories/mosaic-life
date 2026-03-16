"""add user connections profiles and access requests

Revision ID: c10b9be6ac3d
Revises: 5c8b4d5a6e7f
Create Date: 2026-03-15 23:51:56.214204

"""

import json
import re
import secrets
import string

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c10b9be6ac3d"
down_revision = "5c8b4d5a6e7f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- 1. Username on users (add nullable, backfill, then NOT NULL) ---
    op.add_column("users", sa.Column("username", sa.String(length=30), nullable=True))

    # Backfill usernames for existing users
    conn = op.get_bind()
    users = conn.execute(sa.text("SELECT id, name FROM users WHERE username IS NULL"))
    suffix_chars = string.ascii_lowercase + string.digits
    for user_id, name in users:
        base = (
            re.sub(r"[^a-z0-9]+", "-", (name or "user").lower().strip()).strip("-")
            or "user"
        )
        base = base[:24].rstrip("-")
        suffix = "".join(secrets.choice(suffix_chars) for _ in range(4))
        username = f"{base}-{suffix}"
        conn.execute(
            sa.text("UPDATE users SET username = :username WHERE id = :id"),
            {"username": username, "id": user_id},
        )

    op.alter_column("users", "username", nullable=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # --- 2. Profile settings table ---
    op.create_table(
        "profile_settings",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("discoverable", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "visibility_legacies",
            sa.String(length=20),
            server_default="nobody",
            nullable=False,
        ),
        sa.Column(
            "visibility_stories",
            sa.String(length=20),
            server_default="nobody",
            nullable=False,
        ),
        sa.Column(
            "visibility_media",
            sa.String(length=20),
            server_default="nobody",
            nullable=False,
        ),
        sa.Column(
            "visibility_connections",
            sa.String(length=20),
            server_default="nobody",
            nullable=False,
        ),
        sa.Column(
            "visibility_bio",
            sa.String(length=20),
            server_default="connections",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    # Backfill profile_settings for existing users
    conn.execute(sa.text("INSERT INTO profile_settings (user_id) SELECT id FROM users"))

    # --- 3. Connections table ---
    op.create_table(
        "connections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_a_id", sa.UUID(), nullable=False),
        sa.Column("user_b_id", sa.UUID(), nullable=False),
        sa.Column(
            "connected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_a_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_b_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_a_id", "user_b_id", name="uq_connection_pair"),
    )
    op.create_index(
        op.f("ix_connections_user_a_id"), "connections", ["user_a_id"], unique=False
    )
    op.create_index(
        op.f("ix_connections_user_b_id"), "connections", ["user_b_id"], unique=False
    )

    # --- 4. Connection requests table ---
    op.create_table(
        "connection_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("from_user_id", sa.UUID(), nullable=False),
        sa.Column("to_user_id", sa.UUID(), nullable=False),
        sa.Column("relationship_type", sa.String(length=50), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(length=20), server_default="pending", nullable=False
        ),
        sa.Column("declined_cooldown_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_connection_requests_from_user_id"),
        "connection_requests",
        ["from_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_connection_requests_status"),
        "connection_requests",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_connection_requests_to_user_id"),
        "connection_requests",
        ["to_user_id"],
        unique=False,
    )

    # --- 5. Relationships table ---
    op.create_table(
        "relationships",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=False),
        sa.Column("connection_id", sa.UUID(), nullable=True),
        sa.Column("legacy_member_legacy_id", sa.UUID(), nullable=True),
        sa.Column("legacy_member_user_id", sa.UUID(), nullable=True),
        sa.Column("relationship_type", sa.String(length=50), nullable=True),
        sa.Column("who_they_are_to_me", sa.Text(), nullable=True),
        sa.Column("who_i_am_to_them", sa.Text(), nullable=True),
        sa.Column("nicknames", sa.JSON(), nullable=True),
        sa.Column("character_traits", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(connection_id IS NOT NULL AND legacy_member_legacy_id IS NULL AND legacy_member_user_id IS NULL) "
            "OR (connection_id IS NULL AND legacy_member_legacy_id IS NOT NULL AND legacy_member_user_id IS NOT NULL)",
            name="ck_relationship_exactly_one_context",
        ),
        sa.ForeignKeyConstraint(
            ["connection_id"],
            ["connections.id"],
            name="fk_relationship_connection",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["legacy_member_legacy_id", "legacy_member_user_id"],
            ["legacy_members.legacy_id", "legacy_members.user_id"],
            name="fk_relationship_legacy_member",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_relationships_connection_id"),
        "relationships",
        ["connection_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_relationships_owner_user_id"),
        "relationships",
        ["owner_user_id"],
        unique=False,
    )

    # --- 6. Migrate legacy_members.profile data to relationships ---
    members_with_profiles = conn.execute(
        sa.text(
            "SELECT legacy_id, user_id, profile FROM legacy_members WHERE profile IS NOT NULL"
        )
    )
    for legacy_id, user_id, profile_data in members_with_profiles:
        if not profile_data:
            continue
        nicknames = profile_data.get("nicknames")
        traits = profile_data.get("character_traits")
        conn.execute(
            sa.text("""
                INSERT INTO relationships (
                    id, owner_user_id, legacy_member_legacy_id, legacy_member_user_id,
                    relationship_type, who_they_are_to_me, who_i_am_to_them,
                    nicknames, character_traits
                ) VALUES (
                    gen_random_uuid(), :owner, :lm_legacy, :lm_user,
                    :rel_type, :who_they_are, :who_i_am,
                    CAST(:nicknames AS JSON), CAST(:traits AS JSON)
                )
            """),
            {
                "owner": user_id,
                "lm_legacy": legacy_id,
                "lm_user": user_id,
                "rel_type": profile_data.get("relationship_type"),
                "who_they_are": profile_data.get("viewer_to_legacy"),
                "who_i_am": profile_data.get("legacy_to_viewer"),
                "nicknames": json.dumps(nicknames) if nicknames else None,
                "traits": json.dumps(traits) if traits else None,
            },
        )

    # Drop the profile column from legacy_members
    op.drop_column("legacy_members", "profile")

    # --- 7. Legacy access requests table ---
    op.create_table(
        "legacy_access_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("requested_role", sa.String(length=20), nullable=False),
        sa.Column("assigned_role", sa.String(length=20), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(length=20), server_default="pending", nullable=False
        ),
        sa.Column("resolved_by", sa.UUID(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_legacy_access_requests_legacy_id"),
        "legacy_access_requests",
        ["legacy_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_legacy_access_requests_status"),
        "legacy_access_requests",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_legacy_access_requests_user_id"),
        "legacy_access_requests",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop new tables in reverse dependency order
    op.drop_index(
        op.f("ix_legacy_access_requests_user_id"), table_name="legacy_access_requests"
    )
    op.drop_index(
        op.f("ix_legacy_access_requests_status"), table_name="legacy_access_requests"
    )
    op.drop_index(
        op.f("ix_legacy_access_requests_legacy_id"), table_name="legacy_access_requests"
    )
    op.drop_table("legacy_access_requests")

    # Re-add profile column to legacy_members (data loss — relationships data not migrated back)
    op.add_column(
        "legacy_members",
        sa.Column("profile", sa.JSON(), nullable=True),
    )

    op.drop_index(op.f("ix_relationships_owner_user_id"), table_name="relationships")
    op.drop_index(op.f("ix_relationships_connection_id"), table_name="relationships")
    op.drop_table("relationships")

    op.drop_index(
        op.f("ix_connection_requests_to_user_id"), table_name="connection_requests"
    )
    op.drop_index(
        op.f("ix_connection_requests_status"), table_name="connection_requests"
    )
    op.drop_index(
        op.f("ix_connection_requests_from_user_id"), table_name="connection_requests"
    )
    op.drop_table("connection_requests")

    op.drop_index(op.f("ix_connections_user_b_id"), table_name="connections")
    op.drop_index(op.f("ix_connections_user_a_id"), table_name="connections")
    op.drop_table("connections")

    op.drop_table("profile_settings")

    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_column("users", "username")
