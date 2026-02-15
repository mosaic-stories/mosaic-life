"""add_conversation_chunks_and_legacy_facts

Revision ID: f7a1_memory
Revises: e04738d48e96
Create Date: 2026-02-14

"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "f7a1_memory"
down_revision = "e04738d48e96"
branch_labels = None
depends_on = None

EMBEDDING_DIM = 1024


def upgrade() -> None:
    # -- conversation_chunks --
    op.create_table(
        "conversation_chunks",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("message_range_start", sa.Integer(), nullable=False),
        sa.Column("message_range_end", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id",
            "message_range_start",
            "message_range_end",
            name="uq_conversation_chunks_range",
        ),
    )

    op.create_index(
        "ix_conversation_chunks_user_legacy",
        "conversation_chunks",
        ["user_id", "legacy_id"],
    )

    # HNSW vector index
    op.execute(
        """
        CREATE INDEX conversation_chunks_embedding_idx
        ON conversation_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )

    # -- legacy_facts --
    op.create_table(
        "legacy_facts",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "visibility",
            sa.String(10),
            nullable=False,
            server_default="private",
        ),
        sa.Column("source_conversation_id", sa.UUID(), nullable=True),
        sa.Column(
            "extracted_at",
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
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_conversation_id"],
            ["ai_conversations.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "visibility IN ('private', 'shared')", name="ck_legacy_facts_visibility"
        ),
    )

    op.create_index(
        "ix_legacy_facts_legacy_user", "legacy_facts", ["legacy_id", "user_id"]
    )
    op.create_index(
        "ix_legacy_facts_legacy_visibility",
        "legacy_facts",
        ["legacy_id", "visibility"],
    )


def downgrade() -> None:
    op.drop_index("ix_legacy_facts_legacy_visibility", table_name="legacy_facts")
    op.drop_index("ix_legacy_facts_legacy_user", table_name="legacy_facts")
    op.drop_table("legacy_facts")

    op.execute("DROP INDEX IF EXISTS conversation_chunks_embedding_idx")
    op.drop_index(
        "ix_conversation_chunks_user_legacy", table_name="conversation_chunks"
    )
    op.drop_table("conversation_chunks")
