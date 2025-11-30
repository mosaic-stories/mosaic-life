#!/usr/bin/env python3
"""
SES Email Diagnostic Script

This script tests AWS SES configuration and sends a test email.
Run from the core-api directory with: uv run python scripts/test_ses.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from app.config import get_settings


def print_header(title: str) -> None:
    """Print a formatted section header."""
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")


def check_aws_credentials() -> bool:
    """Check if AWS credentials are available."""
    print_header("1. AWS Credentials Check")
    
    try:
        sts = boto3.client("sts")
        identity = sts.get_caller_identity()
        
        print("✅ AWS Credentials Found")
        print(f"   Account ID: {identity['Account']}")
        print(f"   User ARN: {identity['Arn']}")
        print(f"   User ID: {identity['UserId']}")
        return True
    except NoCredentialsError:
        print("❌ No AWS credentials found")
        print("   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY")
        print("   Or configure AWS CLI with: aws configure")
        return False
    except Exception as e:
        print(f"❌ Error checking credentials: {e}")
        return False


def check_ses_configuration() -> dict | None:
    """Check SES configuration from settings."""
    print_header("2. SES Configuration Check")
    
    settings = get_settings()
    
    print(f"SES From Email: {settings.ses_from_email or '❌ NOT SET'}")
    print(f"SES Region: {settings.ses_region}")
    print(f"App URL: {settings.app_url}")
    
    if not settings.ses_from_email:
        print("\n❌ SES_FROM_EMAIL environment variable is not set")
        print("   Set it to enable email sending")
        print("   Example: export SES_FROM_EMAIL=noreply@mosaiclife.me")
        return None
    
    return {
        "from_email": settings.ses_from_email,
        "region": settings.ses_region,
    }


def check_ses_verified_identities(region: str) -> list[str]:
    """Check which email addresses are verified in SES."""
    print_header("3. SES Verified Identities")
    
    try:
        ses = boto3.client("ses", region_name=region)
        response = ses.list_verified_email_addresses()
        
        verified = response.get("VerifiedEmailAddresses", [])
        
        if verified:
            print(f"✅ Found {len(verified)} verified email address(es):")
            for email in verified:
                print(f"   • {email}")
        else:
            print("❌ No verified email addresses found")
            print("   Verify an email address in the AWS SES console")
        
        return verified
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        print(f"❌ Error listing verified identities: {error_code}")
        print(f"   {e}")
        return []


def check_ses_sending_quota(region: str) -> dict | None:
    """Check SES sending quota and usage."""
    print_header("4. SES Sending Quota")
    
    try:
        ses = boto3.client("ses", region_name=region)
        quota = ses.get_send_quota()
        
        print(f"Max 24 Hour Send: {quota['Max24HourSend']:.0f}")
        print(f"Max Send Rate: {quota['MaxSendRate']:.0f} emails/second")
        print(f"Sent Last 24 Hours: {quota['SentLast24Hours']:.0f}")
        
        remaining = quota['Max24HourSend'] - quota['SentLast24Hours']
        print(f"Remaining Today: {remaining:.0f}")
        
        return quota
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        print(f"❌ Error checking sending quota: {error_code}")
        print(f"   {e}")
        return None


def check_ses_account_status(region: str) -> None:
    """Check if SES account is in sandbox mode."""
    print_header("5. SES Account Status")
    
    try:
        ses = boto3.client("ses", region_name=region)
        account = ses.get_account_sending_enabled()
        
        if account.get("Enabled"):
            print("✅ Account sending is ENABLED")
        else:
            print("❌ Account sending is DISABLED")
            return
        
        # Try to determine sandbox status by checking configuration sets
        try:
            config_sets = ses.list_configuration_sets()
            print(f"Configuration Sets: {len(config_sets.get('ConfigurationSets', []))}")
        except Exception:
            pass
        
        print("\n⚠️  Note: If your account is in sandbox mode:")
        print("   • You can only send TO verified email addresses")
        print("   • You can only send FROM verified email addresses")
        print("   • Request production access in AWS SES console")
        
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        print(f"❌ Error checking account status: {error_code}")
        print(f"   {e}")


def test_ses_permissions(region: str, from_email: str) -> bool:
    """Test if we have permission to send emails."""
    print_header("6. SES IAM Permissions Test")
    
    try:
        ses = boto3.client("ses", region_name=region)
        
        # Try to get sending statistics (requires ses:GetSendStatistics)
        ses.get_send_statistics()
        print("✅ ses:GetSendStatistics - OK")
        
        # Try to list verified emails (requires ses:ListVerifiedEmailAddresses)
        ses.list_verified_email_addresses()
        print("✅ ses:ListVerifiedEmailAddresses - OK")
        
        # Try to get quota (requires ses:GetSendQuota)
        ses.get_send_quota()
        print("✅ ses:GetSendQuota - OK")
        
        print("\n✅ Basic SES read permissions are working")
        print("   Note: ses:SendEmail permission will be tested with actual send")
        
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        print(f"❌ Permission check failed: {error_code}")
        print(f"   {e}")
        
        if error_code == "AccessDenied":
            print("\n   Required IAM permissions for SES:")
            print("   • ses:SendEmail")
            print("   • ses:SendRawEmail")
            print("   • ses:GetSendQuota")
            print("   • ses:ListVerifiedEmailAddresses")
            print("   • ses:GetSendStatistics")
        
        return False


def send_test_email(region: str, from_email: str, to_email: str) -> bool:
    """Send a test email via SES."""
    print_header("7. Send Test Email")
    
    print(f"From: {from_email}")
    print(f"To: {to_email}")
    print(f"Region: {region}")
    
    try:
        ses = boto3.client("ses", region_name=region)
        
        response = ses.send_email(
            Source=from_email,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {
                    "Data": "Test Email from Mosaic Life SES Diagnostic",
                    "Charset": "UTF-8",
                },
                "Body": {
                    "Text": {
                        "Data": """This is a test email from the Mosaic Life SES diagnostic script.

If you received this email, SES is configured correctly!

Test Details:
- From: {from_email}
- Region: {region}
- Script: test_ses.py

---
Mosaic Life""".format(from_email=from_email, region=region),
                        "Charset": "UTF-8",
                    },
                    "Html": {
                        "Data": """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .success {{ background-color: #10b981; color: white; padding: 12px; border-radius: 6px; margin: 20px 0; }}
        .details {{ background-color: #f3f4f6; padding: 12px; border-radius: 6px; margin: 20px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="success">
            <strong>✅ Success!</strong> This is a test email from the Mosaic Life SES diagnostic script.
        </div>

        <p>If you received this email, SES is configured correctly!</p>

        <div class="details">
            <strong>Test Details:</strong><br>
            From: {from_email}<br>
            Region: {region}<br>
            Script: test_ses.py
        </div>

        <p>---<br>Mosaic Life</p>
    </div>
</body>
</html>""".format(from_email=from_email, region=region),
                        "Charset": "UTF-8",
                    },
                },
            },
        )
        
        message_id = response.get("MessageId")
        print(f"\n✅ Email sent successfully!")
        print(f"   Message ID: {message_id}")
        print(f"\n   Check the inbox for: {to_email}")
        print(f"   Also check spam/junk folders")
        
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        error_message = e.response.get("Error", {}).get("Message", "Unknown error")
        
        print(f"\n❌ Failed to send email: {error_code}")
        print(f"   {error_message}")
        
        # Provide specific guidance based on error code
        if error_code == "MessageRejected":
            print("\n   Common causes:")
            print("   • Recipient email not verified (if in sandbox mode)")
            print("   • Sender email not verified")
            print("   • Email content flagged as spam")
        elif error_code == "AccessDenied":
            print("\n   Missing IAM permission: ses:SendEmail")
        elif error_code == "InvalidParameterValue":
            print("\n   Check that email addresses are valid")
        
        return False


def main():
    """Run all diagnostic checks."""
    print("\n" + "=" * 70)
    print("  AWS SES Email Configuration Diagnostic")
    print("  Mosaic Life - Legacy Member Invitations")
    print("=" * 70)
    
    # Check AWS credentials
    if not check_aws_credentials():
        print("\n❌ Cannot proceed without AWS credentials")
        sys.exit(1)
    
    # Check SES configuration
    ses_config = check_ses_configuration()
    if not ses_config:
        print("\n❌ Cannot proceed without SES_FROM_EMAIL configured")
        sys.exit(1)
    
    from_email = ses_config["from_email"]
    region = ses_config["region"]
    
    # Check verified identities
    verified = check_ses_verified_identities(region)
    
    if from_email not in verified:
        print(f"\n⚠️  WARNING: From email '{from_email}' is NOT verified in SES")
        print(f"   Verify it in the AWS SES console:")
        print(f"   https://console.aws.amazon.com/ses/home?region={region}#verified-senders-email:")
    
    # Check sending quota
    check_ses_sending_quota(region)
    
    # Check account status
    check_ses_account_status(region)
    
    # Test permissions
    test_ses_permissions(region, from_email)
    
    # Offer to send test email
    print_header("Send Test Email?")
    print("Enter a recipient email address to send a test email")
    print("(Press Enter to skip)")
    
    to_email = input("\nRecipient email: ").strip()
    
    if to_email:
        if "@" not in to_email:
            print("❌ Invalid email address")
        else:
            send_test_email(region, from_email, to_email)
    else:
        print("Skipped test email send")
    
    print_header("Diagnostic Complete")
    print("Review the results above to identify any configuration issues.\n")


if __name__ == "__main__":
    main()
