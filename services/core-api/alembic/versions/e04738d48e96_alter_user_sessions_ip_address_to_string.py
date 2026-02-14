"""alter_user_sessions_ip_address_to_string

Revision ID: e04738d48e96
Revises: 003_backfill_creators
Create Date: 2026-02-14 05:06:33.478287

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e04738d48e96'
down_revision = '003_backfill_creators'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert ip_address column from INET to VARCHAR(45)
    # Using a raw SQL command because SQLAlchemy may not handle INET -> VARCHAR cleanly
    op.execute("""
        ALTER TABLE user_sessions 
        ALTER COLUMN ip_address TYPE VARCHAR(45) 
        USING ip_address::TEXT;
    """)


def downgrade() -> None:
    # Convert back to INET if needed (though this may fail if data is not valid IP)
    op.execute("""
        ALTER TABLE user_sessions 
        ALTER COLUMN ip_address TYPE INET 
        USING ip_address::INET;
    """)

