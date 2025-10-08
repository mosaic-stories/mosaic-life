# Mosaic Life - AWS Deployment Guide

This guide covers deploying Mosaic Life to AWS EKS with full infrastructure provisioning.

## Architecture Overview

- **Domain**: mosaiclife.me with subdomains (frontend, backend, graph, chat)
- **Certificate**: ACM wildcard certificate with SANs
- **Auth**: Cognito User Pool with social logins (Google, GitHub)
- **Storage**: S3 for media and backups
- **Networking**: VPC with public/private subnets, VPC endpoints
- **Container Registry**: ECR for Docker images
- **Kubernetes**: EKS with AWS Load Balancer Controller
- **Events**: SNS/SQS for domain events

## Prerequisites

### Required Tools
- AWS CLI v2
- kubectl
- helm v3
- eksctl
- just (command runner)
- docker
- node.js 18+ (for CDK)
- CDK CLI: `npm install -g aws-cdk`

### AWS Configuration
```bash
# Configure AWS CLI
aws configure

# Export AWS account ID
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ENVIRONMENT=prod
```

## Step 1: Deploy AWS Infrastructure (CDK)

### 1.1 Install CDK Dependencies
```bash
cd infra/cdk
npm install
```

### 1.2 Configure Social Login Providers

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - `https://mosaic-prod-{AWS_ACCOUNT}.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
4. Export credentials:
```bash
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

#### GitHub OAuth
1. Go to GitHub Settings > Developer Settings > OAuth Apps
2. Create new OAuth App
3. Set callback URL: `https://mosaic-prod-{AWS_ACCOUNT}.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
4. Export credentials:
```bash
export GITHUB_CLIENT_ID="your-github-client-id"
export GITHUB_CLIENT_SECRET="your-github-client-secret"
```

### 1.3 Deploy Infrastructure
```bash
# From project root
just infra-deploy

# Or manually
cd infra/cdk
npm run build
npx cdk deploy
```

This creates:
- VPC with public/private subnets
- Route53 hosted zone (if not exists)
- ACM certificate with SANs
- Cognito User Pool with social providers
- S3 buckets (media, backups)
- ECR repositories
- SNS/SQS for events
- VPC endpoints
- IAM roles for IRSA

### 1.4 Note CDK Outputs
Save the following outputs from CDK:
- VPC ID
- Certificate ARN
- User Pool ID & Client ID
- User Pool Domain
- ECR Repository URIs
- Hosted Zone ID

## Step 2: Create EKS Cluster

### 2.1 Create Cluster with eksctl
```bash
# Get VPC ID from CDK output
export VPC_ID=$(aws cloudformation describe-stacks \
  --stack-name MosaicLifeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`VpcId`].OutputValue' \
  --output text)

# Get subnet IDs
export PRIVATE_SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:kubernetes.io/role/internal-elb,Values=1" \
  --query 'Subnets[*].SubnetId' \
  --output text | tr '\t' ',')

export PUBLIC_SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:kubernetes.io/role/elb,Values=1" \
  --query 'Subnets[*].SubnetId' \
  --output text | tr '\t' ',')
```

### 2.2 Create cluster config
```bash
cat > eks-cluster.yaml <<EOF
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: mosaic-life
  region: ${AWS_REGION}
  version: "1.29"
  tags:
    Project: MosaicPlatform
    Environment: ${ENVIRONMENT}

vpc:
  id: ${VPC_ID}
  subnets:
    private:
$(echo $PRIVATE_SUBNETS | tr ',' '\n' | awk '{print "      - " $1}')
    public:
$(echo $PUBLIC_SUBNETS | tr ',' '\n' | awk '{print "      - " $1}')

managedNodeGroups:
  - name: workers
    instanceType: t3.large
    minSize: 3
    maxSize: 10
    desiredCapacity: 3
    privateNetworking: true
    volumeSize: 100
    volumeType: gp3
    tags:
      Project: MosaicPlatform
      Environment: ${ENVIRONMENT}
    iam:
      withAddonPolicies:
        imageBuilder: true
        autoScaler: true
        externalDNS: true
        certManager: true
        albIngress: true
        ebs: true

iam:
  withOIDC: true
  serviceAccounts:
    - metadata:
        name: aws-load-balancer-controller
        namespace: kube-system
      wellKnownPolicies:
        awsLoadBalancerController: true
    - metadata:
        name: external-secrets
        namespace: kube-system
      attachPolicyARNs:
        - "arn:aws:iam::aws:policy/SecretsManagerReadWrite"

cloudWatch:
  clusterLogging:
    enableTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"]
EOF
```

### 2.3 Create Cluster
```bash
eksctl create cluster -f eks-cluster.yaml
```

This takes 15-20 minutes.

### 2.4 Verify Cluster
```bash
kubectl get nodes
kubectl get pods -A
```

## Step 3: Install AWS Load Balancer Controller

```bash
# Add EKS chart repo
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# Get cluster VPC ID
export CLUSTER_VPC=$(aws eks describe-cluster \
  --name mosaic-life \
  --query 'cluster.resourcesVpcConfig.vpcId' \
  --output text)

# Install AWS Load Balancer Controller
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=mosaic-life \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=${AWS_REGION} \
  --set vpcId=${CLUSTER_VPC}

# Verify
kubectl get deployment -n kube-system aws-load-balancer-controller
```

## Step 4: Install External Secrets Operator

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm install external-secrets \
  external-secrets/external-secrets \
  -n kube-system \
  --set installCRDs=true \
  --set serviceAccount.create=false \
  --set serviceAccount.name=external-secrets

# Create SecretStore
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: mosaiclife
spec:
  provider:
    aws:
      service: SecretsManager
      region: ${AWS_REGION}
      auth:
        jwt:
          serviceAccountRef:
            name: core-api
EOF
```

## Step 5: Build and Push Docker Images

### 5.1 Login to ECR
```bash
just ecr-login
```

### 5.2 Build and Push Images
```bash
# Build with version tag
export VERSION=$(git rev-parse --short HEAD)
just release $VERSION

# Or use latest
just release latest
```

## Step 6: Deploy Application with Helm

### 6.1 Get Certificate ARN
```bash
export CERT_ARN=$(aws cloudformation describe-stacks \
  --stack-name MosaicLifeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CertificateArn`].OutputValue' \
  --output text)
```

### 6.2 Get OIDC Provider ID
```bash
export OIDC_PROVIDER=$(aws eks describe-cluster \
  --name mosaic-life \
  --query 'cluster.identity.oidc.issuer' \
  --output text | sed 's/https:\/\///')

export OIDC_ID=$(echo $OIDC_PROVIDER | rev | cut -d'/' -f1 | rev)
```

### 6.3 Update CDK Stack with OIDC Provider
```bash
# Update the IRSA role in CDK stack with actual OIDC provider
# Edit infra/cdk/lib/mosaic-life-stack.ts and replace CLUSTER_ID with $OIDC_ID
# Then redeploy
cd infra/cdk
npm run build
npx cdk deploy
```

### 6.4 Get Service Account Role ARN
```bash
export CORE_API_ROLE_ARN=$(aws iam get-role \
  --role-name mosaic-prod-core-api-role \
  --query 'Role.Arn' \
  --output text)
```

### 6.5 Deploy with Helm
```bash
export VERSION=$(git rev-parse --short HEAD)

helm upgrade --install mosaic-life infra/helm/mosaic-life \
  --namespace mosaiclife \
  --create-namespace \
  --set global.registry=${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com \
  --set global.imageTag=${VERSION} \
  --set global.domain=mosaiclife.me \
  --set global.environment=prod \
  --set global.aws.region=${AWS_REGION} \
  --set global.aws.accountId=${AWS_ACCOUNT} \
  --set global.aws.certificateArn=${CERT_ARN} \
  --set coreApi.serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=${CORE_API_ROLE_ARN} \
  --wait \
  --timeout 10m

# Or use just command
just helm-deploy $VERSION
```

## Step 7: Configure DNS

### 7.1 Get ALB DNS Name
```bash
kubectl get ingress -n mosaiclife

# Get ALB hostname
export ALB_DNS=$(kubectl get ingress web -n mosaiclife \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "ALB DNS: $ALB_DNS"
```

### 7.2 Create Route53 Records
```bash
export HOSTED_ZONE_ID=$(aws cloudformation describe-stacks \
  --stack-name MosaicLifeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`HostedZoneId`].OutputValue' \
  --output text)

# Get ALB Hosted Zone ID
export ALB_ZONE_ID=$(aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?DNSName=='${ALB_DNS}'].CanonicalHostedZoneId" \
  --output text)

# Create alias records
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://<(cat <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "mosaiclife.me",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "${ALB_ZONE_ID}",
          "DNSName": "${ALB_DNS}",
          "EvaluateTargetHealth": true
        }
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "frontend.mosaiclife.me",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "${ALB_ZONE_ID}",
          "DNSName": "${ALB_DNS}",
          "EvaluateTargetHealth": true
        }
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "backend.mosaiclife.me",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "${ALB_ZONE_ID}",
          "DNSName": "${ALB_DNS}",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
EOF
)
```

## Step 8: Sync Cognito Configuration

```bash
# Sync Cognito config to Kubernetes secrets
just sync-secrets

# Or manually
COGNITO_CONFIG=$(aws secretsmanager get-secret-value \
  --secret-id mosaic/prod/cognito-config \
  --query SecretString \
  --output text)

kubectl create secret generic cognito-config \
  --namespace mosaiclife \
  --from-literal=config="$COGNITO_CONFIG" \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Step 9: Verify Deployment

```bash
# Check pods
kubectl get pods -n mosaiclife

# Check ingress
kubectl get ingress -n mosaiclife

# Check HPA
kubectl get hpa -n mosaiclife

# View logs
just logs core-api
just logs web

# Get service URLs
just urls
```

## Step 10: Update Domain Nameservers

If you created a new hosted zone, update your domain registrar with the nameservers:

```bash
aws route53 get-hosted-zone \
  --id $HOSTED_ZONE_ID \
  --query 'DelegationSet.NameServers' \
  --output table
```

Update these at your domain registrar (GoDaddy, Namecheap, etc.)

## Testing

```bash
# Test frontend
curl https://mosaiclife.me
curl https://frontend.mosaiclife.me

# Test backend
curl https://backend.mosaiclife.me/healthz

# Test with browser
open https://mosaiclife.me
```

## Monitoring

```bash
# Watch pods
kubectl get pods -n mosaiclife -w

# View logs
kubectl logs -f -n mosaiclife -l app=core-api
kubectl logs -f -n mosaiclife -l app=web

# Describe ingress
kubectl describe ingress -n mosaiclife

# Get events
kubectl get events -n mosaiclife --sort-by='.lastTimestamp'
```

## Updating Deployment

```bash
# Build new version
export NEW_VERSION=$(git rev-parse --short HEAD)
just release $NEW_VERSION

# Deploy new version
just helm-deploy $NEW_VERSION

# Rollback if needed
helm rollback mosaic-life -n mosaiclife
```

## Cleanup

```bash
# Delete Helm release
helm uninstall mosaic-life -n mosaiclife

# Delete cluster
eksctl delete cluster --name mosaic-life

# Delete CDK stack
just infra-destroy
```

## Troubleshooting

### Pods not starting
```bash
kubectl describe pod -n mosaiclife <pod-name>
kubectl logs -n mosaiclife <pod-name>
```

### ALB not created
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
kubectl describe ingress -n mosaiclife
```

### Certificate issues
```bash
aws acm describe-certificate --certificate-arn $CERT_ARN
```

### IRSA issues
```bash
kubectl describe sa core-api -n mosaiclife
```

## Security Considerations

1. **Secrets Management**: All sensitive config stored in AWS Secrets Manager
2. **IRSA**: Pod-level IAM roles via service accounts
3. **Network Policies**: Restrict pod-to-pod communication
4. **Pod Security**: Non-root containers, read-only root filesystem
5. **WAF**: Configure WAF rules on ALB (optional, set ARN in values)
6. **MFA**: Enable for Cognito users
7. **CloudTrail**: All API calls logged
8. **VPC Flow Logs**: Enable for network monitoring

## Cost Optimization

1. **Spot Instances**: Consider mixed node groups (on-demand + spot)
2. **S3 Lifecycle**: Media transitions to IA/Glacier
3. **EBS Snapshots**: Automated with lifecycle policies
4. **Reserved Instances**: For predictable workloads
5. **VPC Endpoints**: Reduce NAT gateway costs
6. **HPA**: Scale down during low traffic

## Additional Resources

- [AWS Load Balancer Controller Docs](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [eksctl Documentation](https://eksctl.io/)
- [Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [External Secrets Operator](https://external-secrets.io/)
