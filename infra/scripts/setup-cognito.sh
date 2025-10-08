#!/bin/bash
set -euo pipefail

# Mosaic Life - Cognito Configuration Script
# This script helps configure and test Cognito User Pool

ENVIRONMENT=${ENVIRONMENT:-prod}
AWS_REGION=${AWS_REGION:-us-east-1}

echo "🔐 Mosaic Life - Cognito Configuration"
echo "======================================="
echo ""

# Get Cognito configuration from Secrets Manager
echo "📥 Fetching Cognito configuration..."
COGNITO_CONFIG=$(aws secretsmanager get-secret-value \
  --secret-id "mosaic/${ENVIRONMENT}/cognito-config" \
  --region ${AWS_REGION} \
  --query SecretString \
  --output text)

USER_POOL_ID=$(echo $COGNITO_CONFIG | jq -r '.userPoolId')
CLIENT_ID=$(echo $COGNITO_CONFIG | jq -r '.userPoolClientId')
DOMAIN=$(echo $COGNITO_CONFIG | jq -r '.userPoolDomain')

echo "✓ User Pool ID: ${USER_POOL_ID}"
echo "✓ Client ID: ${CLIENT_ID}"
echo "✓ Domain: ${DOMAIN}"
echo ""

# Get client secret
echo "🔑 Fetching client secret..."
CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id ${USER_POOL_ID} \
  --client-id ${CLIENT_ID} \
  --region ${AWS_REGION} \
  --query 'UserPoolClient.ClientSecret' \
  --output text)

echo "✓ Client secret retrieved"
echo ""

# Display OAuth URLs
echo "🌐 OAuth Configuration:"
echo "======================================="
OAUTH_URL="https://${DOMAIN}.auth.${AWS_REGION}.amazoncognito.com"
echo "OAuth URL: ${OAUTH_URL}"
echo ""
echo "Authorization Endpoint:"
echo "  ${OAUTH_URL}/oauth2/authorize"
echo ""
echo "Token Endpoint:"
echo "  ${OAUTH_URL}/oauth2/token"
echo ""
echo "UserInfo Endpoint:"
echo "  ${OAUTH_URL}/oauth2/userInfo"
echo ""
echo "JWKS URI:"
echo "  https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json"
echo ""
echo "Issuer:"
echo "  https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}"
echo ""

# Display redirect URIs
echo "🔄 Redirect URIs:"
echo "======================================="
aws cognito-idp describe-user-pool-client \
  --user-pool-id ${USER_POOL_ID} \
  --client-id ${CLIENT_ID} \
  --region ${AWS_REGION} \
  --query 'UserPoolClient.CallbackURLs' \
  --output table

echo ""
echo "Logout URIs:"
aws cognito-idp describe-user-pool-client \
  --user-pool-id ${USER_POOL_ID} \
  --client-id ${CLIENT_ID} \
  --region ${AWS_REGION} \
  --query 'UserPoolClient.LogoutURLs' \
  --output table

echo ""

# List identity providers
echo "🔗 Identity Providers:"
echo "======================================="
aws cognito-idp list-identity-providers \
  --user-pool-id ${USER_POOL_ID} \
  --region ${AWS_REGION} \
  --query 'Providers[*].[ProviderName,ProviderType]' \
  --output table

echo ""

# Test user creation (optional)
read -p "Create a test user? (y/N): " CREATE_USER
if [[ $CREATE_USER =~ ^[Yy]$ ]]; then
  read -p "Enter email: " TEST_EMAIL
  read -sp "Enter password (min 12 chars): " TEST_PASSWORD
  echo ""

  echo "Creating test user..."
  aws cognito-idp admin-create-user \
    --user-pool-id ${USER_POOL_ID} \
    --username ${TEST_EMAIL} \
    --user-attributes Name=email,Value=${TEST_EMAIL} Name=email_verified,Value=true \
    --temporary-password ${TEST_PASSWORD} \
    --message-action SUPPRESS \
    --region ${AWS_REGION}

  echo "✓ Test user created: ${TEST_EMAIL}"
  echo "  Note: User must change password on first login"
fi

echo ""
echo "📝 Environment Variables for .env:"
echo "======================================="
cat <<EOF
COGNITO_USER_POOL_ID=${USER_POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}
COGNITO_CLIENT_SECRET=${CLIENT_SECRET}
COGNITO_DOMAIN=${DOMAIN}
COGNITO_REGION=${AWS_REGION}
COGNITO_ISSUER=https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}
COGNITO_OAUTH_URL=${OAUTH_URL}
EOF

echo ""
echo "✅ Cognito configuration complete!"
echo ""
echo "Next steps:"
echo "1. Update .env.production with the values above"
echo "2. Configure social login providers if not already done"
echo "3. Test login at: ${OAUTH_URL}/login?client_id=${CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=https://mosaiclife.me/auth/callback"
