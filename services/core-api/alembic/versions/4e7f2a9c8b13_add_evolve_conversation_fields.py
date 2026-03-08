"""add evolve conversation fields

Revision ID: 4e7f2a9c8b13
Revises: 03b40a605cd8
Create Date: 2026-03-08
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "4e7f2a9c8b13"
down_revision = "03b40a605cd8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ai_conversations: add source_conversation_id (self-referencing FK)
    op.add_column(
        "ai_conversations",
        sa.Column("source_conversation_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_conversations_source_conversation",
        "ai_conversations",
        "ai_conversations",
        ["source_conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ai_conversations: add story_id FK
    op.add_column(
        "ai_conversations",
        sa.Column("story_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_conversations_story",
        "ai_conversations",
        "stories",
        ["story_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ai_messages: add message_type and metadata
    op.add_column(
        "ai_messages",
        sa.Column(
            "message_type",
            sa.String(length=30),
            server_default="chat",
            nullable=False,
        ),
    )
    op.add_column(
        "ai_messages",
        sa.Column("metadata", sa.JSON(), nullable=True),
    )

    # stories: add source_conversation_id FK
    op.add_column(
        "stories",
        sa.Column("source_conversation_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_stories_source_conversation",
        "stories",
        "ai_conversations",
        ["source_conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # stories: drop FK then column
    op.drop_constraint("fk_stories_source_conversation", "stories", type_="foreignkey")
    op.drop_column("stories", "source_conversation_id")

    # ai_messages: drop columns
    op.drop_column("ai_messages", "metadata")
    op.drop_column("ai_messages", "message_type")

    # ai_conversations: drop story_id FK then column
    op.drop_constraint(
        "fk_ai_conversations_story", "ai_conversations", type_="foreignkey"
    )
    op.drop_column("ai_conversations", "story_id")

    # ai_conversations: drop source_conversation_id FK then column
    op.drop_constraint(
        "fk_ai_conversations_source_conversation",
        "ai_conversations",
        type_="foreignkey",
    )
    op.drop_column("ai_conversations", "source_conversation_id")
