"""align tags legacy constraint with model contract

Revision ID: 5c8b4d5a6e7f
Revises: a78de85d6fdb
Create Date: 2026-03-11 11:20:00.000000

"""

from collections.abc import Sequence
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "5c8b4d5a6e7f"
down_revision: str | None = "a78de85d6fdb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill_null_tag_legacy_ids() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()

    tags = sa.Table(
        "tags",
        metadata,
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("legacy_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    media_tags = sa.Table(
        "media_tags",
        metadata,
        sa.Column("media_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tag_id", postgresql.UUID(as_uuid=True), primary_key=True),
    )
    media_legacies = sa.Table(
        "media_legacies",
        metadata,
        sa.Column("media_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("legacy_id", postgresql.UUID(as_uuid=True), primary_key=True),
    )

    null_tags = bind.execute(
        sa.select(
            tags.c.id,
            tags.c.name,
            tags.c.created_by,
            tags.c.created_at,
        ).where(tags.c.legacy_id.is_(None))
    ).mappings()

    for tag_row in null_tags:
        media_ids = [
            row.media_id
            for row in bind.execute(
                sa.select(media_tags.c.media_id).where(
                    media_tags.c.tag_id == tag_row["id"]
                )
            ).mappings()
        ]

        if not media_ids:
            bind.execute(tags.delete().where(tags.c.id == tag_row["id"]))
            continue

        legacy_rows = bind.execute(
            sa.select(
                media_legacies.c.media_id,
                media_legacies.c.legacy_id,
            ).where(media_legacies.c.media_id.in_(media_ids))
        ).mappings()

        if not legacy_rows:
            bind.execute(
                media_tags.delete().where(media_tags.c.tag_id == tag_row["id"])
            )
            bind.execute(tags.delete().where(tags.c.id == tag_row["id"]))
            continue

        scoped_tag_ids: dict[object, object] = {}

        for legacy_row in legacy_rows:
            legacy_id = legacy_row["legacy_id"]
            media_id = legacy_row["media_id"]

            scoped_tag_id = scoped_tag_ids.get(legacy_id)
            if scoped_tag_id is None:
                existing_tag = bind.execute(
                    sa.select(tags.c.id).where(
                        tags.c.name == tag_row["name"],
                        tags.c.legacy_id == legacy_id,
                    )
                ).scalar_one_or_none()

                if existing_tag is None:
                    existing_tag = uuid4()
                    bind.execute(
                        tags.insert().values(
                            id=existing_tag,
                            name=tag_row["name"],
                            legacy_id=legacy_id,
                            created_by=tag_row["created_by"],
                            created_at=tag_row["created_at"],
                        )
                    )

                scoped_tag_ids[legacy_id] = existing_tag
                scoped_tag_id = existing_tag

            existing_assoc = bind.execute(
                sa.select(media_tags.c.media_id).where(
                    media_tags.c.media_id == media_id,
                    media_tags.c.tag_id == scoped_tag_id,
                )
            ).scalar_one_or_none()

            if existing_assoc is None:
                bind.execute(
                    media_tags.insert().values(media_id=media_id, tag_id=scoped_tag_id)
                )

        bind.execute(media_tags.delete().where(media_tags.c.tag_id == tag_row["id"]))
        bind.execute(tags.delete().where(tags.c.id == tag_row["id"]))


def upgrade() -> None:
    _backfill_null_tag_legacy_ids()

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    unique_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("tags")
        if constraint.get("name")
    }

    if "uq_tags_name_legacy_id" in unique_constraints:
        op.drop_constraint("uq_tags_name_legacy_id", "tags", type_="unique")

    if "uq_tag_name_legacy" not in unique_constraints:
        op.create_unique_constraint("uq_tag_name_legacy", "tags", ["name", "legacy_id"])

    op.alter_column(
        "tags",
        "legacy_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "tags",
        "legacy_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    unique_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("tags")
        if constraint.get("name")
    }

    if "uq_tag_name_legacy" in unique_constraints:
        op.drop_constraint("uq_tag_name_legacy", "tags", type_="unique")

    if "uq_tags_name_legacy_id" not in unique_constraints:
        op.create_unique_constraint(
            "uq_tags_name_legacy_id", "tags", ["name", "legacy_id"]
        )
