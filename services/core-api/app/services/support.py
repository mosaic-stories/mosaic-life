"""Service layer for support request operations."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.support_request import SupportRequest
from ..models.user import User
from ..schemas.support import SupportRequestCreate, SupportRequestResponse
from .email import send_support_request_email

logger = logging.getLogger(__name__)

RATE_LIMIT_REQUESTS = 5
RATE_LIMIT_WINDOW = timedelta(hours=1)


class SupportRateLimitError(ValueError):
    """Raised when a user exceeds support submission limits."""


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

    # Enforce per-user hourly rate limit
    await enforce_support_rate_limit(db, user_id)

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
    """Send support request email notification."""
    category_display = data.category.replace("_", " ").title()

    context_block = (
        f"User ID: {user.id}\n"
        f"Submitted: {support_request.created_at.isoformat()}\n"
        f"Page: {data.context.page_url}\n"
        f"Legacy ID: {data.context.legacy_id or 'N/A'}\n"
        f"Browser: {data.context.user_agent}\n"
        f"Session Duration: {data.context.session_duration_seconds or 'N/A'} seconds\n"
        f"Errors: {', '.join(data.context.recent_errors) if data.context.recent_errors else 'None'}"
    )

    await send_support_request_email(
        from_user_email=user.email,
        category_display=category_display,
        subject=data.subject,
        message_body=data.message,
        context_block=context_block,
    )


async def enforce_support_rate_limit(db: AsyncSession, user_id: UUID) -> None:
    """Limit support request creation to 5 requests per user per hour."""
    cutoff = datetime.now(timezone.utc) - RATE_LIMIT_WINDOW
    result = await db.execute(
        select(func.count(SupportRequest.id)).where(
            SupportRequest.user_id == user_id,
            SupportRequest.created_at >= cutoff,
        )
    )
    request_count = result.scalar() or 0
    if request_count >= RATE_LIMIT_REQUESTS:
        raise SupportRateLimitError("Support request rate limit exceeded")
