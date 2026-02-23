"""add_legacy_links_tables

Revision ID: d9165e9a4b0b
Revises: 499f04adfa16
Create Date: 2026-02-23 14:47:33.425394

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d9165e9a4b0b"
down_revision = "499f04adfa16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create legacy_links table
    op.create_table(
        "legacy_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("person_id", sa.UUID(), nullable=False),
        sa.Column("requester_legacy_id", sa.UUID(), nullable=False),
        sa.Column("target_legacy_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "requester_share_mode",
            sa.String(length=20),
            server_default="selective",
            nullable=False,
        ),
        sa.Column(
            "target_share_mode",
            sa.String(length=20),
            server_default="selective",
            nullable=False,
        ),
        sa.Column("requested_by", sa.UUID(), nullable=False),
        sa.Column("responded_by", sa.UUID(), nullable=True),
        sa.Column("revoked_by", sa.UUID(), nullable=True),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["requester_legacy_id"], ["legacies.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["responded_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["revoked_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["target_legacy_id"], ["legacies.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "requester_legacy_id",
            "target_legacy_id",
            name="uq_legacy_link_pair",
        ),
    )
    op.create_index(
        op.f("ix_legacy_links_person_id"),
        "legacy_links",
        ["person_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_legacy_links_requester_legacy_id"),
        "legacy_links",
        ["requester_legacy_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_legacy_links_status"),
        "legacy_links",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_legacy_links_target_legacy_id"),
        "legacy_links",
        ["target_legacy_id"],
        unique=False,
    )

    # Create legacy_link_shares table
    op.create_table(
        "legacy_link_shares",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("legacy_link_id", sa.UUID(), nullable=False),
        sa.Column("source_legacy_id", sa.UUID(), nullable=False),
        sa.Column("resource_type", sa.String(length=20), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column(
            "shared_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("shared_by", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["legacy_link_id"], ["legacy_links.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["shared_by"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_legacy_id"], ["legacies.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "legacy_link_id",
            "resource_type",
            "resource_id",
            name="uq_legacy_link_share",
        ),
    )
    op.create_index(
        op.f("ix_legacy_link_shares_legacy_link_id"),
        "legacy_link_shares",
        ["legacy_link_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_legacy_link_shares_legacy_link_id"),
        table_name="legacy_link_shares",
    )
    op.drop_table("legacy_link_shares")
    op.drop_index(op.f("ix_legacy_links_target_legacy_id"), table_name="legacy_links")
    op.drop_index(op.f("ix_legacy_links_status"), table_name="legacy_links")
    op.drop_index(
        op.f("ix_legacy_links_requester_legacy_id"), table_name="legacy_links"
    )
    op.drop_index(op.f("ix_legacy_links_person_id"), table_name="legacy_links")
    op.drop_table("legacy_links")
