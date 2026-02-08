"""add_story_chunks_table

Revision ID: cbbf93b19ed0
Revises: 264e9d8db7e1
Create Date: 2025-12-30 20:42:45.515197

"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = "cbbf93b19ed0"
down_revision = "264e9d8db7e1"
branch_labels = None
depends_on = None

# Titan v2 embedding dimension
EMBEDDING_DIM = 1024


def upgrade() -> None:
    op.create_table(
        "story_chunks",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("story_id", sa.UUID(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("visibility", sa.String(20), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["story_id"],
            ["stories.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["legacy_id"],
            ["legacies.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "story_id", "chunk_index", name="uq_story_chunks_story_id_chunk_index"
        ),
    )

    # Create HNSW index for vector similarity search
    op.execute(
        """
        CREATE INDEX story_chunks_embedding_idx
        ON story_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )

    # Create indexes for filtering
    op.create_index("ix_story_chunks_legacy_id", "story_chunks", ["legacy_id"])
    op.create_index(
        "ix_story_chunks_legacy_visibility", "story_chunks", ["legacy_id", "visibility"]
    )
    op.create_index("ix_story_chunks_story_id", "story_chunks", ["story_id"])


def downgrade() -> None:
    op.drop_index("ix_story_chunks_story_id", table_name="story_chunks")
    op.drop_index("ix_story_chunks_legacy_visibility", table_name="story_chunks")
    op.drop_index("ix_story_chunks_legacy_id", table_name="story_chunks")
    op.execute("DROP INDEX IF EXISTS story_chunks_embedding_idx")
    op.drop_table("story_chunks")
