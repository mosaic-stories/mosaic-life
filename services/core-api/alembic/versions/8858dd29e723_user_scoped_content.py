"""user_scoped_content

Revision ID: 8858dd29e723
Revises: pl8f7xmaeuaq
Create Date: 2025-12-15 17:58:29.147712

Migrate from legacy-scoped to user-scoped content ownership:
- Create junction tables for many-to-many relationships (story_legacies, media_legacies, conversation_legacies)
- Drop legacy_id from stories, media, and ai_conversations tables
- Rename media.uploaded_by to media.owner_id
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8858dd29e723"
down_revision = "pl8f7xmaeuaq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. Create story_legacies junction table
    # =========================================================================
    op.create_table(
        "story_legacies",
        sa.Column("story_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column(
            "role", sa.String(length=20), nullable=False, server_default="primary"
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("story_id", "legacy_id"),
        sa.UniqueConstraint("story_id", "legacy_id", name="uq_story_legacy"),
    )
    op.create_index(
        "ix_story_legacies_legacy_id", "story_legacies", ["legacy_id"], unique=False
    )
    op.create_index(
        "ix_story_legacies_story_id", "story_legacies", ["story_id"], unique=False
    )

    # =========================================================================
    # 2. Create media_legacies junction table
    # =========================================================================
    op.create_table(
        "media_legacies",
        sa.Column("media_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column(
            "role", sa.String(length=20), nullable=False, server_default="primary"
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("media_id", "legacy_id"),
        sa.UniqueConstraint("media_id", "legacy_id", name="uq_media_legacy"),
    )
    op.create_index(
        "ix_media_legacies_legacy_id", "media_legacies", ["legacy_id"], unique=False
    )
    op.create_index(
        "ix_media_legacies_media_id", "media_legacies", ["media_id"], unique=False
    )

    # =========================================================================
    # 3. Create conversation_legacies junction table
    # =========================================================================
    op.create_table(
        "conversation_legacies",
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column(
            "role", sa.String(length=20), nullable=False, server_default="primary"
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("conversation_id", "legacy_id"),
        sa.UniqueConstraint(
            "conversation_id", "legacy_id", name="uq_conversation_legacy"
        ),
    )
    op.create_index(
        "ix_conversation_legacies_legacy_id",
        "conversation_legacies",
        ["legacy_id"],
        unique=False,
    )
    op.create_index(
        "ix_conversation_legacies_conversation_id",
        "conversation_legacies",
        ["conversation_id"],
        unique=False,
    )

    # =========================================================================
    # 4. Drop legacy_id from stories
    # =========================================================================
    # Drop compound index that includes legacy_id
    op.drop_index("idx_stories_legacy_created", table_name="stories")
    # Drop foreign key constraint (auto-generated name from inline FK)
    op.drop_constraint("stories_legacy_id_fkey", "stories", type_="foreignkey")
    # Drop the column
    op.drop_column("stories", "legacy_id")

    # =========================================================================
    # 5. Drop legacy_id from media and rename uploaded_by to owner_id
    # =========================================================================
    # Drop index on legacy_id
    op.drop_index("ix_media_legacy_id", table_name="media")
    # Drop foreign key constraint (auto-generated name)
    op.drop_constraint("media_legacy_id_fkey", "media", type_="foreignkey")
    # Drop the column
    op.drop_column("media", "legacy_id")
    # Rename uploaded_by to owner_id
    op.alter_column("media", "uploaded_by", new_column_name="owner_id")
    # Update index name (drop old, create new)
    op.drop_index("ix_media_uploaded_by", table_name="media")
    op.create_index("ix_media_owner_id", "media", ["owner_id"], unique=False)

    # =========================================================================
    # 6. Drop legacy_id from ai_conversations
    # =========================================================================
    # Drop index on legacy_id
    op.drop_index("ix_ai_conversations_legacy_id", table_name="ai_conversations")
    # Drop compound index that includes legacy_id
    op.drop_index(
        "ix_ai_conversations_user_legacy_persona", table_name="ai_conversations"
    )
    # Drop foreign key constraint (auto-generated name)
    op.drop_constraint(
        "ai_conversations_legacy_id_fkey", "ai_conversations", type_="foreignkey"
    )
    # Drop the column
    op.drop_column("ai_conversations", "legacy_id")

    # Create new index for ai_conversations (user + persona only)
    op.create_index(
        "ix_ai_conversations_user_persona",
        "ai_conversations",
        ["user_id", "persona_id"],
        unique=False,
    )


def downgrade() -> None:
    # =========================================================================
    # 1. Restore legacy_id to ai_conversations
    # =========================================================================
    # Drop new user+persona index
    op.drop_index("ix_ai_conversations_user_persona", table_name="ai_conversations")

    # Add legacy_id column back (nullable since existing data won't have values)
    op.add_column("ai_conversations", sa.Column("legacy_id", sa.UUID(), nullable=True))
    # Recreate foreign key
    op.create_foreign_key(
        "ai_conversations_legacy_id_fkey",
        "ai_conversations",
        "legacies",
        ["legacy_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Recreate indexes
    op.create_index(
        "ix_ai_conversations_legacy_id",
        "ai_conversations",
        ["legacy_id"],
        unique=False,
    )
    op.create_index(
        "ix_ai_conversations_user_legacy_persona",
        "ai_conversations",
        ["user_id", "legacy_id", "persona_id"],
        unique=False,
    )

    # =========================================================================
    # 2. Restore uploaded_by and legacy_id to media
    # =========================================================================
    # Rename owner_id back to uploaded_by
    op.drop_index("ix_media_owner_id", table_name="media")
    op.alter_column("media", "owner_id", new_column_name="uploaded_by")
    op.create_index("ix_media_uploaded_by", "media", ["uploaded_by"], unique=False)

    # Add legacy_id column back (nullable since existing data won't have values)
    op.add_column("media", sa.Column("legacy_id", sa.UUID(), nullable=True))
    # Recreate foreign key
    op.create_foreign_key(
        "media_legacy_id_fkey",
        "media",
        "legacies",
        ["legacy_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Recreate index
    op.create_index("ix_media_legacy_id", "media", ["legacy_id"], unique=False)

    # =========================================================================
    # 3. Restore legacy_id to stories
    # =========================================================================
    # Add legacy_id column back (nullable since existing data won't have values)
    op.add_column("stories", sa.Column("legacy_id", sa.UUID(), nullable=True))
    # Recreate foreign key
    op.create_foreign_key(
        "stories_legacy_id_fkey",
        "stories",
        "legacies",
        ["legacy_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Recreate compound index
    op.create_index(
        "idx_stories_legacy_created",
        "stories",
        ["legacy_id", "created_at"],
        unique=False,
        postgresql_ops={"created_at": "DESC"},
    )

    # =========================================================================
    # 4. Drop junction tables
    # =========================================================================
    op.drop_index(
        "ix_conversation_legacies_conversation_id", table_name="conversation_legacies"
    )
    op.drop_index(
        "ix_conversation_legacies_legacy_id", table_name="conversation_legacies"
    )
    op.drop_table("conversation_legacies")

    op.drop_index("ix_media_legacies_media_id", table_name="media_legacies")
    op.drop_index("ix_media_legacies_legacy_id", table_name="media_legacies")
    op.drop_table("media_legacies")

    op.drop_index("ix_story_legacies_story_id", table_name="story_legacies")
    op.drop_index("ix_story_legacies_legacy_id", table_name="story_legacies")
    op.drop_table("story_legacies")
