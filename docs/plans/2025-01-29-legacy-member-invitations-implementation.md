# Legacy Member Invitations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a hierarchical membership system with email invitations allowing legacy creators to invite family and friends at appropriate permission levels (creator, admin, advocate, admirer).

**Architecture:** New `invitations` table for tracking email invitations with secure tokens. Update `legacy_members.role` to use new role hierarchy. SES integration for sending invitation emails. Frontend drawer for member management and modal for sending invites.

**Tech Stack:** FastAPI, SQLAlchemy 2.x async, Alembic, Pydantic v2, boto3 (SES), React, TanStack Query, shadcn/ui

**Design Document:** `docs/plans/2025-01-29-legacy-member-invitations-design.md`

---

## Phase 1: Database Schema

### Task 1: Create Alembic Migration for Role Update and Invitations Table

**Files:**
- Create: `services/core-api/alembic/versions/007_add_invitations_and_update_roles.py`

**Step 1: Generate migration file**

Run:
```bash
cd /apps/mosaic-life/services/core-api
source .venv/bin/activate
alembic revision -m "add_invitations_and_update_roles"
```

**Step 2: Write the migration**

Edit the generated file with:

```python
"""add_invitations_and_update_roles

Revision ID: <generated>
Revises: <previous>
Create Date: <generated>
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "<generated>"
down_revision = "<previous>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Update existing roles in legacy_members
    # Map: creator -> creator, editor -> admin, member -> advocate, pending -> delete
    op.execute("""
        UPDATE legacy_members
        SET role = CASE
            WHEN role = 'editor' THEN 'admin'
            WHEN role = 'member' THEN 'advocate'
            ELSE role
        END
        WHERE role IN ('editor', 'member')
    """)

    # Delete pending members (they'll use invitation system now)
    op.execute("DELETE FROM legacy_members WHERE role = 'pending'")

    # Step 2: Create invitations table
    op.create_table(
        "invitations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "legacy_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("legacies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.String(20),
            nullable=False,
            server_default="advocate",
        ),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("idx_invitations_token", "invitations", ["token"])
    op.create_index("idx_invitations_legacy_id", "invitations", ["legacy_id"])
    op.create_index("idx_invitations_email", "invitations", ["email"])

    # Step 3: Add check constraint for valid roles
    op.create_check_constraint(
        "ck_invitations_role",
        "invitations",
        "role IN ('creator', 'admin', 'advocate', 'admirer')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_invitations_role", "invitations", type_="check")
    op.drop_index("idx_invitations_email", table_name="invitations")
    op.drop_index("idx_invitations_legacy_id", table_name="invitations")
    op.drop_index("idx_invitations_token", table_name="invitations")
    op.drop_table("invitations")

    # Revert role names
    op.execute("""
        UPDATE legacy_members
        SET role = CASE
            WHEN role = 'admin' THEN 'editor'
            WHEN role = 'advocate' THEN 'member'
            ELSE role
        END
        WHERE role IN ('admin', 'advocate')
    """)
```

**Step 3: Run the migration**

Run:
```bash
alembic upgrade head
```

Expected: Migration applies successfully, no errors.

**Step 4: Verify migration**

Run:
```bash
alembic current
```

Expected: Shows the new revision as current.

**Step 5: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(db): add invitations table and update role names

- Add invitations table with token, expiration, status tracking
- Migrate existing roles: editor->admin, member->advocate
- Remove pending members (replaced by invitation system)"
```

---

## Phase 2: Backend Models

### Task 2: Create Invitation Model

**Files:**
- Create: `services/core-api/app/models/invitation.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/test_invitation_model.py`:

```python
"""Tests for Invitation model."""
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invitation import Invitation
from app.models.legacy import Legacy
from app.models.user import User


class TestInvitationModel:
    """Tests for Invitation model."""

    @pytest.mark.asyncio
    async def test_create_invitation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating an invitation."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_123",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.id is not None
        assert invitation.email == "invitee@example.com"
        assert invitation.role == "advocate"
        assert invitation.accepted_at is None
        assert invitation.revoked_at is None

    @pytest.mark.asyncio
    async def test_invitation_is_pending(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation pending status check."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_456",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.is_pending is True
        assert invitation.is_expired is False

    @pytest.mark.asyncio
    async def test_invitation_is_expired(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test expired invitation."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_789",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),  # Expired
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.is_pending is False
        assert invitation.is_expired is True
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /apps/mosaic-life/services/core-api
pytest tests/test_invitation_model.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.invitation'`

**Step 3: Write the Invitation model**

Create `services/core-api/app/models/invitation.py`:

```python
"""Invitation model for legacy member invitations."""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Invitation(Base):
    """Invitation model for inviting users to join a legacy."""

    __tablename__ = "invitations"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="advocate",
    )
    invited_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    legacy: Mapped["Legacy"] = relationship("Legacy", back_populates="invitations")
    inviter: Mapped["User"] = relationship("User")

    @property
    def is_pending(self) -> bool:
        """Check if invitation is still pending."""
        now = datetime.now(timezone.utc)
        return (
            self.accepted_at is None
            and self.revoked_at is None
            and self.expires_at > now
        )

    @property
    def is_expired(self) -> bool:
        """Check if invitation has expired."""
        now = datetime.now(timezone.utc)
        return self.expires_at <= now and self.accepted_at is None

    @property
    def status(self) -> str:
        """Get the current status of the invitation."""
        if self.accepted_at is not None:
            return "accepted"
        if self.revoked_at is not None:
            return "revoked"
        if self.is_expired:
            return "expired"
        return "pending"
```

**Step 4: Update models __init__.py**

Modify `services/core-api/app/models/__init__.py` to add:

```python
from .invitation import Invitation
```

**Step 5: Add relationship to Legacy model**

Modify `services/core-api/app/models/legacy.py` to add the invitations relationship to the Legacy class:

```python
# Add import at top
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .invitation import Invitation

# Add to Legacy class, after the members relationship:
invitations: Mapped[list["Invitation"]] = relationship(
    "Invitation",
    back_populates="legacy",
    cascade="all, delete-orphan",
)
```

**Step 6: Run test to verify it passes**

Run:
```bash
pytest tests/test_invitation_model.py -v
```

Expected: All tests PASS.

**Step 7: Commit**

```bash
git add services/core-api/app/models/ services/core-api/tests/test_invitation_model.py
git commit -m "feat(models): add Invitation model

- Invitation model with token, expiration, and status tracking
- Properties for is_pending, is_expired, status
- Relationship to Legacy and User models"
```

---

### Task 3: Update LegacyMember Role Constants

**Files:**
- Modify: `services/core-api/app/models/legacy.py`
- Modify: `services/core-api/app/services/legacy.py`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_service.py`:

```python
class TestRoleHierarchy:
    """Tests for role hierarchy."""

    def test_role_levels(self):
        """Test role level values."""
        from app.services.legacy import ROLE_LEVELS

        assert ROLE_LEVELS["creator"] == 4
        assert ROLE_LEVELS["admin"] == 3
        assert ROLE_LEVELS["advocate"] == 2
        assert ROLE_LEVELS["admirer"] == 1

    def test_can_manage_role(self):
        """Test role management permissions."""
        from app.services.legacy import can_manage_role

        # Creator can manage all roles
        assert can_manage_role("creator", "creator") is True
        assert can_manage_role("creator", "admin") is True
        assert can_manage_role("creator", "advocate") is True
        assert can_manage_role("creator", "admirer") is True

        # Admin can manage admin and below
        assert can_manage_role("admin", "creator") is False
        assert can_manage_role("admin", "admin") is True
        assert can_manage_role("admin", "advocate") is True
        assert can_manage_role("admin", "admirer") is True

        # Advocate can manage advocate and below
        assert can_manage_role("advocate", "creator") is False
        assert can_manage_role("advocate", "admin") is False
        assert can_manage_role("advocate", "advocate") is True
        assert can_manage_role("advocate", "admirer") is True

        # Admirer cannot manage anyone
        assert can_manage_role("admirer", "creator") is False
        assert can_manage_role("admirer", "admin") is False
        assert can_manage_role("admirer", "advocate") is False
        assert can_manage_role("admirer", "admirer") is False
```

**Step 2: Run test to verify it fails**

Run:
```bash
pytest tests/test_legacy_service.py::TestRoleHierarchy -v
```

Expected: FAIL with role level mismatch or missing function.

**Step 3: Update role constants in legacy service**

Modify `services/core-api/app/services/legacy.py`:

```python
# Update the ROLE_LEVELS constant (replace existing)
ROLE_LEVELS: dict[str, int] = {
    "creator": 4,
    "admin": 3,
    "advocate": 2,
    "admirer": 1,
}

# Add helper function
def can_manage_role(actor_role: str, target_role: str) -> bool:
    """Check if actor can manage (invite, demote, remove) target role.

    Rules:
    - Creator can manage all roles including other creators
    - Admin can manage admin, advocate, admirer
    - Advocate can manage advocate, admirer
    - Admirer cannot manage anyone
    """
    actor_level = ROLE_LEVELS.get(actor_role, 0)
    target_level = ROLE_LEVELS.get(target_role, 0)

    # Admirer cannot manage anyone
    if actor_role == "admirer":
        return False

    return actor_level >= target_level


def can_invite_role(actor_role: str, target_role: str) -> bool:
    """Check if actor can invite someone at target role level.

    Same rules as can_manage_role.
    """
    return can_manage_role(actor_role, target_role)
```

**Step 4: Run test to verify it passes**

Run:
```bash
pytest tests/test_legacy_service.py::TestRoleHierarchy -v
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/tests/test_legacy_service.py
git commit -m "feat(services): update role hierarchy to 4-tier model

- creator (4) > admin (3) > advocate (2) > admirer (1)
- Add can_manage_role() and can_invite_role() helpers
- Update ROLE_LEVELS constant"
```

---

## Phase 3: Invitation Schemas

### Task 4: Create Invitation Pydantic Schemas

**Files:**
- Create: `services/core-api/app/schemas/invitation.py`
- Modify: `services/core-api/app/schemas/__init__.py`

**Step 1: Write the schemas**

Create `services/core-api/app/schemas/invitation.py`:

```python
"""Pydantic schemas for invitations."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class InvitationCreate(BaseModel):
    """Schema for creating an invitation."""

    email: EmailStr = Field(..., description="Email address to invite")
    role: str = Field(
        default="advocate",
        pattern="^(creator|admin|advocate|admirer)$",
        description="Role to grant upon acceptance",
    )


class InvitationResponse(BaseModel):
    """Schema for invitation response."""

    id: UUID
    legacy_id: UUID
    email: str
    role: str
    invited_by: UUID
    inviter_name: str | None = None
    inviter_email: str | None = None
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    status: str  # pending, accepted, expired, revoked

    model_config = {"from_attributes": True}


class InvitationPreview(BaseModel):
    """Schema for invitation preview (shown to invitee before accepting)."""

    legacy_id: UUID
    legacy_name: str
    legacy_biography: str | None = None
    legacy_profile_image_url: str | None = None
    inviter_name: str | None = None
    role: str
    expires_at: datetime
    status: str


class InvitationAcceptResponse(BaseModel):
    """Schema for successful invitation acceptance."""

    message: str
    legacy_id: UUID
    role: str
```

**Step 2: Update schemas __init__.py**

Modify `services/core-api/app/schemas/__init__.py` to add:

```python
from .invitation import (
    InvitationCreate,
    InvitationResponse,
    InvitationPreview,
    InvitationAcceptResponse,
)
```

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/
git commit -m "feat(schemas): add invitation Pydantic schemas

- InvitationCreate for sending invites
- InvitationResponse for listing invites
- InvitationPreview for accept page
- InvitationAcceptResponse for accept confirmation"
```

---

## Phase 4: Email Service

### Task 5: Create Email Service with SES Integration

**Files:**
- Create: `services/core-api/app/services/email.py`
- Modify: `services/core-api/app/config.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/test_email_service.py`:

```python
"""Tests for email service."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.email import send_invitation_email, EmailService


class TestEmailService:
    """Tests for email service."""

    @pytest.mark.asyncio
    async def test_send_invitation_email_local_mode(self, caplog):
        """Test that email logs in local mode instead of sending."""
        with patch("app.services.email.get_settings") as mock_settings:
            mock_settings.return_value.ses_from_email = None  # Local mode
            mock_settings.return_value.app_url = "http://localhost:5173"

            result = await send_invitation_email(
                to_email="invitee@example.com",
                inviter_name="John Doe",
                legacy_name="Mom's Legacy",
                role="advocate",
                token="test_token_123",
            )

            assert result is True
            assert "Would send invitation email" in caplog.text

    @pytest.mark.asyncio
    async def test_send_invitation_email_ses_mode(self):
        """Test that email sends via SES when configured."""
        mock_ses = MagicMock()
        mock_ses.send_email = MagicMock(return_value={"MessageId": "test123"})

        with patch("app.services.email.get_settings") as mock_settings:
            mock_settings.return_value.ses_from_email = "noreply@mosaiclife.com"
            mock_settings.return_value.ses_region = "us-east-1"
            mock_settings.return_value.app_url = "https://app.mosaiclife.com"

            with patch("boto3.client", return_value=mock_ses):
                result = await send_invitation_email(
                    to_email="invitee@example.com",
                    inviter_name="John Doe",
                    legacy_name="Mom's Legacy",
                    role="advocate",
                    token="test_token_123",
                )

                assert result is True
                mock_ses.send_email.assert_called_once()
```

**Step 2: Run test to verify it fails**

Run:
```bash
pytest tests/test_email_service.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.email'`

**Step 3: Add config settings**

Modify `services/core-api/app/config.py` to add:

```python
# Add to Settings class
ses_from_email: str | None = None
ses_region: str = "us-east-1"
app_url: str = "http://localhost:5173"
```

**Step 4: Write the email service**

Create `services/core-api/app/services/email.py`:

```python
"""Email service for sending emails via SES."""
import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from ..config import get_settings

logger = logging.getLogger(__name__)


def _build_invitation_email(
    inviter_name: str,
    legacy_name: str,
    role: str,
    invite_url: str,
) -> tuple[str, str, str]:
    """Build invitation email content.

    Returns:
        Tuple of (subject, html_body, text_body)
    """
    subject = f"You're invited to join {legacy_name} on Mosaic Life"

    role_description = {
        "creator": "a creator with full control",
        "admin": "an admin who can manage members and content",
        "advocate": "an advocate who can contribute stories and media",
        "admirer": "an admirer who can view stories and media",
    }.get(role, "a member")

    text_body = f"""Hi,

{inviter_name} has invited you to join "{legacy_name}" as {role_description} on Mosaic Life.

Mosaic Life is a platform for creating and preserving memorial stories and memories of loved ones.

Click the link below to view this legacy and accept the invitation:

{invite_url}

This invitation expires in 7 days.

---
Mosaic Life
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .button {{ display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <p>Hi,</p>

        <p><strong>{inviter_name}</strong> has invited you to join "<strong>{legacy_name}</strong>" as {role_description} on Mosaic Life.</p>

        <p>Mosaic Life is a platform for creating and preserving memorial stories and memories of loved ones.</p>

        <p><a href="{invite_url}" class="button">View Invitation</a></p>

        <p>Or copy and paste this link: {invite_url}</p>

        <p>This invitation expires in 7 days.</p>

        <div class="footer">
            <p>Mosaic Life</p>
        </div>
    </div>
</body>
</html>
"""

    return subject, html_body, text_body


async def send_invitation_email(
    to_email: str,
    inviter_name: str,
    legacy_name: str,
    role: str,
    token: str,
) -> bool:
    """Send invitation email.

    Args:
        to_email: Recipient email address
        inviter_name: Name of the person sending the invite
        legacy_name: Name of the legacy being invited to
        role: Role being offered
        token: Invitation token for the URL

    Returns:
        True if sent successfully, False otherwise
    """
    settings = get_settings()
    invite_url = f"{settings.app_url}/invite/{token}"

    subject, html_body, text_body = _build_invitation_email(
        inviter_name=inviter_name,
        legacy_name=legacy_name,
        role=role,
        invite_url=invite_url,
    )

    # Local development mode - just log
    if not settings.ses_from_email:
        logger.info(
            "Would send invitation email",
            extra={
                "to_email": to_email,
                "subject": subject,
                "invite_url": invite_url,
            },
        )
        print(f"\n{'='*60}")
        print(f"INVITATION EMAIL (local mode - not sent)")
        print(f"{'='*60}")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Invite URL: {invite_url}")
        print(f"{'='*60}\n")
        return True

    # Production mode - send via SES
    try:
        ses_client = boto3.client("ses", region_name=settings.ses_region)

        response = ses_client.send_email(
            Source=settings.ses_from_email,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text_body, "Charset": "UTF-8"},
                    "Html": {"Data": html_body, "Charset": "UTF-8"},
                },
            },
        )

        logger.info(
            "Invitation email sent",
            extra={
                "to_email": to_email,
                "message_id": response.get("MessageId"),
            },
        )
        return True

    except ClientError as e:
        logger.error(
            "Failed to send invitation email",
            extra={
                "to_email": to_email,
                "error": str(e),
            },
        )
        return False
```

**Step 5: Run test to verify it passes**

Run:
```bash
pytest tests/test_email_service.py -v
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add services/core-api/app/services/email.py services/core-api/app/config.py services/core-api/tests/test_email_service.py
git commit -m "feat(services): add email service with SES integration

- send_invitation_email() function
- HTML and text email templates
- Local dev mode logs instead of sending
- SES integration for production"
```

---

## Phase 5: Invitation Service

### Task 6: Create Invitation Service

**Files:**
- Create: `services/core-api/app/services/invitation.py`

**Step 1: Write the failing tests**

Create `services/core-api/tests/test_invitation_service.py`:

```python
"""Tests for invitation service."""
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from unittest.mock import patch, AsyncMock

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.models.invitation import Invitation
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from app.schemas.invitation import InvitationCreate
from app.services.invitation import (
    create_invitation,
    get_invitation_by_token,
    accept_invitation,
    revoke_invitation,
    list_pending_invitations,
)


class TestCreateInvitation:
    """Tests for creating invitations."""

    @pytest.mark.asyncio
    async def test_create_invitation_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful invitation creation."""
        with patch("app.services.invitation.send_invitation_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True

            invitation = await create_invitation(
                db=db_session,
                legacy_id=test_legacy.id,
                inviter_id=test_user.id,
                data=InvitationCreate(email="invitee@example.com", role="advocate"),
            )

            assert invitation.email == "invitee@example.com"
            assert invitation.role == "advocate"
            assert invitation.invited_by == test_user.id
            assert invitation.legacy_id == test_legacy.id
            assert invitation.token is not None
            assert len(invitation.token) == 64
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_invitation_invalid_role_for_inviter(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that advocate cannot invite admin."""
        # Change test_user's role to advocate
        member = await db_session.get(
            LegacyMember,
            {"legacy_id": test_legacy.id, "user_id": test_user.id},
        )
        member.role = "advocate"
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await create_invitation(
                db=db_session,
                legacy_id=test_legacy.id,
                inviter_id=test_user.id,
                data=InvitationCreate(email="invitee@example.com", role="admin"),
            )

        assert exc.value.status_code == 403
        assert "Cannot invite at this role level" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_create_invitation_duplicate_pending(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that duplicate pending invitation is rejected."""
        with patch("app.services.invitation.send_invitation_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True

            # First invitation
            await create_invitation(
                db=db_session,
                legacy_id=test_legacy.id,
                inviter_id=test_user.id,
                data=InvitationCreate(email="invitee@example.com", role="advocate"),
            )

            # Duplicate
            with pytest.raises(HTTPException) as exc:
                await create_invitation(
                    db=db_session,
                    legacy_id=test_legacy.id,
                    inviter_id=test_user.id,
                    data=InvitationCreate(email="invitee@example.com", role="advocate"),
                )

            assert exc.value.status_code == 400
            assert "pending invitation" in str(exc.value.detail).lower()


class TestAcceptInvitation:
    """Tests for accepting invitations."""

    @pytest.mark.asyncio
    async def test_accept_invitation_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful invitation acceptance."""
        # Create invitation for a different email (simulating new user)
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="newuser@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="accept_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        # Create new user to accept
        new_user = User(
            email="newuser@example.com",
            google_id="google_new",
            name="New User",
        )
        db_session.add(new_user)
        await db_session.commit()
        await db_session.refresh(new_user)

        result = await accept_invitation(
            db=db_session,
            token="accept_test_token",
            user_id=new_user.id,
        )

        assert result.legacy_id == test_legacy.id
        assert result.role == "advocate"

        # Verify membership was created
        member = await db_session.get(
            LegacyMember,
            {"legacy_id": test_legacy.id, "user_id": new_user.id},
        )
        assert member is not None
        assert member.role == "advocate"

    @pytest.mark.asyncio
    async def test_accept_invitation_expired(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that expired invitation cannot be accepted."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="expired@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="expired_token",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),  # Expired
        )
        db_session.add(invitation)
        await db_session.commit()

        new_user = User(
            email="expired@example.com",
            google_id="google_expired",
            name="Expired User",
        )
        db_session.add(new_user)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await accept_invitation(
                db=db_session,
                token="expired_token",
                user_id=new_user.id,
            )

        assert exc.value.status_code == 410
        assert "expired" in str(exc.value.detail).lower()
```

**Step 2: Run test to verify it fails**

Run:
```bash
pytest tests/test_invitation_service.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.invitation'`

**Step 3: Write the invitation service**

Create `services/core-api/app/services/invitation.py`:

```python
"""Invitation service for managing legacy member invitations."""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.invitation import Invitation
from ..models.legacy import Legacy, LegacyMember
from ..models.user import User
from ..schemas.invitation import (
    InvitationCreate,
    InvitationResponse,
    InvitationPreview,
    InvitationAcceptResponse,
)
from .email import send_invitation_email
from .legacy import check_legacy_access, can_invite_role, ROLE_LEVELS

logger = logging.getLogger(__name__)

INVITATION_EXPIRY_DAYS = 7


def _generate_token() -> str:
    """Generate a secure random token for invitation URLs."""
    return secrets.token_urlsafe(48)[:64]


async def create_invitation(
    db: AsyncSession,
    legacy_id: UUID,
    inviter_id: UUID,
    data: InvitationCreate,
) -> InvitationResponse:
    """Create and send an invitation.

    Args:
        db: Database session
        legacy_id: Legacy to invite to
        inviter_id: User sending the invitation
        data: Invitation details (email, role)

    Returns:
        Created invitation

    Raises:
        HTTPException: If inviter lacks permission or duplicate invitation exists
    """
    # Check inviter has access and get their role
    inviter_member = await check_legacy_access(db, inviter_id, legacy_id)

    # Check inviter can invite at this role level
    if not can_invite_role(inviter_member.role, data.role):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot invite at this role level. Your role ({inviter_member.role}) "
                   f"cannot invite {data.role}s.",
        )

    # Check for existing pending invitation
    existing = await db.execute(
        select(Invitation).where(
            and_(
                Invitation.legacy_id == legacy_id,
                Invitation.email == data.email,
                Invitation.accepted_at.is_(None),
                Invitation.revoked_at.is_(None),
                Invitation.expires_at > datetime.now(timezone.utc),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="A pending invitation already exists for this email.",
        )

    # Check if user is already a member
    existing_user = await db.execute(
        select(User).where(User.email == data.email)
    )
    user = existing_user.scalar_one_or_none()
    if user:
        existing_member = await db.execute(
            select(LegacyMember).where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.user_id == user.id,
                )
            )
        )
        if existing_member.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="This person is already a member of this legacy.",
            )

    # Get legacy and inviter details for email
    legacy = await db.get(Legacy, legacy_id)
    inviter = await db.get(User, inviter_id)

    # Create invitation
    invitation = Invitation(
        legacy_id=legacy_id,
        email=data.email,
        role=data.role,
        invited_by=inviter_id,
        token=_generate_token(),
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITATION_EXPIRY_DAYS),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    # Send email (don't fail if email fails)
    await send_invitation_email(
        to_email=data.email,
        inviter_name=inviter.name or inviter.email,
        legacy_name=legacy.name,
        role=data.role,
        token=invitation.token,
    )

    logger.info(
        "invitation.created",
        extra={
            "invitation_id": str(invitation.id),
            "legacy_id": str(legacy_id),
            "inviter_id": str(inviter_id),
            "invitee_email": data.email,
            "role": data.role,
        },
    )

    return InvitationResponse(
        id=invitation.id,
        legacy_id=invitation.legacy_id,
        email=invitation.email,
        role=invitation.role,
        invited_by=invitation.invited_by,
        inviter_name=inviter.name,
        inviter_email=inviter.email,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        accepted_at=invitation.accepted_at,
        revoked_at=invitation.revoked_at,
        status=invitation.status,
    )


async def get_invitation_by_token(
    db: AsyncSession,
    token: str,
) -> InvitationPreview:
    """Get invitation details for preview page.

    Args:
        db: Database session
        token: Invitation token

    Returns:
        Invitation preview with legacy details

    Raises:
        HTTPException: If invitation not found or invalid
    """
    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.legacy), selectinload(Invitation.inviter))
        .where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if invitation.accepted_at:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")

    if invitation.revoked_at:
        raise HTTPException(status_code=410, detail="This invitation has been revoked.")

    if invitation.is_expired:
        raise HTTPException(status_code=410, detail="This invitation has expired.")

    legacy = invitation.legacy
    inviter = invitation.inviter

    # TODO: Generate profile image URL if exists
    profile_image_url = None

    return InvitationPreview(
        legacy_id=legacy.id,
        legacy_name=legacy.name,
        legacy_biography=legacy.biography,
        legacy_profile_image_url=profile_image_url,
        inviter_name=inviter.name if inviter else None,
        role=invitation.role,
        expires_at=invitation.expires_at,
        status=invitation.status,
    )


async def accept_invitation(
    db: AsyncSession,
    token: str,
    user_id: UUID,
) -> InvitationAcceptResponse:
    """Accept an invitation and become a member.

    Args:
        db: Database session
        token: Invitation token
        user_id: User accepting the invitation

    Returns:
        Acceptance confirmation with legacy ID and role

    Raises:
        HTTPException: If invitation invalid or user already a member
    """
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if invitation.accepted_at:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")

    if invitation.revoked_at:
        raise HTTPException(status_code=410, detail="This invitation has been revoked.")

    if invitation.is_expired:
        raise HTTPException(status_code=410, detail="This invitation has expired.")

    # Check user isn't already a member
    existing = await db.execute(
        select(LegacyMember).where(
            and_(
                LegacyMember.legacy_id == invitation.legacy_id,
                LegacyMember.user_id == user_id,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="You are already a member of this legacy.",
        )

    # Create membership
    member = LegacyMember(
        legacy_id=invitation.legacy_id,
        user_id=user_id,
        role=invitation.role,
    )
    db.add(member)

    # Mark invitation as accepted
    invitation.accepted_at = datetime.now(timezone.utc)

    await db.commit()

    logger.info(
        "invitation.accepted",
        extra={
            "invitation_id": str(invitation.id),
            "legacy_id": str(invitation.legacy_id),
            "user_id": str(user_id),
            "role": invitation.role,
        },
    )

    return InvitationAcceptResponse(
        message="Welcome! You are now a member of this legacy.",
        legacy_id=invitation.legacy_id,
        role=invitation.role,
    )


async def revoke_invitation(
    db: AsyncSession,
    legacy_id: UUID,
    invitation_id: UUID,
    revoker_id: UUID,
) -> None:
    """Revoke a pending invitation.

    Args:
        db: Database session
        legacy_id: Legacy the invitation belongs to
        invitation_id: Invitation to revoke
        revoker_id: User revoking the invitation

    Raises:
        HTTPException: If revoker lacks permission or invitation not found
    """
    # Check revoker has permission (creator or admin)
    revoker_member = await check_legacy_access(db, revoker_id, legacy_id)
    if revoker_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can revoke invitations.",
        )

    result = await db.execute(
        select(Invitation).where(
            and_(
                Invitation.id == invitation_id,
                Invitation.legacy_id == legacy_id,
            )
        )
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if not invitation.is_pending:
        raise HTTPException(status_code=400, detail="This invitation is no longer pending.")

    invitation.revoked_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(
        "invitation.revoked",
        extra={
            "invitation_id": str(invitation_id),
            "legacy_id": str(legacy_id),
            "revoker_id": str(revoker_id),
        },
    )


async def list_pending_invitations(
    db: AsyncSession,
    legacy_id: UUID,
    requester_id: UUID,
) -> list[InvitationResponse]:
    """List pending invitations for a legacy.

    Args:
        db: Database session
        legacy_id: Legacy to list invitations for
        requester_id: User requesting the list

    Returns:
        List of pending invitations

    Raises:
        HTTPException: If requester lacks permission
    """
    # Check requester has permission (creator or admin)
    requester_member = await check_legacy_access(db, requester_id, legacy_id)
    if requester_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can view pending invitations.",
        )

    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.inviter))
        .where(
            and_(
                Invitation.legacy_id == legacy_id,
                Invitation.accepted_at.is_(None),
                Invitation.revoked_at.is_(None),
                Invitation.expires_at > datetime.now(timezone.utc),
            )
        )
        .order_by(Invitation.created_at.desc())
    )
    invitations = result.scalars().all()

    return [
        InvitationResponse(
            id=inv.id,
            legacy_id=inv.legacy_id,
            email=inv.email,
            role=inv.role,
            invited_by=inv.invited_by,
            inviter_name=inv.inviter.name if inv.inviter else None,
            inviter_email=inv.inviter.email if inv.inviter else None,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
            status=inv.status,
        )
        for inv in invitations
    ]
```

**Step 4: Run test to verify it passes**

Run:
```bash
pytest tests/test_invitation_service.py -v
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/services/invitation.py services/core-api/tests/test_invitation_service.py
git commit -m "feat(services): add invitation service

- create_invitation() with permission checks
- get_invitation_by_token() for preview page
- accept_invitation() to become member
- revoke_invitation() for admins
- list_pending_invitations() for admin view"
```

---

## Phase 6: API Routes

### Task 7: Create Invitation API Routes

**Files:**
- Create: `services/core-api/app/routes/invitation.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Write the failing tests**

Create `services/core-api/tests/test_invitation_api.py`:

```python
"""Tests for invitation API endpoints."""
import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invitation import Invitation
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User


class TestSendInvitation:
    """Tests for POST /api/legacies/{id}/invitations."""

    @pytest.mark.asyncio
    async def test_send_invitation_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test successful invitation sending."""
        response = await client.post(
            f"/api/legacies/{test_legacy.id}/invitations",
            json={"email": "invitee@example.com", "role": "advocate"},
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "invitee@example.com"
        assert data["role"] == "advocate"
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_send_invitation_unauthorized(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Test invitation without auth."""
        response = await client.post(
            f"/api/legacies/{test_legacy.id}/invitations",
            json={"email": "invitee@example.com", "role": "advocate"},
        )

        assert response.status_code == 401


class TestListInvitations:
    """Tests for GET /api/legacies/{id}/invitations."""

    @pytest.mark.asyncio
    async def test_list_invitations_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_user: User,
        db_session: AsyncSession,
    ):
        """Test listing pending invitations."""
        # Create an invitation
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="pending@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="list_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        response = await client.get(
            f"/api/legacies/{test_legacy.id}/invitations",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["email"] == "pending@example.com"


class TestAcceptInvitation:
    """Tests for POST /api/invitations/{token}/accept."""

    @pytest.mark.asyncio
    async def test_accept_invitation_success(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_legacy: Legacy,
        test_user: User,
    ):
        """Test successful invitation acceptance."""
        # Create new user
        new_user = User(
            email="accepter@example.com",
            google_id="google_accepter",
            name="Accepter",
        )
        db_session.add(new_user)
        await db_session.commit()

        # Create invitation for new user
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="accepter@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="accept_api_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        # Create auth headers for new user
        from tests.conftest import create_auth_headers
        new_auth_headers = await create_auth_headers(new_user)

        response = await client.post(
            "/api/invitations/accept_api_test_token/accept",
            headers=new_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["legacy_id"] == str(test_legacy.id)
        assert data["role"] == "advocate"


class TestGetInvitationPreview:
    """Tests for GET /api/invitations/{token}."""

    @pytest.mark.asyncio
    async def test_get_invitation_preview(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_legacy: Legacy,
        test_user: User,
    ):
        """Test getting invitation preview."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="preview@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="preview_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        response = await client.get(
            "/api/invitations/preview_test_token",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["legacy_name"] == test_legacy.name
        assert data["role"] == "advocate"
        assert data["status"] == "pending"
```

**Step 2: Run test to verify it fails**

Run:
```bash
pytest tests/test_invitation_api.py -v
```

Expected: FAIL with 404 (routes not registered).

**Step 3: Write the invitation routes**

Create `services/core-api/app/routes/invitation.py`:

```python
"""API routes for invitations."""
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.invitation import (
    InvitationCreate,
    InvitationResponse,
    InvitationPreview,
    InvitationAcceptResponse,
)
from ..services import invitation as invitation_service

router = APIRouter(tags=["invitations"])


# Legacy-scoped invitation routes
legacy_router = APIRouter(prefix="/api/legacies/{legacy_id}/invitations")


@legacy_router.post(
    "",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send invitation",
)
async def send_invitation(
    legacy_id: UUID,
    data: InvitationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InvitationResponse:
    """Send an invitation to join a legacy.

    The inviter must be a member with sufficient permissions to invite
    at the requested role level.
    """
    session = require_auth(request)
    return await invitation_service.create_invitation(
        db=db,
        legacy_id=legacy_id,
        inviter_id=session.user_id,
        data=data,
    )


@legacy_router.get(
    "",
    response_model=list[InvitationResponse],
    summary="List pending invitations",
)
async def list_invitations(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[InvitationResponse]:
    """List pending invitations for a legacy.

    Only creators and admins can view pending invitations.
    """
    session = require_auth(request)
    return await invitation_service.list_pending_invitations(
        db=db,
        legacy_id=legacy_id,
        requester_id=session.user_id,
    )


@legacy_router.delete(
    "/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke invitation",
)
async def revoke_invitation(
    legacy_id: UUID,
    invitation_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke a pending invitation.

    Only creators and admins can revoke invitations.
    """
    session = require_auth(request)
    await invitation_service.revoke_invitation(
        db=db,
        legacy_id=legacy_id,
        invitation_id=invitation_id,
        revoker_id=session.user_id,
    )


# Token-based invitation routes (for accepting)
token_router = APIRouter(prefix="/api/invitations")


@token_router.get(
    "/{token}",
    response_model=InvitationPreview,
    summary="Get invitation preview",
)
async def get_invitation_preview(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InvitationPreview:
    """Get invitation details for preview page.

    Requires authentication to view the preview.
    """
    require_auth(request)  # Must be logged in to view
    return await invitation_service.get_invitation_by_token(db=db, token=token)


@token_router.post(
    "/{token}/accept",
    response_model=InvitationAcceptResponse,
    summary="Accept invitation",
)
async def accept_invitation(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InvitationAcceptResponse:
    """Accept an invitation and become a member."""
    session = require_auth(request)
    return await invitation_service.accept_invitation(
        db=db,
        token=token,
        user_id=session.user_id,
    )


# Combine routers
router.include_router(legacy_router)
router.include_router(token_router)
```

**Step 4: Register routes in main.py**

Modify `services/core-api/app/main.py` to add:

```python
from .routes.invitation import router as invitation_router

# Add after other router includes
app.include_router(invitation_router)
```

**Step 5: Run test to verify it passes**

Run:
```bash
pytest tests/test_invitation_api.py -v
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add services/core-api/app/routes/invitation.py services/core-api/app/main.py services/core-api/tests/test_invitation_api.py
git commit -m "feat(api): add invitation API endpoints

- POST /api/legacies/{id}/invitations - send invitation
- GET /api/legacies/{id}/invitations - list pending
- DELETE /api/legacies/{id}/invitations/{id} - revoke
- GET /api/invitations/{token} - preview
- POST /api/invitations/{token}/accept - accept"
```

---

## Phase 7: Member Management API

### Task 8: Add Member Management Endpoints

**Files:**
- Modify: `services/core-api/app/routes/legacy.py`
- Create: `services/core-api/app/services/member.py`

**Step 1: Write the failing tests**

Add to `services/core-api/tests/test_legacy_api.py`:

```python
class TestMemberManagement:
    """Tests for member management endpoints."""

    @pytest.mark.asyncio
    async def test_list_members(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test listing legacy members."""
        response = await client.get(
            f"/api/legacies/{test_legacy.id}/members",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1  # At least the creator

    @pytest.mark.asyncio
    async def test_change_member_role(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        db_session: AsyncSession,
    ):
        """Test changing a member's role."""
        # Add another member
        other_user = User(
            email="other@example.com",
            google_id="google_other",
            name="Other User",
        )
        db_session.add(other_user)
        await db_session.commit()

        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=other_user.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/members/{other_user.id}",
            json={"role": "admin"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "admin"

    @pytest.mark.asyncio
    async def test_remove_member(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        db_session: AsyncSession,
    ):
        """Test removing a member."""
        other_user = User(
            email="removable@example.com",
            google_id="google_removable",
            name="Removable User",
        )
        db_session.add(other_user)
        await db_session.commit()

        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=other_user.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/members/{other_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_leave_legacy(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ):
        """Test leaving a legacy."""
        # Create a non-creator member
        leaving_user = User(
            email="leaving@example.com",
            google_id="google_leaving",
            name="Leaving User",
        )
        db_session.add(leaving_user)
        await db_session.commit()

        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=leaving_user.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        from tests.conftest import create_auth_headers
        leaving_auth = await create_auth_headers(leaving_user)

        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/members/me",
            headers=leaving_auth,
        )

        assert response.status_code == 204
```

**Step 2: Run tests to verify they fail**

Run:
```bash
pytest tests/test_legacy_api.py::TestMemberManagement -v
```

Expected: FAIL with 404 or 405.

**Step 3: Create member service**

Create `services/core-api/app/services/member.py`:

```python
"""Member management service."""
import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.legacy import Legacy, LegacyMember
from ..models.user import User
from .legacy import check_legacy_access, can_manage_role, ROLE_LEVELS

logger = logging.getLogger(__name__)


class MemberResponse:
    """Response schema for member."""
    def __init__(
        self,
        user_id: UUID,
        email: str,
        name: str | None,
        avatar_url: str | None,
        role: str,
        joined_at,
    ):
        self.user_id = user_id
        self.email = email
        self.name = name
        self.avatar_url = avatar_url
        self.role = role
        self.joined_at = joined_at


async def list_members(
    db: AsyncSession,
    legacy_id: UUID,
    requester_id: UUID,
) -> list[dict]:
    """List all members of a legacy.

    All members can view the member list.
    """
    # Verify requester is a member
    await check_legacy_access(db, requester_id, legacy_id)

    result = await db.execute(
        select(LegacyMember, User)
        .join(User, LegacyMember.user_id == User.id)
        .where(LegacyMember.legacy_id == legacy_id)
        .order_by(
            # Sort by role level descending, then join date
            func.case(
                (LegacyMember.role == "creator", 4),
                (LegacyMember.role == "admin", 3),
                (LegacyMember.role == "advocate", 2),
                (LegacyMember.role == "admirer", 1),
                else_=0,
            ).desc(),
            LegacyMember.joined_at.asc(),
        )
    )

    members = []
    for member, user in result:
        members.append({
            "user_id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "role": member.role,
            "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        })

    return members


async def change_member_role(
    db: AsyncSession,
    legacy_id: UUID,
    target_user_id: UUID,
    new_role: str,
    actor_id: UUID,
) -> dict:
    """Change a member's role.

    Rules:
    - Actor must be creator or admin
    - Actor can only change roles at or below their level
    - Cannot demote someone to a higher role than actor has
    - Last creator cannot be demoted
    """
    # Get actor's membership
    actor_member = await check_legacy_access(db, actor_id, legacy_id)

    if actor_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can change member roles.",
        )

    # Get target's membership
    result = await db.execute(
        select(LegacyMember, User)
        .join(User, LegacyMember.user_id == User.id)
        .where(
            and_(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == target_user_id,
            )
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found.")

    target_member, target_user = row

    # Check actor can manage target's current role
    if not can_manage_role(actor_member.role, target_member.role):
        raise HTTPException(
            status_code=403,
            detail=f"You cannot manage members with role {target_member.role}.",
        )

    # Check actor can assign the new role
    if not can_manage_role(actor_member.role, new_role):
        raise HTTPException(
            status_code=403,
            detail=f"You cannot assign the role {new_role}.",
        )

    # If demoting from creator, check there's another creator
    if target_member.role == "creator" and new_role != "creator":
        creator_count = await db.execute(
            select(func.count()).select_from(LegacyMember).where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.role == "creator",
                )
            )
        )
        if creator_count.scalar() <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last creator. Promote someone else first.",
            )

    target_member.role = new_role
    await db.commit()

    logger.info(
        "member.role_changed",
        extra={
            "legacy_id": str(legacy_id),
            "target_user_id": str(target_user_id),
            "new_role": new_role,
            "actor_id": str(actor_id),
        },
    )

    return {
        "user_id": str(target_user.id),
        "email": target_user.email,
        "name": target_user.name,
        "avatar_url": target_user.avatar_url,
        "role": new_role,
        "joined_at": target_member.joined_at.isoformat() if target_member.joined_at else None,
    }


async def remove_member(
    db: AsyncSession,
    legacy_id: UUID,
    target_user_id: UUID,
    actor_id: UUID,
) -> None:
    """Remove a member from the legacy.

    Rules:
    - Actor must be creator or admin
    - Actor can only remove roles at or below their level
    - Last creator cannot be removed
    """
    actor_member = await check_legacy_access(db, actor_id, legacy_id)

    if actor_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can remove members.",
        )

    result = await db.execute(
        select(LegacyMember).where(
            and_(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == target_user_id,
            )
        )
    )
    target_member = result.scalar_one_or_none()

    if not target_member:
        raise HTTPException(status_code=404, detail="Member not found.")

    if not can_manage_role(actor_member.role, target_member.role):
        raise HTTPException(
            status_code=403,
            detail=f"You cannot remove members with role {target_member.role}.",
        )

    # Check not removing last creator
    if target_member.role == "creator":
        creator_count = await db.execute(
            select(func.count()).select_from(LegacyMember).where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.role == "creator",
                )
            )
        )
        if creator_count.scalar() <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last creator.",
            )

    await db.delete(target_member)
    await db.commit()

    logger.info(
        "member.removed",
        extra={
            "legacy_id": str(legacy_id),
            "target_user_id": str(target_user_id),
            "actor_id": str(actor_id),
        },
    )


async def leave_legacy(
    db: AsyncSession,
    legacy_id: UUID,
    user_id: UUID,
) -> None:
    """Leave a legacy voluntarily.

    The last creator cannot leave.
    """
    result = await db.execute(
        select(LegacyMember).where(
            and_(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == user_id,
            )
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this legacy.")

    # Check not the last creator
    if member.role == "creator":
        creator_count = await db.execute(
            select(func.count()).select_from(LegacyMember).where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.role == "creator",
                )
            )
        )
        if creator_count.scalar() <= 1:
            raise HTTPException(
                status_code=400,
                detail="You are the last creator. Promote someone else before leaving.",
            )

    await db.delete(member)
    await db.commit()

    logger.info(
        "member.left",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )
```

**Step 4: Add routes to legacy.py**

Add to `services/core-api/app/routes/legacy.py`:

```python
from ..services import member as member_service
from pydantic import BaseModel

class RoleUpdate(BaseModel):
    role: str


@router.get(
    "/{legacy_id}/members",
    summary="List legacy members",
)
async def list_members(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all members of a legacy."""
    session = require_auth(request)
    return await member_service.list_members(
        db=db,
        legacy_id=legacy_id,
        requester_id=session.user_id,
    )


@router.patch(
    "/{legacy_id}/members/{user_id}",
    summary="Change member role",
)
async def change_member_role(
    legacy_id: UUID,
    user_id: UUID,
    data: RoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Change a member's role."""
    session = require_auth(request)
    return await member_service.change_member_role(
        db=db,
        legacy_id=legacy_id,
        target_user_id=user_id,
        new_role=data.role,
        actor_id=session.user_id,
    )


@router.delete(
    "/{legacy_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove member",
)
async def remove_member(
    legacy_id: UUID,
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a member from the legacy."""
    session = require_auth(request)
    await member_service.remove_member(
        db=db,
        legacy_id=legacy_id,
        target_user_id=user_id,
        actor_id=session.user_id,
    )


@router.delete(
    "/{legacy_id}/members/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Leave legacy",
)
async def leave_legacy(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Leave a legacy."""
    session = require_auth(request)
    await member_service.leave_legacy(
        db=db,
        legacy_id=legacy_id,
        user_id=session.user_id,
    )
```

**Step 5: Run tests to verify they pass**

Run:
```bash
pytest tests/test_legacy_api.py::TestMemberManagement -v
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add services/core-api/app/services/member.py services/core-api/app/routes/legacy.py services/core-api/tests/test_legacy_api.py
git commit -m "feat(api): add member management endpoints

- GET /api/legacies/{id}/members - list members
- PATCH /api/legacies/{id}/members/{user_id} - change role
- DELETE /api/legacies/{id}/members/{user_id} - remove member
- DELETE /api/legacies/{id}/members/me - leave legacy"
```

---

## Phase 8: Frontend Implementation

### Task 9: Add Invitation API Client Functions

**Files:**
- Create: `apps/web/src/lib/api/invitations.ts`

**Step 1: Write the API functions**

Create `apps/web/src/lib/api/invitations.ts`:

```typescript
import { apiGet, apiPost, apiDelete } from './client';

export interface InvitationCreate {
  email: string;
  role: 'creator' | 'admin' | 'advocate' | 'admirer';
}

export interface InvitationResponse {
  id: string;
  legacy_id: string;
  email: string;
  role: string;
  invited_by: string;
  inviter_name: string | null;
  inviter_email: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

export interface InvitationPreview {
  legacy_id: string;
  legacy_name: string;
  legacy_biography: string | null;
  legacy_profile_image_url: string | null;
  inviter_name: string | null;
  role: string;
  expires_at: string;
  status: string;
}

export interface InvitationAcceptResponse {
  message: string;
  legacy_id: string;
  role: string;
}

export async function sendInvitation(
  legacyId: string,
  data: InvitationCreate
): Promise<InvitationResponse> {
  return apiPost<InvitationResponse>(
    `/api/legacies/${legacyId}/invitations`,
    data
  );
}

export async function listInvitations(
  legacyId: string
): Promise<InvitationResponse[]> {
  return apiGet<InvitationResponse[]>(
    `/api/legacies/${legacyId}/invitations`
  );
}

export async function revokeInvitation(
  legacyId: string,
  invitationId: string
): Promise<void> {
  return apiDelete(`/api/legacies/${legacyId}/invitations/${invitationId}`);
}

export async function getInvitationPreview(
  token: string
): Promise<InvitationPreview> {
  return apiGet<InvitationPreview>(`/api/invitations/${token}`);
}

export async function acceptInvitation(
  token: string
): Promise<InvitationAcceptResponse> {
  return apiPost<InvitationAcceptResponse>(
    `/api/invitations/${token}/accept`,
    {}
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api/invitations.ts
git commit -m "feat(web): add invitation API client functions"
```

---

### Task 10: Add Invitation React Query Hooks

**Files:**
- Create: `apps/web/src/lib/hooks/useInvitations.ts`

**Step 1: Write the hooks**

Create `apps/web/src/lib/hooks/useInvitations.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  sendInvitation,
  listInvitations,
  revokeInvitation,
  getInvitationPreview,
  acceptInvitation,
  type InvitationCreate,
} from '@/lib/api/invitations';
import { legacyKeys } from './useLegacies';

export const invitationKeys = {
  all: ['invitations'] as const,
  list: (legacyId: string) => [...invitationKeys.all, 'list', legacyId] as const,
  preview: (token: string) => [...invitationKeys.all, 'preview', token] as const,
};

export function useInvitations(legacyId: string) {
  return useQuery({
    queryKey: invitationKeys.list(legacyId),
    queryFn: () => listInvitations(legacyId),
  });
}

export function useSendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      data,
    }: {
      legacyId: string;
      data: InvitationCreate;
    }) => sendInvitation(legacyId, data),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(legacyId) });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      invitationId,
    }: {
      legacyId: string;
      invitationId: string;
    }) => revokeInvitation(legacyId, invitationId),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(legacyId) });
    },
  });
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: invitationKeys.preview(token),
    queryFn: () => getInvitationPreview(token),
    retry: false,
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => acceptInvitation(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.lists() });
    },
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/hooks/useInvitations.ts
git commit -m "feat(web): add invitation React Query hooks"
```

---

### Task 11: Add Member Management API and Hooks

**Files:**
- Modify: `apps/web/src/lib/api/legacies.ts`
- Modify: `apps/web/src/lib/hooks/useLegacies.ts`

**Step 1: Add member API functions**

Add to `apps/web/src/lib/api/legacies.ts`:

```typescript
export interface LegacyMember {
  user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: 'creator' | 'admin' | 'advocate' | 'admirer';
  joined_at: string;
}

export async function listMembers(legacyId: string): Promise<LegacyMember[]> {
  return apiGet<LegacyMember[]>(`/api/legacies/${legacyId}/members`);
}

export async function changeMemberRole(
  legacyId: string,
  userId: string,
  role: string
): Promise<LegacyMember> {
  return apiPatch<LegacyMember>(
    `/api/legacies/${legacyId}/members/${userId}`,
    { role }
  );
}

export async function removeMember(
  legacyId: string,
  userId: string
): Promise<void> {
  return apiDelete(`/api/legacies/${legacyId}/members/${userId}`);
}

export async function leaveLegacy(legacyId: string): Promise<void> {
  return apiDelete(`/api/legacies/${legacyId}/members/me`);
}
```

**Step 2: Add member hooks**

Add to `apps/web/src/lib/hooks/useLegacies.ts`:

```typescript
import {
  listMembers,
  changeMemberRole,
  removeMember,
  leaveLegacy,
} from '@/lib/api/legacies';

export const memberKeys = {
  all: ['members'] as const,
  list: (legacyId: string) => [...memberKeys.all, 'list', legacyId] as const,
};

export function useMembers(legacyId: string) {
  return useQuery({
    queryKey: memberKeys.list(legacyId),
    queryFn: () => listMembers(legacyId),
  });
}

export function useChangeMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      userId,
      role,
    }: {
      legacyId: string;
      userId: string;
      role: string;
    }) => changeMemberRole(legacyId, userId, role),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(legacyId) });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      userId,
    }: {
      legacyId: string;
      userId: string;
    }) => removeMember(legacyId, userId),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(legacyId) });
    },
  });
}

export function useLeaveLegacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (legacyId: string) => leaveLegacy(legacyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.lists() });
    },
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api/legacies.ts apps/web/src/lib/hooks/useLegacies.ts
git commit -m "feat(web): add member management API and hooks"
```

---

### Task 12: Create MemberDrawer Component

**Files:**
- Create: `apps/web/src/features/legacy/components/MemberDrawer.tsx`

**Step 1: Write the component**

Create `apps/web/src/features/legacy/components/MemberDrawer.tsx`:

```tsx
import { useState } from 'react';
import { X, UserPlus, MoreVertical, Mail, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  useMembers,
  useChangeMemberRole,
  useRemoveMember,
  useLeaveLegacy,
} from '@/lib/hooks/useLegacies';
import {
  useInvitations,
  useRevokeInvitation,
} from '@/lib/hooks/useInvitations';
import { useAuth } from '@/lib/hooks/useAuth';
import InviteMemberModal from './InviteMemberModal';

interface MemberDrawerProps {
  legacyId: string;
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator',
  admin: 'Admin',
  advocate: 'Advocate',
  admirer: 'Admirer',
};

const ROLE_COLORS: Record<string, string> = {
  creator: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  advocate: 'bg-green-100 text-green-800',
  admirer: 'bg-gray-100 text-gray-800',
};

const ROLE_LEVELS: Record<string, number> = {
  creator: 4,
  admin: 3,
  advocate: 2,
  admirer: 1,
};

export default function MemberDrawer({
  legacyId,
  isOpen,
  onClose,
  currentUserRole,
}: MemberDrawerProps) {
  const { user } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);

  const { data: members = [], isLoading: membersLoading } = useMembers(legacyId);
  const { data: invitations = [], isLoading: invitationsLoading } = useInvitations(legacyId);

  const changeRole = useChangeMemberRole();
  const removeMember = useRemoveMember();
  const leaveLegacy = useLeaveLegacy();
  const revokeInvitation = useRevokeInvitation();

  const canManage = currentUserRole === 'creator' || currentUserRole === 'admin';
  const canInvite = currentUserRole !== 'admirer';
  const currentUserLevel = ROLE_LEVELS[currentUserRole] || 0;

  const handleRoleChange = async (userId: string, newRole: string) => {
    await changeRole.mutateAsync({ legacyId, userId, role: newRole });
  };

  const handleRemoveMember = async (userId: string) => {
    if (confirm('Are you sure you want to remove this member?')) {
      await removeMember.mutateAsync({ legacyId, userId });
    }
  };

  const handleLeaveLegacy = async () => {
    if (confirm('Are you sure you want to leave this legacy?')) {
      await leaveLegacy.mutateAsync(legacyId);
      onClose();
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (confirm('Are you sure you want to revoke this invitation?')) {
      await revokeInvitation.mutateAsync({ legacyId, invitationId });
    }
  };

  const getManageableRoles = () => {
    const roles = ['admirer', 'advocate', 'admin', 'creator'];
    return roles.filter(role => ROLE_LEVELS[role] <= currentUserLevel);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between">
            <SheetTitle>Members</SheetTitle>
            {canInvite && (
              <Button
                size="sm"
                onClick={() => setShowInviteModal(true)}
              >
                <UserPlus className="size-4 mr-2" />
                Invite
              </Button>
            )}
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Members List */}
            <div className="space-y-3">
              {membersLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                members.map((member) => {
                  const isCurrentUser = member.user_id === user?.id;
                  const canManageThis = canManage &&
                    ROLE_LEVELS[member.role] <= currentUserLevel &&
                    !isCurrentUser;

                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      <Avatar className="size-10">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback>
                          {(member.name || member.email).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {member.name || member.email}
                          {isCurrentUser && (
                            <span className="text-muted-foreground ml-1">(you)</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {member.email}
                        </div>
                      </div>

                      {canManageThis ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.user_id, value)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getManageableRoles().map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={ROLE_COLORS[member.role]}>
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      )}

                      {canManageThis && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}

                      {isCurrentUser && currentUserRole !== 'creator' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={handleLeaveLegacy}
                        >
                          Leave
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Pending Invitations */}
            {canManage && invitations.length > 0 && (
              <>
                <Separator />

                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Mail className="size-4" />
                    Pending Invitations
                  </h3>

                  <div className="space-y-3">
                    {invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-dashed"
                      >
                        <Avatar className="size-10">
                          <AvatarFallback>
                            {invitation.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {invitation.email}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            Expires {new Date(invitation.expires_at).toLocaleDateString()}
                          </div>
                        </div>

                        <Badge variant="outline" className={ROLE_COLORS[invitation.role]}>
                          {ROLE_LABELS[invitation.role]}
                        </Badge>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleRevokeInvitation(invitation.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        legacyId={legacyId}
        currentUserRole={currentUserRole}
        onInviteSent={() => setShowInviteModal(false)}
      />
    </>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/legacy/components/MemberDrawer.tsx
git commit -m "feat(web): add MemberDrawer component

- Shows all members with role badges
- Role dropdown for changing roles (creators/admins)
- Remove member action
- Leave legacy action
- Pending invitations section with revoke"
```

---

### Task 13: Create InviteMemberModal Component

**Files:**
- Create: `apps/web/src/features/legacy/components/InviteMemberModal.tsx`

**Step 1: Write the component**

Create `apps/web/src/features/legacy/components/InviteMemberModal.tsx`:

```tsx
import { useState } from 'react';
import { AlertCircle, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSendInvitation } from '@/lib/hooks/useInvitations';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  legacyId: string;
  currentUserRole: string;
  onInviteSent: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator - Full control, can delete legacy',
  admin: 'Admin - Can manage members and content',
  advocate: 'Advocate - Can contribute stories and media',
  admirer: 'Admirer - Can view only',
};

const ROLE_LEVELS: Record<string, number> = {
  creator: 4,
  admin: 3,
  advocate: 2,
  admirer: 1,
};

export default function InviteMemberModal({
  isOpen,
  onClose,
  legacyId,
  currentUserRole,
  onInviteSent,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'creator' | 'admin' | 'advocate' | 'admirer'>('advocate');
  const [error, setError] = useState<string | null>(null);

  const sendInvitation = useSendInvitation();

  const currentUserLevel = ROLE_LEVELS[currentUserRole] || 0;

  const getInvitableRoles = () => {
    const allRoles: Array<'creator' | 'admin' | 'advocate' | 'admirer'> = [
      'admirer',
      'advocate',
      'admin',
      'creator',
    ];
    return allRoles.filter((r) => ROLE_LEVELS[r] <= currentUserLevel);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter an email address.');
      return;
    }

    try {
      await sendInvitation.mutateAsync({
        legacyId,
        data: { email: email.trim(), role },
      });
      setEmail('');
      setRole('advocate');
      onInviteSent();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send invitation. Please try again.');
      }
    }
  };

  const handleClose = () => {
    setEmail('');
    setRole('advocate');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Invite a Member
          </DialogTitle>
          <DialogDescription>
            Send an invitation to join this legacy. They'll receive an email with a link to accept.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="person@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sendInvitation.isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as typeof role)}
              disabled={sendInvitation.isPending}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getInvitableRoles().map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={sendInvitation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!email.trim() || sendInvitation.isPending}>
              {sendInvitation.isPending ? (
                'Sending...'
              ) : (
                <>
                  <Send className="size-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/legacy/components/InviteMemberModal.tsx
git commit -m "feat(web): add InviteMemberModal component

- Email input with validation
- Role selector filtered by user's role level
- Error handling and loading state
- Calls sendInvitation mutation"
```

---

### Task 14: Create InviteAcceptPage

**Files:**
- Create: `apps/web/src/pages/InviteAcceptPage.tsx`
- Modify: `apps/web/src/routes/index.tsx`

**Step 1: Write the page component**

Create `apps/web/src/pages/InviteAcceptPage.tsx`:

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Clock, User, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useInvitationPreview, useAcceptInvitation } from '@/lib/hooks/useInvitations';
import { useAuth } from '@/lib/hooks/useAuth';

const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator',
  admin: 'Admin',
  advocate: 'Advocate',
  admirer: 'Admirer',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  creator: 'Full control including deleting the legacy',
  admin: 'Manage members and all content',
  advocate: 'Contribute stories and media',
  admirer: 'View stories and media',
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
  } = useInvitationPreview(token || '');

  const acceptInvitation = useAcceptInvitation();

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    // Store the current URL to redirect back after login
    sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
    navigate('/login');
    return null;
  }

  const handleAccept = async () => {
    if (!token) return;

    try {
      const result = await acceptInvitation.mutateAsync(token);
      navigate(`/legacies/${result.legacy_id}`);
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleDecline = () => {
    navigate('/');
  };

  if (authLoading || previewLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading invitation...</div>
      </div>
    );
  }

  if (previewError) {
    const errorMessage = previewError instanceof Error
      ? previewError.message
      : 'This invitation is no longer valid.';

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Invitation Invalid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
            <Button onClick={() => navigate('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            {preview.legacy_profile_image_url ? (
              <Avatar className="size-24">
                <AvatarImage src={preview.legacy_profile_image_url} />
                <AvatarFallback className="text-2xl">
                  {preview.legacy_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="size-12 text-primary" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl">{preview.legacy_name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {preview.legacy_biography && (
            <p className="text-muted-foreground text-center line-clamp-3">
              {preview.legacy_biography}
            </p>
          )}

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            {preview.inviter_name && (
              <div className="flex items-center gap-2 text-sm">
                <User className="size-4 text-muted-foreground" />
                <span>
                  <strong>{preview.inviter_name}</strong> invited you
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-muted-foreground" />
              <span>
                You'll join as{' '}
                <Badge variant="secondary">{ROLE_LABELS[preview.role]}</Badge>
              </span>
            </div>

            <div className="text-xs text-muted-foreground">
              {ROLE_DESCRIPTIONS[preview.role]}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3" />
              <span>
                Expires {new Date(preview.expires_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {acceptInvitation.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {acceptInvitation.error instanceof Error
                  ? acceptInvitation.error.message
                  : 'Failed to accept invitation.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={acceptInvitation.isPending}
              className="flex-1"
            >
              <X className="size-4 mr-2" />
              Decline
            </Button>
            <Button
              onClick={handleAccept}
              disabled={acceptInvitation.isPending}
              className="flex-1"
            >
              {acceptInvitation.isPending ? (
                'Joining...'
              ) : (
                <>
                  <Check className="size-4 mr-2" />
                  Accept & Join
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Add route**

Modify `apps/web/src/routes/index.tsx` to add:

```tsx
import InviteAcceptPage from '@/pages/InviteAcceptPage';

// Add to routes array:
{
  path: '/invite/:token',
  element: <InviteAcceptPage />,
}
```

**Step 3: Commit**

```bash
git add apps/web/src/pages/InviteAcceptPage.tsx apps/web/src/routes/index.tsx
git commit -m "feat(web): add InviteAcceptPage

- Shows legacy preview with profile image
- Displays inviter name and invited role
- Accept and decline buttons
- Redirects to login if not authenticated
- Error handling for invalid/expired invites"
```

---

### Task 15: Update LegacyProfile to Show Clickable Member Count

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx`

**Step 1: Update the component**

Modify `apps/web/src/features/legacy/components/LegacyProfile.tsx` to:

1. Import MemberDrawer
2. Add state for drawer visibility
3. Make member count clickable
4. Render the drawer

```tsx
// Add imports
import { useState } from 'react';
import MemberDrawer from './MemberDrawer';

// Inside component, add state:
const [showMemberDrawer, setShowMemberDrawer] = useState(false);

// Find the member count display and make it clickable:
<button
  onClick={() => setShowMemberDrawer(true)}
  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
>
  {legacy.members?.length || 0} members
</button>

// Add the drawer at the end of the component:
<MemberDrawer
  legacyId={legacy.id}
  isOpen={showMemberDrawer}
  onClose={() => setShowMemberDrawer(false)}
  currentUserRole={currentUserRole}
/>
```

**Step 2: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyProfile.tsx
git commit -m "feat(web): make member count clickable to open MemberDrawer"
```

---

## Phase 9: Testing

### Task 16: Add Integration Tests

**Files:**
- Modify: `services/core-api/tests/test_invitation_api.py`
- Create: `apps/web/src/features/legacy/components/MemberDrawer.test.tsx`

**Step 1: Add comprehensive API tests**

Add additional test cases to `services/core-api/tests/test_invitation_api.py` covering:
- Role hierarchy enforcement
- Expiration handling
- Already-member detection
- Last creator protection

**Step 2: Add frontend component tests**

Create tests for MemberDrawer and InviteMemberModal using Vitest and React Testing Library.

**Step 3: Run all tests**

```bash
# Backend
cd /apps/mosaic-life/services/core-api
pytest -v

# Frontend
cd /apps/mosaic-life/apps/web
npm run test
```

**Step 4: Commit**

```bash
git add services/core-api/tests/ apps/web/src/
git commit -m "test: add comprehensive invitation and member management tests"
```

---

## Summary

**Total Tasks:** 16

**Backend Tasks (1-8):**
1. Database migration
2. Invitation model
3. Role constants update
4. Invitation schemas
5. Email service
6. Invitation service
7. Invitation API routes
8. Member management API

**Frontend Tasks (9-15):**
9. Invitation API client
10. Invitation React Query hooks
11. Member management API/hooks
12. MemberDrawer component
13. InviteMemberModal component
14. InviteAcceptPage
15. LegacyProfile update

**Testing (16):**
16. Integration tests

---

Plan complete and saved to `docs/plans/2025-01-29-legacy-member-invitations-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
