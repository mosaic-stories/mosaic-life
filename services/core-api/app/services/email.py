"""Email service for sending emails via SES."""

import logging
from datetime import datetime
from typing import Any

import boto3  # type: ignore[import-untyped]
from botocore.exceptions import ClientError  # type: ignore[import-untyped]

from ..config import get_settings

logger = logging.getLogger(__name__)


def _send_email_via_ses(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    reply_to: str | None = None,
) -> bool:
    """Send email using SES when configured, otherwise log in local mode."""
    settings = get_settings()

    if not settings.ses_from_email:
        # Local mode: print to console for developer visibility
        print("\n" + "=" * 60)
        print("INVITATION EMAIL (local mode - not sent)")
        print("=" * 60)
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        if reply_to:
            print(f"Reply-To: {reply_to}")
        print("\nText Body:")
        print(text_body)
        print("=" * 60 + "\n")

        logger.info(
            "email.would_send",
            extra={
                "to_email": to_email,
                "subject": subject,
                "reply_to": reply_to,
            },
        )
        return True

    try:
        ses_client = boto3.client("ses", region_name=settings.ses_region)
        message_body = {
            "Text": {"Data": text_body, "Charset": "UTF-8"},
        }
        if html_body:
            message_body["Html"] = {"Data": html_body, "Charset": "UTF-8"}

        payload: dict[str, Any] = {
            "Source": settings.ses_from_email,
            "Destination": {"ToAddresses": [to_email]},
            "Message": {
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": message_body,
            },
        }
        if reply_to:
            payload["ReplyToAddresses"] = [reply_to]

        response = ses_client.send_email(**payload)
        logger.info(
            "email.sent",
            extra={
                "to_email": to_email,
                "subject": subject,
                "message_id": response.get("MessageId"),
            },
        )
        return True
    except ClientError as e:
        logger.error(
            "email.send_failed",
            extra={"to_email": to_email, "subject": subject, "error": str(e)},
        )
        return False


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

    return _send_email_via_ses(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


async def send_support_request_email(
    *,
    from_user_email: str,
    category_display: str,
    subject: str,
    message_body: str,
    context_block: str,
) -> bool:
    """Send support request email to support inbox."""
    settings = get_settings()
    full_subject = f"[{category_display}] {subject}"
    body = (
        f"Subject: {full_subject}\n\n"
        f"From: {from_user_email}\n"
        f"Category: {category_display}\n\n"
        f"Message:\n{message_body}\n\n"
        f"--- Context ---\n{context_block}\n"
    )
    return _send_email_via_ses(
        to_email=settings.support_email_to,
        subject=full_subject,
        text_body=body,
        reply_to=from_user_email,
    )


async def send_data_export_email(
    *,
    to_email: str,
    download_url: str,
    expires_at: datetime,
) -> bool:
    """Send data export download link email to the user."""
    subject = "Your Mosaic Life data export is ready"
    text_body = (
        "Your account data export has been prepared.\n\n"
        f"Download link: {download_url}\n"
        f"Expires at: {expires_at.isoformat()}\n\n"
        "If you did not request this export, please contact support immediately."
    )
    return _send_email_via_ses(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
    )
