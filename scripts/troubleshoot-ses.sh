#!/bin/bash
# SES Email Troubleshooting Script
# Run this to diagnose SES email delivery issues

set -e

echo "=================================================================="
echo "  Mosaic Life - SES Email Troubleshooting"
echo "=================================================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo "ℹ️  $1"
}

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI not found. Please install it first."
    exit 1
fi

print_success "AWS CLI found"

# Check AWS credentials
echo ""
echo "1. Checking AWS Credentials..."
echo "================================"
if aws sts get-caller-identity &> /dev/null; then
    print_success "AWS credentials are configured"
    aws sts get-caller-identity --output table
else
    print_error "AWS credentials not configured"
    echo "Run: aws configure"
    exit 1
fi

# Get AWS region
AWS_REGION=${AWS_REGION:-us-east-1}
SES_REGION=${SES_REGION:-$AWS_REGION}

echo ""
echo "2. Checking SES Environment Variables..."
echo "=========================================="
if [ -z "$SES_FROM_EMAIL" ]; then
    print_error "SES_FROM_EMAIL is not set"
    echo "Set it with: export SES_FROM_EMAIL=noreply@mosaiclife.me"
else
    print_success "SES_FROM_EMAIL = $SES_FROM_EMAIL"
fi

print_info "SES_REGION = $SES_REGION"

# Check SES verified identities
echo ""
echo "3. Checking SES Verified Email Addresses..."
echo "============================================="
VERIFIED_EMAILS=$(aws ses list-verified-email-addresses --region "$SES_REGION" --query 'VerifiedEmailAddresses' --output text 2>/dev/null || echo "")

if [ -z "$VERIFIED_EMAILS" ]; then
    print_error "No verified email addresses found in SES"
    echo "Verify your email in AWS Console:"
    echo "https://console.aws.amazon.com/ses/home?region=$SES_REGION#verified-senders-email:"
else
    print_success "Verified email addresses found:"
    echo "$VERIFIED_EMAILS" | tr '\t' '\n' | while read -r email; do
        [ -n "$email" ] && echo "   • $email"
    done
    
    # Check if SES_FROM_EMAIL is verified
    if [ -n "$SES_FROM_EMAIL" ]; then
        if echo "$VERIFIED_EMAILS" | grep -q "$SES_FROM_EMAIL"; then
            print_success "$SES_FROM_EMAIL is verified"
        else
            print_error "$SES_FROM_EMAIL is NOT verified"
            echo "Verify it at: https://console.aws.amazon.com/ses/home?region=$SES_REGION#verified-senders-email:"
        fi
    fi
fi

# Check SES sending quota
echo ""
echo "4. Checking SES Sending Quota..."
echo "=================================="
QUOTA=$(aws ses get-send-quota --region "$SES_REGION" 2>/dev/null || echo "")

if [ -n "$QUOTA" ]; then
    echo "$QUOTA" | grep -E "Max24HourSend|MaxSendRate|SentLast24Hours" || echo "$QUOTA"
    print_success "SES sending quota retrieved"
else
    print_error "Could not retrieve SES sending quota"
fi

# Check if account is in sandbox mode
echo ""
echo "5. Checking SES Account Status..."
echo "==================================="
ACCOUNT_STATUS=$(aws ses get-account-sending-enabled --region "$SES_REGION" 2>/dev/null || echo "")

if echo "$ACCOUNT_STATUS" | grep -q '"Enabled": true'; then
    print_success "SES account sending is ENABLED"
else
    print_warning "SES account may be disabled or in sandbox mode"
fi

print_warning "If in sandbox mode, you can only send:"
echo "   • FROM verified email addresses"
echo "   • TO verified email addresses"
echo "   Request production access: https://console.aws.amazon.com/ses/home?region=$SES_REGION#account-details:"

# Check IAM permissions
echo ""
echo "6. Checking IAM Permissions..."
echo "================================"
print_info "Testing if current credentials can send emails..."

# Try to simulate a policy check (this is approximate)
IDENTITY=$(aws sts get-caller-identity --query 'Arn' --output text)
print_info "Current identity: $IDENTITY"

echo ""
print_info "Required IAM permissions for SES:"
echo "   • ses:SendEmail"
echo "   • ses:SendRawEmail"
echo "   • ses:GetSendQuota"
echo "   • ses:ListVerifiedEmailAddresses"
echo "   • ses:GetSendStatistics"

# Check recent SES CloudWatch metrics
echo ""
echo "7. Checking Recent SES Metrics (CloudWatch)..."
echo "================================================"
print_info "Checking for recent email sends in the last hour..."

REJECTS=$(aws cloudwatch get-metric-statistics \
    --namespace AWS/SES \
    --metric-name Reputation.BounceRate \
    --dimensions Name=Country,Value=US \
    --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
    --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
    --period 3600 \
    --statistics Sum \
    --region "$SES_REGION" 2>/dev/null || echo "")

if [ -n "$REJECTS" ]; then
    echo "$REJECTS"
else
    print_info "No recent metrics found (this is normal if no emails were sent)"
fi

# Check application logs in Kubernetes (if applicable)
echo ""
echo "8. Checking Application Environment..."
echo "========================================"

if command -v kubectl &> /dev/null; then
    print_success "kubectl found"
    
    # Check if core-api pods are running
    if kubectl get pods -n mosaic-life -l app=core-api &> /dev/null; then
        print_info "Checking core-api pods..."
        kubectl get pods -n mosaic-life -l app=core-api
        
        echo ""
        print_info "To check application logs for SES errors:"
        echo "kubectl logs -n mosaic-life -l app=core-api --tail=100 | grep -i 'email\\|ses'"
    else
        print_info "No core-api pods found (may not be deployed yet)"
    fi
else
    print_info "kubectl not found - skipping Kubernetes checks"
fi

# Check if running locally with docker-compose
if [ -f "infra/compose/docker-compose.yml" ]; then
    echo ""
    print_info "To check local docker-compose logs:"
    echo "docker compose -f infra/compose/docker-compose.yml logs core-api | grep -i email"
fi

# Summary and next steps
echo ""
echo "=================================================================="
echo "  Summary & Next Steps"
echo "=================================================================="
echo ""

if [ -z "$SES_FROM_EMAIL" ]; then
    print_error "CRITICAL: SES_FROM_EMAIL environment variable not set"
    echo ""
    echo "Fix this by:"
    echo "1. Export the variable: export SES_FROM_EMAIL=noreply@mosaiclife.me"
    echo "2. For Kubernetes, add to Helm values:"
    echo "   env:"
    echo "     SES_FROM_EMAIL: noreply@mosaiclife.me"
    echo "3. Redeploy the application"
    echo ""
fi

echo "To run the Python diagnostic script:"
echo "  cd services/core-api"
echo "  export SES_FROM_EMAIL=noreply@mosaiclife.me"
echo "  export SES_REGION=us-east-1"
echo "  uv run python scripts/test_ses.py"
echo ""

echo "To send a test email via AWS CLI:"
echo "  aws ses send-email \\"
echo "    --from noreply@mosaiclife.me \\"
echo "    --to your-email@example.com \\"
echo "    --subject 'Test Email' \\"
echo "    --text 'This is a test' \\"
echo "    --region $SES_REGION"
echo ""

echo "To check SES sending statistics:"
echo "  aws ses get-send-statistics --region $SES_REGION"
echo ""

print_info "Review the checks above and fix any issues marked with ❌"
echo ""
