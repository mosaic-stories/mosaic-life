# Mosaic Life - Complete Infrastructure Setup

## 📋 What Was Created

### AWS Infrastructure (CDK)

✅ **Networking**
- VPC with multi-AZ deployment
- Public subnets for ALB
- Private subnets for EKS workloads
- NAT Gateways for outbound connectivity
- VPC Endpoints (S3, ECR, Secrets Manager)

✅ **DNS & Certificates**
- Route53 Hosted Zone for `mosaiclife.me`
- ACM Certificate with SANs:
  - `mosaiclife.me`
  - `*.mosaiclife.me`
  - `frontend.mosaiclife.me`
  - `backend.mosaiclife.me`
  - `graph.mosaiclife.me`
  - `chat.mosaiclife.me`

✅ **Authentication (Cognito)**
- User Pool with email/password login
- Google OAuth integration
- GitHub OAuth integration
- MFA support (optional)
- Hosted UI at `mosaic-prod-{account}.auth.us-east-1.amazoncognito.com`

✅ **Storage (S3)**
- Media bucket with lifecycle policies
- Backup bucket with Glacier archival
- Versioning enabled
- Encryption at rest

✅ **Container Registry (ECR)**
- `mosaic-life/web` - Frontend images
- `mosaic-life/core-api` - Backend images
- Image scanning on push
- Lifecycle policies (keep last 10 images)

✅ **Event Infrastructure**
- SNS topic for domain events
- SQS queue with DLQ
- Event-driven architecture foundation

✅ **IAM & Security**
- IRSA roles for EKS service accounts
- Least privilege policies
- CloudTrail logging
- Secrets Manager integration

### Kubernetes Deployment (Helm)

✅ **Application Components**
- Web frontend deployment (2-10 replicas)
- Core API backend deployment (3-20 replicas)
- Horizontal Pod Autoscaling (CPU/Memory)
- Pod Disruption Budgets

✅ **Networking & Ingress**
- AWS Load Balancer Controller integration
- ALB ingress with SSL termination
- Health checks configured
- SSE/Streaming support for API

✅ **Configuration**
- ConfigMaps for app settings
- External Secrets Operator integration
- Service Accounts with IRSA annotations

✅ **Security**
- Network Policies
- Pod Security Standards
- Non-root containers
- Read-only root filesystem

### Build & Deployment Automation

✅ **Justfile Commands**
- Infrastructure deployment (`just infra-deploy`)
- Docker image build (`just build-all`)
- ECR push (`just push-all`)
- Complete release pipeline (`just release <version>`)
- Helm deployment (`just helm-deploy <version>`)
- Development environment (`just dev-up`)

## 🚀 Deployment Instructions

### One-Time Setup

1. **Install Prerequisites**
   ```bash
   # macOS
   brew install just aws-cli kubectl helm eksctl node

   # Configure AWS
   aws configure
   export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   ```

2. **Configure Social Logins** (Optional)
   ```bash
   # Google OAuth (https://console.cloud.google.com/)
   export GOOGLE_CLIENT_ID="..."
   export GOOGLE_CLIENT_SECRET="..."

   # GitHub OAuth (https://github.com/settings/developers)
   export GITHUB_CLIENT_ID="..."
   export GITHUB_CLIENT_SECRET="..."
   ```

3. **Deploy AWS Infrastructure**
   ```bash
   just infra-deploy
   # Takes ~5-10 minutes
   # Note the outputs: VPC ID, Certificate ARN, User Pool ID, etc.
   ```

4. **Create EKS Cluster**
   ```bash
   # See infra/DEPLOYMENT.md for detailed steps
   # Or use eksctl with the generated config
   ```

5. **Install Cluster Add-ons**
   ```bash
   # AWS Load Balancer Controller
   # External Secrets Operator
   # See infra/DEPLOYMENT.md Step 3-4
   ```

### Regular Deployment

```bash
# Build, push, and deploy in one command
just deploy-sha

# Or with specific version
just release v1.2.3
just helm-deploy v1.2.3
```

## 🔑 Configuration

### Cognito Setup

After CDK deployment, run:
```bash
./infra/scripts/setup-cognito.sh
```

This outputs all Cognito configuration needed for `.env.production`.

### Environment Variables

Copy and configure:
```bash
cp .env.production.template .env.production
# Fill in values from CDK outputs and Cognito setup
```

Key variables:
- `COGNITO_USER_POOL_ID` - From CDK output
- `COGNITO_CLIENT_ID` - From CDK output
- `COGNITO_CLIENT_SECRET` - From setup-cognito.sh
- `MEDIA_BUCKET` - From CDK output
- `DOMAIN_EVENTS_TOPIC_ARN` - From CDK output

### DNS Configuration

1. **Get Nameservers** (if new hosted zone)
   ```bash
   aws route53 get-hosted-zone --id <HOSTED_ZONE_ID>
   ```

2. **Update Domain Registrar**
   - Add nameservers at your domain registrar
   - Wait for DNS propagation (up to 48 hours)

3. **Create Route53 Records**
   ```bash
   # After ALB is created
   # See infra/DEPLOYMENT.md Step 7
   ```

## 🏗️ Architecture

```
                           ┌─────────────────┐
                           │   Route53 DNS   │
                           │  mosaiclife.me  │
                           └────────┬────────┘
                                    │
                           ┌────────▼────────┐
                           │  ACM Certificate │
                           │  (*.mosaiclife) │
                           └────────┬────────┘
                                    │
                ┌───────────────────▼───────────────────┐
                │         AWS Load Balancer (ALB)        │
                │  - SSL Termination                     │
                │  - Health Checks                       │
                │  - WAF Integration                     │
                └───────────────────┬───────────────────┘
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        │                                                         │
  ┌─────▼─────┐                                           ┌──────▼──────┐
  │    Web    │                                           │  Core API   │
  │ (Frontend)│                                           │  (Backend)  │
  │  2-10x    │                                           │   3-20x     │
  └─────┬─────┘                                           └──────┬──────┘
        │                                                         │
        │                                                         │
  ┌─────▼──────────────────────────────────────────────────────▼─────┐
  │                        EKS Cluster                                │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
  │  │   ConfigMap  │  │   Secrets    │  │  Service Accounts    │   │
  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │
  └────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        │                                                         │
  ┌─────▼─────┐  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
  │ S3 Media  │  │   Cognito   │  │  SNS/SQS    │  │  Secrets    │
  │  Bucket   │  │ User Pool   │  │   Events    │  │  Manager    │
  └───────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

## 📊 Monitoring & Operations

### Health Checks

```bash
# Application health
curl https://backend.mosaiclife.me/healthz
curl https://backend.mosaiclife.me/readyz

# Kubernetes resources
kubectl get pods -n mosaiclife
kubectl get hpa -n mosaiclife
kubectl get ingress -n mosaiclife
```

### Logs

```bash
# Tail application logs
just logs core-api
just logs web

# Or directly
kubectl logs -f -n mosaiclife -l app=core-api
```

### Metrics

```bash
# HPA status
kubectl get hpa -n mosaiclife

# Resource usage
kubectl top pods -n mosaiclife
kubectl top nodes
```

## 🔐 Security Checklist

- ✅ VPC with private subnets for workloads
- ✅ Security groups with least privilege
- ✅ IAM roles via IRSA (no static credentials)
- ✅ Secrets in AWS Secrets Manager
- ✅ TLS/SSL everywhere (ACM certificates)
- ✅ Pod security standards enforced
- ✅ Network policies configured
- ✅ Image scanning enabled (ECR)
- ✅ CloudTrail audit logging
- ✅ Cognito with MFA support

## 💰 Cost Management

### Monthly Estimates
- Infrastructure (VPC, S3, etc.): ~$75-100
- EKS Control Plane: $72
- Worker Nodes (3x t3.large): ~$95
- Data Transfer: ~$20-100
- **Total**: ~$260-370/mo

### Optimization Tips
1. Use Spot instances for non-critical workloads
2. Enable Cluster Autoscaler
3. Review S3 lifecycle policies
4. Set CloudWatch log retention
5. Use VPC endpoints (already configured)

## 🧹 Cleanup

### Remove Application
```bash
helm uninstall mosaic-life -n mosaiclife
```

### Remove Cluster
```bash
eksctl delete cluster --name mosaic-life
```

### Remove Infrastructure
```bash
just infra-destroy
# Confirms before deletion
```

## 📚 Documentation

- **[Complete Deployment Guide](infra/DEPLOYMENT.md)** - Step-by-step instructions
- **[Infrastructure README](infra/README.md)** - Infrastructure overview
- **[CDK Documentation](infra/cdk/README.md)** - AWS resources details
- **[Kubernetes Guide](docs/KUBERNETES.md)** - K8s architecture
- **[AWS Platform Guide](docs/AWS.md)** - AWS best practices

## 🐛 Troubleshooting

### Certificate Not Validating
- Check nameservers at domain registrar
- Verify Route53 validation records exist
- Wait for DNS propagation (up to 48h)

### Pods Not Starting
```bash
kubectl describe pod -n mosaiclife <pod-name>
kubectl logs -n mosaiclife <pod-name>
```

### ALB Not Created
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
kubectl describe ingress -n mosaiclife
```

### Cognito Issues
```bash
# Verify configuration
./infra/scripts/setup-cognito.sh

# Test OAuth flow
open "https://<domain>.auth.us-east-1.amazoncognito.com/login?client_id=<client-id>&response_type=code&scope=email+openid+profile&redirect_uri=https://mosaiclife.me/auth/callback"
```

## 🎯 Next Steps

1. ✅ Infrastructure deployed
2. ✅ EKS cluster created
3. ✅ Application deployed
4. ⏳ Configure DNS at domain registrar
5. ⏳ Test end-to-end flow
6. ⏳ Set up monitoring (Prometheus/Grafana)
7. ✅ CI/CD configured (GitHub Actions OIDC and EKS RBAC managed in infrastructure repository - see `docs/cicd/QUICK-START.md`)
8. ⏳ Enable WAF rules
9. ⏳ Set up backup automation
10. ⏳ Production readiness review

## 🤝 Support

- **Issues**: https://github.com/mosaic-stories/mosaic-life/issues
- **Documentation**: See `/docs` directory
- **Community**: [Link to community channel]

---

**Status**: ✅ Complete
**Version**: 1.0.0
**Last Updated**: October 2025
