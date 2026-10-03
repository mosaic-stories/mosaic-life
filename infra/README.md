# Mosaic Life Infrastructure

Application deployment for Mosaic Life using **existing infrastructure** from [mosaic-stories/infrastructure](https://github.com/mosaic-stories/infrastructure).

## 🏗️ Infrastructure Overview

### Existing Resources (Managed in Infrastructure Repo)
The following resources already exist and are managed in the infrastructure repository:

- ✅ **EKS Cluster**: `mosaiclife-eks`
- ✅ **VPC & Networking**: Multi-AZ VPC with public/private subnets
- ✅ **Cognito User Pool**: `mosaic-prod-users` (us-east-1_JLppKC09m)
- ✅ **S3 Buckets**: Media and backup buckets
- ✅ **ECR Repositories**: Container registries for web and core-api
- ✅ **IAM Roles**: IRSA roles for service accounts
- ✅ **Security Groups**: Cluster and workload security

### This Repository Manages
- ✅ **DNS & Certificates** (Route53 + ACM) - Minimal CDK stack
- ✅ **Application Deployment** - Helm charts for web and core-api
- ✅ **Build Pipeline** - Docker image builds and ECR push
- ✅ **Configuration** - Application-specific config and secrets

## 📁 Structure

```
infra/
├── cdk/                          # Minimal CDK for DNS/ACM only
│   ├── lib/
│   │   └── dns-certificate-stack.ts
│   └── bin/mosaic-life.ts
├── helm/                         # Kubernetes deployment
│   └── mosaic-life/              # Main application chart
│       ├── templates/            # K8s resources
│       ├── values.yaml           # Uses existing infrastructure
│       └── Chart.yaml
├── config/
│   └── aws-resources.yaml        # Existing resource reference
└── README.md                     # This file
```

## 🚀 Quick Start

### Prerequisites
```bash
# Install tools
brew install just aws-cli kubectl helm

# Configure AWS and kubectl
aws configure
just kubeconfig
```

### Deployment Steps

#### 1. Deploy DNS and Certificate (One-time)
```bash
# Only creates Route53 hosted zone and ACM certificate
just dns-deploy
```

#### 2. Build and Push Images
```bash
# Build and push with git SHA
just release-sha

# Or with specific version
just release v1.0.0
```

#### 3. Deploy to Kubernetes
```bash
# Deploy latest
just helm-deploy latest

# Or deploy with version
just helm-deploy v1.0.0

# Complete pipeline (build + push + deploy)
just deploy-sha
```

## 📋 Available Commands

### DNS & Certificates
```bash
just dns-deploy          # Create Route53 zone & ACM cert
just dns-destroy         # Remove DNS resources
just dns-diff            # Preview DNS changes
```

### Docker Images
```bash
just build-all           # Build all images
just build-web           # Build frontend only
just build-core-api      # Build backend only
just ecr-login           # Login to ECR
```

### Deployment
```bash
just release <version>   # Build and push images
just release-sha         # Build and push with git SHA
just deploy <version>    # Full pipeline
just deploy-sha          # Deploy with git SHA
just helm-deploy <ver>   # Deploy specific version
just helm-uninstall      # Remove deployment
```

### Cluster Management
```bash
just kubeconfig          # Update kubectl config
just cluster-info        # Show cluster details
just pods                # List pods
just logs <service>      # Tail service logs
just ingress             # Show ingress details
just urls                # Get service URLs
```

### AWS Resources
```bash
just show-resources      # List all existing resources
just cognito-info        # Cognito details
just s3-info             # S3 buckets
just ecr-info            # ECR repositories
just vpc-info            # VPC and subnets
```

### Development
```bash
just dev-up              # Start local environment
just dev-down            # Stop local environment
just dev-logs            # View local logs
```

## Lean runtime (ECS)

Production and staging run on ECS/Fargate with a single small RDS instance instead of EKS (change `lean-runtime-ecs-migration`).

- [LEAN-RUNTIME.md](LEAN-RUNTIME.md): architecture, CDK stacks and context flags, release flow, staging on/off, operating runbooks, database, cutover.
- [EKS-RETURN.md](EKS-RETURN.md): how to move back to EKS.

## 🔧 Configuration

### Existing Resources (Hardcoded)
The following are configured to use existing infrastructure:

```yaml
# AWS Account & Region
AWS_ACCOUNT: "033691785857"
AWS_REGION: "us-east-1"

# EKS Cluster
CLUSTER_NAME: "mosaiclife-eks"
VPC_ID: "vpc-0cda4cc7432deca33"

# Cognito
USER_POOL_ID: "us-east-1_JLppKC09m"

# S3 Buckets
MEDIA_BUCKET: "mosaic-prod-media-033691785857"
BACKUP_BUCKET: "mosaic-prod-backups-033691785857"

# ECR
REGISTRY: "033691785857.dkr.ecr.us-east-1.amazonaws.com"
```

See `infra/config/aws-resources.yaml` for complete configuration.

### Application Configuration
Application-specific environment variables are in Helm values:
- `infra/helm/mosaic-life/values.yaml`

Secrets are managed via:
- External Secrets Operator (from infrastructure repo)
- Kubernetes Secrets

## 🔐 Security

All security infrastructure is managed in the infrastructure repository:

- ✅ VPC with private subnets
- ✅ IAM roles via IRSA
- ✅ Secrets in AWS Secrets Manager
- ✅ Network policies
- ✅ Pod security standards

This repository only manages:
- Application-level secrets (via External Secrets)
- TLS certificates (via ACM)

## 📊 Architecture

```
┌─────────────────────────────────────────────────────┐
│   Infrastructure Repo (mosaic-stories/infrastructure)│
│   ✓ EKS Cluster                                      │
│   ✓ VPC & Networking                                 │
│   ✓ Cognito                                          │
│   ✓ S3, ECR, IAM                                     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│   This Repo (mosaic-stories/mosaic-life)            │
│   ✓ DNS & Certificates (Route53 + ACM)              │
│   ✓ Application Deployment (Helm)                   │
│   ✓ Docker Images (Build & Push)                    │
└─────────────────────────────────────────────────────┘
```

### DNS Flow
1. This repo creates Route53 hosted zone
2. ACM certificate with SANs for all subdomains
3. ALB Ingress references certificate ARN
4. Route53 records point to ALB

## 🚢 Deployment Workflow

### Standard Deployment
```bash
# 1. Build images
just build-all

# 2. Push to ECR
just push-all latest

# 3. Deploy to K8s
just helm-deploy latest

# Or all in one
just deploy latest
```

### CI/CD Deployment
```bash
# Use git SHA for versioning
GIT_SHA=$(git rev-parse --short HEAD)

# Build, push, deploy
just release $GIT_SHA
just helm-deploy $GIT_SHA
```

### Rollback
```bash
# Helm rollback
helm rollback mosaic-life -n mosaiclife

# Or deploy previous version
just helm-deploy <previous-version>
```

## 🔍 Monitoring

### View Resources
```bash
# All resources
just show-resources

# Pods status
just pods

# Application logs
just logs core-api
just logs web

# Ingress and URLs
just urls
just ingress
```

### Debug
```bash
# Port forward
just port-forward core-api 8080 8080

# Execute in pod
just exec core-api bash

# View events
kubectl get events -n mosaiclife --sort-by='.lastTimestamp'
```

## 🗑️ Cleanup

### Remove Application Only
```bash
just helm-uninstall
```

### Remove DNS/Certificates
```bash
just dns-destroy
```

**Note**: VPC, EKS, Cognito, S3, ECR remain (managed in infrastructure repo)

## 📚 Documentation

- **[Deployment Guide](./DEPLOYMENT.md)** - Complete deployment steps
- **[Infrastructure Repo](https://github.com/mosaic-stories/infrastructure)** - Core infrastructure
- **[Kubernetes Guide](../docs/KUBERNETES.md)** - K8s architecture
- **[AWS Platform Guide](../docs/AWS.md)** - AWS best practices

## 🤝 Division of Responsibilities

### Infrastructure Repository
- EKS cluster provisioning
- VPC and networking
- Cognito user pools
- S3 buckets
- ECR repositories
- Base IAM roles
- Cluster add-ons (ALB controller, etc.)

### This Repository (Application)
- Application code (web, core-api)
- Docker images
- Helm charts
- Application deployment
- DNS and certificates
- Application-specific configuration

## 🔄 Updates

### Update Application
```bash
# Build new version
just release v1.2.3

# Deploy
just helm-deploy v1.2.3
```

### Update Infrastructure
Infrastructure updates are handled in the [infrastructure repository](https://github.com/mosaic-stories/infrastructure).

### Update DNS/Certificates
```bash
# Make changes to infra/cdk/lib/dns-certificate-stack.ts
just dns-diff    # Preview changes
just dns-deploy  # Apply changes
```

## 💡 Tips

1. **Always use existing resources** - Don't recreate VPC, EKS, Cognito, etc.
2. **Version your images** - Use git SHA or semantic versioning
3. **Test locally first** - Use `just dev-up` for local testing
4. **Check resources** - Use `just show-resources` to verify config
5. **Monitor logs** - Use `just logs <service>` for debugging

## 🐛 Troubleshooting

### Pods not starting
```bash
kubectl describe pod -n mosaiclife <pod-name>
just logs <service>
```

### Can't access cluster
```bash
just kubeconfig
kubectl get nodes
```

### Certificate issues
```bash
# Check if certificate exists
aws acm list-certificates

# Deploy DNS stack
just dns-deploy
```

### Wrong resources
Verify you're using the correct existing resources:
```bash
just show-resources
```

## 📞 Support

- **Infrastructure Issues**: [infrastructure repo](https://github.com/mosaic-stories/infrastructure/issues)
- **Application Issues**: This repository issues
- **Documentation**: See `/docs` directory
