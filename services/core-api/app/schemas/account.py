"""Schemas for account management flows."""

from datetime import datetime

from pydantic import BaseModel, Field


class DataExportRequestResponse(BaseModel):
    """Response after requesting a data export."""

    status: str
    download_url: str
    expires_at: datetime


class AccountDeletionTokenResponse(BaseModel):
    """Response containing account deletion confirmation token."""

    token: str
    expires_at: datetime


class DeleteAccountRequest(BaseModel):
    """Request body for account deletion."""

    confirmation_text: str = Field(..., min_length=1, max_length=20)
    confirmation_token: str = Field(..., min_length=1)


class ActionStatusResponse(BaseModel):
    """Simple status response for mutating actions."""

    status: str
