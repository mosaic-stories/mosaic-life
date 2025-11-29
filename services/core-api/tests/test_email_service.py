"""Tests for email service."""

import pytest
from unittest.mock import MagicMock, patch


class TestEmailService:
    """Tests for email service."""

    @pytest.mark.asyncio
    async def test_send_invitation_email_local_mode(self, caplog, capsys):
        """Test that email logs in local mode instead of sending."""
        import logging

        from app.services.email import send_invitation_email

        # Set log level to capture INFO messages
        caplog.set_level(logging.INFO)

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
            # Check that the console output was printed
            captured = capsys.readouterr()
            assert "INVITATION EMAIL (local mode - not sent)" in captured.out
            assert "invitee@example.com" in captured.out

    @pytest.mark.asyncio
    async def test_send_invitation_email_ses_mode(self):
        """Test that email sends via SES when configured."""
        from app.services.email import send_invitation_email

        mock_ses = MagicMock()
        mock_ses.send_email = MagicMock(return_value={"MessageId": "test123"})

        with patch("app.services.email.get_settings") as mock_settings:
            mock_settings.return_value.ses_from_email = "noreply@mosaiclife.com"
            mock_settings.return_value.ses_region = "us-east-1"
            mock_settings.return_value.app_url = "https://app.mosaiclife.com"

            with patch("app.services.email.boto3.client", return_value=mock_ses):
                result = await send_invitation_email(
                    to_email="invitee@example.com",
                    inviter_name="John Doe",
                    legacy_name="Mom's Legacy",
                    role="advocate",
                    token="test_token_123",
                )

                assert result is True
                mock_ses.send_email.assert_called_once()

                # Verify the email was sent with correct parameters
                call_args = mock_ses.send_email.call_args
                assert call_args.kwargs["Destination"]["ToAddresses"] == [
                    "invitee@example.com"
                ]
                assert "Mom's Legacy" in call_args.kwargs["Message"]["Subject"]["Data"]

    @pytest.mark.asyncio
    async def test_build_invitation_email_content(self):
        """Test that email content is built correctly."""
        from app.services.email import _build_invitation_email

        subject, html_body, text_body = _build_invitation_email(
            inviter_name="John Doe",
            legacy_name="Mom's Legacy",
            role="advocate",
            invite_url="https://app.mosaiclife.com/invite/abc123",
        )

        assert "Mom's Legacy" in subject
        assert "John Doe" in text_body
        assert "advocate" in text_body
        assert "https://app.mosaiclife.com/invite/abc123" in text_body
        assert "John Doe" in html_body
        assert "https://app.mosaiclife.com/invite/abc123" in html_body
