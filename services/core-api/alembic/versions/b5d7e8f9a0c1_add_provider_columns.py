"""add_provider_columns

Revision ID: b5d7e8f9a0c1
Revises: 63bc8435cb49
Create Date: 2026-05-18 00:00:00.000000

Add generic provider/provider_id columns to support multiple OAuth providers
(Google, Keycloak, etc.). Existing Google users are backfilled with
provider='google' and provider_id=google_id. The google_id column is made
nullable to allow non-Google users.
"""

from alembic import op
import sqlalchemy as sa

revision = "b5d7e8f9a0c1"
down_revision = "63bc8435cb49"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add provider column with a server default so existing rows get 'google'
    op.add_column(
        "users",
        sa.Column("provider", sa.String(50), nullable=False, server_default="google"),
    )

    # 2. Add provider_id as nullable initially so we can backfill before constraining
    op.add_column(
        "users",
        sa.Column("provider_id", sa.String(255), nullable=True),
    )

    # 3. Backfill provider_id from google_id for all existing Google users
    op.execute("UPDATE users SET provider_id = google_id WHERE provider_id IS NULL")

    # 4. Now enforce NOT NULL on provider_id
    op.alter_column("users", "provider_id", nullable=False)

    # 5. Add composite unique constraint for (provider, provider_id)
    op.create_unique_constraint(
        "uq_users_provider_provider_id",
        "users",
        ["provider", "provider_id"],
    )

    # 6. Make google_id nullable — Keycloak users won't have one
    op.alter_column("users", "google_id", nullable=True)


def downgrade() -> None:
    op.drop_constraint("uq_users_provider_provider_id", "users", type_="unique")
    op.drop_column("users", "provider_id")
    op.drop_column("users", "provider")
    op.alter_column("users", "google_id", nullable=False)
