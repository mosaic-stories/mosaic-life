# 🚀 Mosaic Life - Quick Start Guide

Get Mosaic Life deployed to AWS in under 30 minutes.

## Prerequisites (5 min)

```bash
# Install tools (macOS)
brew install just aws-cli kubectl helm eksctl node

# Configure AWS
aws configure
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
```

## Step 1: Deploy Infrastructure (5-10 min)

```bash
# Optional: Configure social logins
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-secret"
export GITHUB_CLIENT_ID="your-github-client-id"
export GITHUB_CLIENT_SECRET="your-github-secret"

# Deploy AWS resources
cd infra/cdk
npm install
npm run deploy

# Save outputs for later
export VPC_ID=<from-output>
export CERT_ARN=<from-output>
export USER_POOL_ID=<from-output>
```

## Step 2: Create EKS Cluster (15-20 min)

```bash
# Create cluster configuration
cat > eks-cluster.yaml <<EOF
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: mosaic-life
  region: ${AWS_REGION}
  version: "1.29"
vpc:
  id: ${VPC_ID}
managedNodeGroups:
  - name: workers
    instanceType: t3.large
    minSize: 3
    maxSize: 10
    desiredCapacity: 3
    privateNetworking: true
iam:
  withOIDC: true
EOF

# Create cluster
eksctl create cluster -f eks-cluster.yaml

# Verify
kubectl get nodes
```

## Step 3: Install Add-ons (2-3 min)

```bash
# AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=mosaic-life

# External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n kube-system --set installCRDs=true
```

## Step 4: Deploy Application (5 min)

```bash
# Build and push images
just ecr-login
just release latest

# Deploy with Helm
just helm-deploy latest

# Verify
kubectl get pods -n mosaiclife
kubectl get ingress -n mosaiclife
```

## Step 5: Configure DNS (2 min)

```bash
# Get ALB DNS
export ALB_DNS=$(kubectl get ingress web -n mosaiclife -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Create Route53 records
aws route53 change-resource-record-sets \
  --hosted-zone-id <ZONE_ID> \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "mosaiclife.me",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "<ALB_ZONE_ID>",
          "DNSName": "'$ALB_DNS'",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

## Step 6: Test (1 min)

```bash
# Wait for DNS propagation (1-5 min)
curl https://mosaiclife.me
curl https://backend.mosaiclife.me/healthz

# Open in browser
open https://mosaiclife.me
```

## ✅ Done!

Your application is now live at:
- **Frontend**: https://mosaiclife.me
- **Backend**: https://backend.mosaiclife.me
- **API**: https://backend.mosaiclife.me/api

## Common Commands

```bash
# View logs
just logs core-api

# Scale deployment
kubectl scale deployment core-api -n mosaiclife --replicas=5

# Update application
just release v1.2.3
just helm-deploy v1.2.3

# Rollback
helm rollback mosaic-life -n mosaiclife
```

## Troubleshooting

**Pods not starting?**
```bash
kubectl describe pod -n mosaiclife <pod-name>
```

**ALB not created?**
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

**Need help?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guide.
