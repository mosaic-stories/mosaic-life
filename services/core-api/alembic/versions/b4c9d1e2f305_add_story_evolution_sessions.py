"""add_story_evolution_sessions

Revision ID: b4c9d1e2f305
Revises: a3f8e2c91b47
Create Date: 2026-02-17 14:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b4c9d1e2f305"
down_revision = "a3f8e2c91b47"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_evolution_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("story_id", sa.Uuid(), nullable=False),
        sa.Column("base_version_number", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("draft_version_id", sa.Uuid(), nullable=True),
        sa.Column(
            "phase",
            sa.String(length=20),
            server_default="elicitation",
            nullable=False,
        ),
        sa.Column("summary_text", sa.Text(), nullable=True),
        sa.Column("writing_style", sa.String(length=20), nullable=True),
        sa.Column("length_preference", sa.String(length=20), nullable=True),
        sa.Column(
            "revision_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("created_by", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_conversations.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["draft_version_id"],
            ["story_versions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_story_evolution_sessions_conversation_id"),
        "story_evolution_sessions",
        ["conversation_id"],
    )
    op.create_index(
        op.f("ix_story_evolution_sessions_story_id"),
        "story_evolution_sessions",
        ["story_id"],
    )
    op.create_index(
        "ix_one_active_session_per_story",
        "story_evolution_sessions",
        ["story_id"],
        unique=True,
        postgresql_where=sa.text("phase NOT IN ('completed', 'discarded')"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_one_active_session_per_story",
        table_name="story_evolution_sessions",
    )
    op.drop_index(
        op.f("ix_story_evolution_sessions_story_id"),
        table_name="story_evolution_sessions",
    )
    op.drop_index(
        op.f("ix_story_evolution_sessions_conversation_id"),
        table_name="story_evolution_sessions",
    )
    op.drop_table("story_evolution_sessions")
