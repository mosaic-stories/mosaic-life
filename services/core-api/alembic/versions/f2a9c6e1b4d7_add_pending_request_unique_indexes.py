"""Add partial unique indexes for pending request invariants.

Revision ID: f2a9c6e1b4d7
Revises: c10b9be6ac3d
Create Date: 2026-03-16 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a9c6e1b4d7"
down_revision: Union[str, Sequence[str], None] = "c10b9be6ac3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX uq_connection_requests_pending_pair
        ON connection_requests (
            LEAST(from_user_id, to_user_id),
            GREATEST(from_user_id, to_user_id)
        )
        WHERE status = 'pending'
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_legacy_access_requests_pending_pair
        ON legacy_access_requests (user_id, legacy_id)
        WHERE status = 'pending'
        """
    )


def downgrade() -> None:
    op.drop_index(
        "uq_legacy_access_requests_pending_pair",
        table_name="legacy_access_requests",
    )
    op.drop_index(
        "uq_connection_requests_pending_pair",
        table_name="connection_requests",
    )
