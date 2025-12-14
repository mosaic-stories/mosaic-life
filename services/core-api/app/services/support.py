"""Service layer for support request operations."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.support_request import SupportRequest
from ..models.user import User
from ..schemas.support import SupportRequestCreate, SupportRequestResponse

logger = logging.getLogger(__name__)


async def create_support_request(
    db: AsyncSession,
    user_id: UUID,
    data: SupportRequestCreate,
) -> SupportRequestResponse:
    """Create a new support request and send email notification."""
    # Get user for email
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise ValueError(f"User {user_id} not found")

    # Create support request record
    support_request = SupportRequest(
        user_id=user_id,
        category=data.category,
        subject=data.subject,
        message=data.message,
        context=data.context.model_dump(),
    )
    db.add(support_request)
    await db.commit()
    await db.refresh(support_request)

    logger.info(
        "support.request.created",
        extra={
            "support_request_id": str(support_request.id),
            "user_id": str(user_id),
            "category": data.category,
        },
    )

    # Send email notification (async, non-blocking)
    await _send_support_email(user, support_request, data)

    return SupportRequestResponse(
        id=support_request.id,
        category=support_request.category,
        subject=support_request.subject,
        status=support_request.status,
        created_at=support_request.created_at,
    )


async def _send_support_email(
    user: User,
    support_request: SupportRequest,
    data: SupportRequestCreate,
) -> None:
    """Send support request email notification.

    TODO: Integrate with AWS SES for production email sending.
    For now, just log the email content.
    """
    category_display = data.category.replace("_", " ").title()

    email_body = f"""
Subject: [{category_display}] {data.subject}

From: {user.email} (User ID: {user.id})
Category: {category_display}
Submitted: {support_request.created_at.isoformat()}

Message:
{data.message}

--- Context ---
Page: {data.context.page_url}
Legacy ID: {data.context.legacy_id or "N/A"}
Browser: {data.context.user_agent}
Session Duration: {data.context.session_duration_seconds or "N/A"} seconds
Errors: {", ".join(data.context.recent_errors) if data.context.recent_errors else "None"}
"""

    logger.info(
        "support.email.would_send",
        extra={
            "to": "support@mosaiclife.me",
            "from_user": user.email,
            "subject": f"[{category_display}] {data.subject}",
            "body_preview": email_body[:500],
        },
    )

    # TODO: Replace with actual SES integration:
    # from ..adapters.email import send_email
    # await send_email(
    #     to="support@mosaiclife.me",
    #     subject=f"[{category_display}] {data.subject}",
    #     body=email_body,
    #     reply_to=user.email,
    # )
