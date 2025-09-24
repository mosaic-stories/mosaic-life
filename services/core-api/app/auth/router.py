from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class MeResponse(BaseModel):
    id: str
    email: str
    name: str | None = None


@router.get("/me", response_model=MeResponse)
def me(req: Request) -> MeResponse:
    # MVP stub: in dev, treat presence of a cookie as authenticated
    user_id = req.cookies.get("session_user_id", "dev-user")
    email = req.cookies.get("session_email", "dev@example.com")
    name = req.cookies.get("session_name", "Dev User")
    return MeResponse(id=user_id, email=email, name=name)

