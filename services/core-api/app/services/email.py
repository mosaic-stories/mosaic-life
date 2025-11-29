"""Email service for sending emails via SES."""

import logging

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
        print(f"\n{'=' * 60}")
        print("INVITATION EMAIL (local mode - not sent)")
        print(f"{'=' * 60}")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Invite URL: {invite_url}")
        print(f"{'=' * 60}\n")
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
