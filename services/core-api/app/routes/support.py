"""Routes for support requests."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.support import SupportRequestCreate, SupportRequestResponse
from ..services import support as support_service

router = APIRouter(prefix="/api/support", tags=["support"])


@router.post("/request", response_model=SupportRequestResponse)
async def create_support_request(
    data: SupportRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SupportRequestResponse:
    """Create a new support request.

    Captures user context and sends notification to support team.
    Rate limited to 5 requests per hour per user.
    """
    session = require_auth(request)

    try:
        return await support_service.create_support_request(db, session.user_id, data)
    except support_service.SupportRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
