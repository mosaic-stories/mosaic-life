# ALB and DNS Configuration

## Overview

The Mosaic Life application uses a **single shared Application Load Balancer (ALB)** that routes traffic to multiple backend services based on hostname. DNS records are automatically managed by External DNS.

## Architecture

```
Internet
    ↓
AWS ALB (single, shared)
    ↓ (host-based routing)
    ├─→ mosaiclife.me          → web service (frontend)
    ├─→ frontend.mosaiclife.me → web service (frontend)
    ├─→ api.mosaiclife.me      → core-api service (backend)
    └─→ backend.mosaiclife.me  → core-api service (backend)
```

## Components

### 1. AWS Load Balancer Controller

**Purpose:** Provisions and manages ALBs from Kubernetes Ingress resources.

**Installation:** Deployed via Helm in the infrastructure repository.

**Configuration:**
- **Namespace:** `kube-system`
- **IRSA Role:** `arn:aws:iam::033691785857:role/mosaiclife-aws-load-balancer-controller`
- **IngressClass:** `alb`

**Key Features:**
- Creates ALBs with proper AWS tags
- Manages target groups and health checks
- Integrates with ACM for HTTPS certificates
- Supports IP target type for direct pod routing

### 2. External DNS

**Purpose:** Automatically creates and updates Route53 DNS records based on Ingress hostnames.

**Installation:** Deployed via Helm in the infrastructure repository.

**Configuration:**
- **Namespace:** `kube-system`
- **IRSA Role:** `arn:aws:iam::033691785857:role/mosaiclife-external-dns`
- **Hosted Zone:** `mosaiclife.me` (Z039487930F6987CJO4W9)
- **TTL:** 300 seconds (5 minutes)

**Key Features:**
- Monitors Ingress resources for hostname annotations
- Creates A records pointing to ALB DNS name
- Cleans up records when Ingress is deleted
- Uses TXT records for ownership tracking

### 3. Shared ALB Configuration

To ensure both web and core-api services use the **same ALB**, we use the `group.name` annotation:

```yaml
alb.ingress.kubernetes.io/group.name: mosaic-life-main
```

This annotation tells the AWS Load Balancer Controller to:
1. Create a single ALB for all Ingresses with the same group name
2. Configure multiple listeners and rules for different hostnames
3. Share the ALB across multiple Kubernetes Ingress resources

**Group Order:**
- Web (frontend): `group.order: "10"` (evaluated first)
- Core API (backend): `group.order: "20"` (evaluated second)

## SSL/TLS Configuration

### ACM Certificate

**ARN:** `arn:aws:acm:us-east-1:033691785857:certificate/2988e3f2-676b-4401-b59f-34149da4a051`

**Coverage:**
- `mosaiclife.me`
- `*.mosaiclife.me` (wildcard)
- Specific SANs: `frontend.mosaiclife.me`, `api.mosaiclife.me`, `backend.mosaiclife.me`, `chat.mosaiclife.me`, `graph.mosaiclife.me`

**Status:** ISSUED (auto-renewing)

### HTTPS Configuration

- **Listeners:** HTTP (80) and HTTPS (443)
- **SSL Redirect:** All HTTP traffic redirected to HTTPS (443)
- **TLS Version:** TLS 1.2+ (ALB default)
- **Certificate:** Attached to HTTPS listener via annotation

## Ingress Annotations Reference

### Web Service (`web-ingress.yaml`)

```yaml
# Shared ALB
alb.ingress.kubernetes.io/group.name: mosaic-life-main
alb.ingress.kubernetes.io/group.order: "10"

# ALB Configuration
alb.ingress.kubernetes.io/scheme: internet-facing
alb.ingress.kubernetes.io/target-type: ip
alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
alb.ingress.kubernetes.io/ssl-redirect: "443"
alb.ingress.kubernetes.io/certificate-arn: <ACM_CERT_ARN>

# Health Checks
alb.ingress.kubernetes.io/healthcheck-path: /
alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
alb.ingress.kubernetes.io/healthy-threshold-count: "2"
alb.ingress.kubernetes.io/unhealthy-threshold-count: "3"

# External DNS
external-dns.alpha.kubernetes.io/hostname: "mosaiclife.me,frontend.mosaiclife.me"
external-dns.alpha.kubernetes.io/ttl: "300"
# Use ALIAS record for apex domain (required for zone apex)
external-dns.alpha.kubernetes.io/alias: "true"
```

### Core API Service (`core-api-ingress.yaml`)

```yaml
# Shared ALB (same as web)
alb.ingress.kubernetes.io/group.name: mosaic-life-main
alb.ingress.kubernetes.io/group.order: "20"

# ALB Configuration
alb.ingress.kubernetes.io/scheme: internet-facing
alb.ingress.kubernetes.io/target-type: ip
alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
alb.ingress.kubernetes.io/ssl-redirect: "443"
alb.ingress.kubernetes.io/certificate-arn: <ACM_CERT_ARN>

# SSE/Streaming Support (per SHARED-SERVICES §4)
alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600

# Health Checks
alb.ingress.kubernetes.io/healthcheck-path: /healthz
alb.ingress.kubernetes.io/healthcheck-interval-seconds: "15"
alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
alb.ingress.kubernetes.io/success-codes: "200"

# External DNS
external-dns.alpha.kubernetes.io/hostname: "api.mosaiclife.me,backend.mosaiclife.me"
external-dns.alpha.kubernetes.io/ttl: "300"
```

## Deployment Process

### Important: Apex Domain ALIAS Records

⚠️ **Note:** The apex domain (`mosaiclife.me`) requires an ALIAS record instead of a CNAME record. AWS Route53 does not permit CNAME records at the zone apex per DNS standards. The `external-dns.alpha.kubernetes.io/alias: "true"` annotation tells external-dns to create an ALIAS record (which resolves to A records) instead of a CNAME.

**Why ALIAS over CNAME for apex domains:**
- DNS standards prohibit CNAME records at the zone apex
- ALIAS records are Route53-specific and resolve to A records
- ALIAS records support zone apex and have no additional cost

### 1. Deploy Application

```bash
# Deploy via justfile
just helm-deploy

# Or manually with Helm
helm upgrade --install mosaic-life infra/helm/mosaic-life \
  --namespace mosaiclife \
  --create-namespace \
  --wait
```

### 2. Verify ALB Creation

```bash
# Check ingress status
kubectl get ingress -n mosaiclife

# Wait for ADDRESS to be populated (ALB DNS name)
kubectl get ingress -n mosaiclife -w
```

Expected output:
```
NAME       CLASS   HOSTS                                     ADDRESS                                                   PORTS   AGE
core-api   alb     backend.mosaiclife.me,api.mosaiclife.me   k8s-mosaicli-mosaicl-abc123-456789.us-east-1.elb.amazonaws.com   80,443  2m
web        alb     mosaiclife.me,frontend.mosaiclife.me      k8s-mosaicli-mosaicl-abc123-456789.us-east-1.elb.amazonaws.com   80,443  2m
```

### 3. Verify DNS Records

```bash
# Check Route53 records (via AWS CLI)
aws route53 list-resource-record-sets \
  --hosted-zone-id Z039487930F6987CJO4W9 \
  --query "ResourceRecordSets[?contains(Name, 'mosaiclife.me')]"

# Or use nslookup/dig
nslookup mosaiclife.me
nslookup api.mosaiclife.me
```

DNS propagation typically takes 1-5 minutes after ALB creation.

### 4. Test Endpoints

```bash
# Frontend (should serve React app)
curl -I https://mosaiclife.me

# Backend API (should return 404 or health check)
curl -I https://api.mosaiclife.me/healthz
```

## Troubleshooting

### ALB Not Created

**Check controller logs:**
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --tail=100
```

**Common issues:**
- Missing IAM permissions (check IRSA role)
- Invalid certificate ARN
- Missing subnet tags (`kubernetes.io/role/elb`)
- Security group issues

**Verify IngressClass:**
```bash
kubectl get ingressclass
# Should show: alb   ingress.k8s.aws/alb
```

### DNS Records Not Created

**Check external-dns logs:**
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=external-dns --tail=100
```

**Common issues:**
- Missing IAM permissions (Route53)
- Incorrect hosted zone ID
- Missing external-dns annotations on Ingress
- Annotation format errors (check comma-separated hostnames)

**Verify External DNS is watching:**
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=external-dns | grep mosaiclife
```

### HTTPS Not Working

**Verify certificate is attached:**
```bash
kubectl describe ingress -n mosaiclife | grep certificate-arn
```

**Check ALB listener configuration:**
```bash
# Get ALB ARN from ingress
ALB_DNS=$(kubectl get ingress web -n mosaiclife -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
ALB_NAME=$(echo $ALB_DNS | cut -d'-' -f1-3)

# Describe ALB
aws elbv2 describe-load-balancers --names $ALB_NAME
aws elbv2 describe-listeners --load-balancer-arn <ALB_ARN>
```

### Health Checks Failing

**Check pod health:**
```bash
kubectl get pods -n mosaiclife
kubectl logs -n mosaiclife <pod-name>
```

**Check target group health:**
```bash
# Get target group ARNs
aws elbv2 describe-target-groups --query "TargetGroups[?contains(LoadBalancerArns[0], 'mosaic')]"

# Check target health
aws elbv2 describe-target-health --target-group-arn <TG_ARN>
```

## Cost Optimization

**Single ALB Strategy:**
- Using `group.name` annotation = 1 ALB instead of 2+ = ~$16/month savings
- ALB pricing: ~$22.50/month base + traffic costs
- Multiple services share listener rules (no additional cost)

**DNS Queries:**
- Route53: $0.40 per hosted zone + $0.40 per million queries
- Low query volume for internal services

## Security Considerations

### WAF Integration (Future)

To add AWS WAF protection:

```yaml
alb.ingress.kubernetes.io/wafv2-acl-arn: arn:aws:wafv2:us-east-1:033691785857:regional/webacl/...
```

### Security Groups

ALB automatically creates and manages security groups:
- **Inbound:** 80, 443 from 0.0.0.0/0
- **Outbound:** Dynamic ports to pod IPs

### Network Policies

See `networkpolicy.yaml` for pod-level traffic restrictions.

## References

- [AWS Load Balancer Controller Documentation](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [External DNS Documentation](https://github.com/kubernetes-sigs/external-dns)
- [ALB Ingress Annotations](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.6/guide/ingress/annotations/)
- [SHARED-SERVICES.md](./SHARED-SERVICES.md) - Section 4: Networking, Ingress, and Security Edge

## Maintenance

### Updating Certificate

If certificate ARN changes, update:
1. `infra/helm/mosaic-life/values.yaml` → `global.aws.certificateArn`
2. Redeploy: `just helm-deploy`

### Adding New Services

To add a new service to the shared ALB:

1. Create service Ingress with same group name:
```yaml
annotations:
  alb.ingress.kubernetes.io/group.name: mosaic-life-main
  alb.ingress.kubernetes.io/group.order: "30"  # Next in order
  external-dns.alpha.kubernetes.io/hostname: "newservice.mosaiclife.me"
```

2. Add hostname to ACM certificate (if needed)
3. Deploy

### Rotating DNS TTL

To change DNS TTL (currently 300s):
1. Update `external-dns.alpha.kubernetes.io/ttl` annotation
2. Redeploy
3. Wait 2x old TTL for propagation

---

**Last Updated:** October 5, 2025  
**Owners:** @hewjoe, @drunkie-tech  
**Infrastructure Repo:** https://github.com/mosaic-stories/infrastructure
