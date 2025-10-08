# Mosaic Life - AWS CDK Infrastructure

This CDK stack provisions all AWS infrastructure for Mosaic Life.

## What's Included

- **VPC**: Multi-AZ with public/private subnets, NAT gateways, VPC endpoints
- **Route53**: Hosted zone for mosaiclife.me
- **ACM**: SSL/TLS certificate with SANs for all subdomains
- **Cognito**: User Pool with social login providers (Google, GitHub)
- **S3**: Media and backup buckets with lifecycle policies
- **ECR**: Container repositories for web and core-api
- **SNS/SQS**: Event-driven architecture foundation
- **IAM**: IRSA roles for EKS workloads

## Prerequisites

```bash
npm install -g aws-cdk
aws configure
```

## Configuration

### Environment Variables

```bash
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ENVIRONMENT=prod

# Optional: Use existing hosted zone
export HOSTED_ZONE_ID=Z1234567890ABC

# Social login providers (get from OAuth provider consoles)
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
export GITHUB_CLIENT_ID="your-github-client-id"
export GITHUB_CLIENT_SECRET="your-github-client-secret"
```

## Deployment

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Preview changes
npm run diff

# Deploy
npm run deploy

# Or from project root
just infra-deploy
```

## Outputs

After deployment, note these outputs:

- **VPC ID**: For EKS cluster creation
- **Certificate ARN**: For ALB ingress
- **User Pool ID & Client ID**: For application config
- **ECR Repository URIs**: For Docker image push
- **Hosted Zone ID**: For DNS configuration

## Stack Updates

```bash
# View proposed changes
npm run diff

# Apply changes
npm run deploy
```

## Cleanup

```bash
# Destroy stack (prompts for confirmation)
npm run destroy

# Or from project root
just infra-destroy
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Route53 (DNS)                       │
│              mosaiclife.me + subdomains                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ACM Certificate (*.mosaiclife.me)          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    VPC (Multi-AZ)                        │
│  ┌──────────────────┐       ┌──────────────────────┐   │
│  │  Public Subnets  │       │  Private Subnets     │   │
│  │  - ALB           │       │  - EKS Nodes         │   │
│  │  - NAT Gateway   │       │  - Application Pods  │   │
│  └──────────────────┘       └──────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │            VPC Endpoints                          │  │
│  │  - S3  - ECR  - Secrets Manager  - SNS/SQS      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  Cognito User Pool                       │
│  - Email/Password login                                  │
│  - Google OAuth                                          │
│  - GitHub OAuth                                          │
│  - MFA (optional)                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                      S3 Buckets                          │
│  - Media (with lifecycle policies)                       │
│  - Backups (retention + Glacier)                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    ECR Repositories                      │
│  - mosaic-life/web                                       │
│  - mosaic-life/core-api                                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                Event-Driven (SNS/SQS)                    │
│  - Domain Events Topic                                   │
│  - Events Queue (with DLQ)                               │
└─────────────────────────────────────────────────────────┘
```

## Security

- All buckets encrypted at rest (S3-managed or KMS)
- Secrets stored in AWS Secrets Manager
- VPC endpoints reduce public internet traffic
- IAM roles follow least privilege principle
- CloudTrail enabled for audit logging

## Cost Estimate

Approximate monthly costs (us-east-1):

- VPC + NAT Gateways: ~$70/mo
- S3 (100GB): ~$2-5/mo
- Cognito (< 50k users): Free tier
- ECR storage: ~$1/GB/mo
- SNS/SQS: Pay per use (minimal)
- Route53: $0.50/zone/mo + $0.40/million queries

Total base infrastructure: ~$75-100/mo (before EKS)

## Maintenance

- Certificate auto-renews via ACM
- Lifecycle policies manage S3 costs
- ECR image retention policies limit storage
- CloudTrail logs retained per compliance needs

## Troubleshooting

### Stack deployment fails

```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name MosaicLifeStack \
  --max-items 20

# View specific resource
aws cloudformation describe-stack-resource \
  --stack-name MosaicLifeStack \
  --logical-resource-id <ResourceId>
```

### Certificate validation stuck

- Ensure hosted zone nameservers updated at domain registrar
- Check Route53 validation records created
- DNS propagation can take up to 48 hours

### Cognito social providers

- Verify OAuth redirect URIs match Cognito domain
- Check client secrets are correct
- Test provider integration in Cognito console

## Related Documentation

- [Deployment Guide](../DEPLOYMENT.md)
- [Kubernetes Setup](../../docs/KUBERNETES.md)
- [AWS Platform](../../docs/AWS.md)
