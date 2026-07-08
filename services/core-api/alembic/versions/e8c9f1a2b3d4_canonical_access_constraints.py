"""canonical access constraints

Revision ID: e8c9f1a2b3d4
Revises: b5d7e8f9a0c1
Create Date: 2026-07-08 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8c9f1a2b3d4"
down_revision: Union[str, Sequence[str], None] = "b5d7e8f9a0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _scalar(sql: str) -> int:
    return int(op.get_bind().execute(sa.text(sql)).scalar() or 0)


def upgrade() -> None:
    member_count = (
        op.get_bind()
        .execute(
            sa.text("UPDATE legacy_members SET role = 'advocate' WHERE role = 'member'")
        )
        .rowcount
    )
    editor_count = (
        op.get_bind()
        .execute(
            sa.text("UPDATE legacy_members SET role = 'admin' WHERE role = 'editor'")
        )
        .rowcount
    )
    pending_count = (
        op.get_bind()
        .execute(sa.text("DELETE FROM legacy_members WHERE role = 'pending'"))
        .rowcount
    )

    print(
        "canonical access cleanup: "
        f"member_to_advocate={member_count or 0}, "
        f"editor_to_admin={editor_count or 0}, "
        f"pending_deleted={pending_count or 0}"
    )

    invalid_roles = _scalar(
        """
        SELECT COUNT(*)
        FROM legacy_members
        WHERE role NOT IN ('creator', 'admin', 'advocate', 'admirer')
        """
    )
    invalid_story_visibilities = _scalar(
        """
        SELECT COUNT(*)
        FROM stories
        WHERE visibility NOT IN ('public', 'private', 'personal')
        """
    )
    invalid_legacy_visibilities = _scalar(
        """
        SELECT COUNT(*)
        FROM legacies
        WHERE visibility NOT IN ('public', 'private')
        """
    )
    if invalid_roles or invalid_story_visibilities or invalid_legacy_visibilities:
        raise RuntimeError(
            "Cannot add canonical access constraints; invalid values remain: "
            f"legacy_members.role={invalid_roles}, "
            f"stories.visibility={invalid_story_visibilities}, "
            f"legacies.visibility={invalid_legacy_visibilities}"
        )

    op.create_check_constraint(
        "ck_legacy_members_role_canonical",
        "legacy_members",
        "role IN ('creator', 'admin', 'advocate', 'admirer')",
    )
    op.create_check_constraint(
        "ck_stories_visibility_canonical",
        "stories",
        "visibility IN ('public', 'private', 'personal')",
    )
    op.create_check_constraint(
        "ck_legacies_visibility_canonical",
        "legacies",
        "visibility IN ('public', 'private')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_legacies_visibility_canonical",
        "legacies",
        type_="check",
    )
    op.drop_constraint(
        "ck_stories_visibility_canonical",
        "stories",
        type_="check",
    )
    op.drop_constraint(
        "ck_legacy_members_role_canonical",
        "legacy_members",
        type_="check",
    )
