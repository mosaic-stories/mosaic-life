# ArgoCD GitOps Configuration

This directory contains ArgoCD application and project manifests for the Mosaic Life platform.

## Structure

```
argocd/
├── projects/
│   └── mosaic-life.yaml              # AppProject definition
├── applications/
│   ├── mosaic-life-prod.yaml         # Production application
│   ├── mosaic-life-staging.yaml      # Staging application
│   └── mosaic-life-preview-template.yaml  # Template for PR previews
└── README.md
```

## GitOps Repository Structure

The GitOps repository (`mosaic-stories/mosaic-gitops`) should have the following structure:

```
mosaic-gitops/
├── environments/
│   ├── prod/
│   │   ├── values.yaml              # Production-specific values
│   │   └── secrets.yaml             # Sealed secrets (if using Sealed Secrets)
│   ├── staging/
│   │   ├── values.yaml              # Staging-specific values
│   │   └── secrets.yaml
│   └── preview/
│       └── values-template.yaml     # Template for preview environments
├── base/
│   └── values.yaml                  # Base values shared across environments
└── README.md
```

## Deployment Flow

### Production Deployment

1. Code is merged to `main` branch
2. GitHub Actions builds and pushes Docker images to ECR
3. GitHub Actions updates image tags in `mosaic-gitops/environments/prod/values.yaml`
4. ArgoCD detects changes and syncs the application
5. Deployment is rolled out to `mosaic-prod` namespace

### Staging Deployment

1. Code is merged to `develop` branch
2. Similar flow as production but targets `mosaic-staging` namespace

### Preview Environments

1. PR is opened or updated
2. GitHub Actions:
   - Builds and pushes preview images
   - Creates namespace `preview-pr-{number}`
   - Deploys using Helm directly (or creates ArgoCD Application)
3. PR is closed → namespace is cleaned up

## Setup Instructions

### 1. Install ArgoCD Applications

```bash
# Apply the AppProject
kubectl apply -f infra/argocd/projects/mosaic-life.yaml

# Apply environment applications
kubectl apply -f infra/argocd/applications/mosaic-life-prod.yaml
kubectl apply -f infra/argocd/applications/mosaic-life-staging.yaml
```

### 2. Configure Repository Access

ArgoCD needs access to both repositories:

```bash
# Add main repository
argocd repo add https://github.com/mosaic-stories/mosaic-life \
  --username mosaic-bot \
  --password $GITHUB_PAT

# Add GitOps repository
argocd repo add https://github.com/mosaic-stories/mosaic-gitops \
  --username mosaic-bot \
  --password $GITHUB_PAT
```

### 3. Configure Notifications (Optional)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  template.app-deployed: |
    message: Application {{.app.metadata.name}} is now running version {{.app.status.sync.revision}}.
  trigger.on-deployed: |
    - when: app.status.operationState.phase in ['Succeeded']
      send: [app-deployed]
```

## Environment Values

### Production (`environments/prod/values.yaml`)

```yaml
global:
  registry: 033691785857.dkr.ecr.us-east-1.amazonaws.com
  imageTag: main-abc123  # Updated by GitHub Actions
  domain: mosaiclife.me
  environment: prod

web:
  replicaCount: 2
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10

coreApi:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
```

### Staging (`environments/staging/values.yaml`)

```yaml
global:
  registry: 033691785857.dkr.ecr.us-east-1.amazonaws.com
  imageTag: develop-xyz789  # Updated by GitHub Actions
  domain: staging.mosaiclife.me
  environment: staging

web:
  replicaCount: 1
  autoscaling:
    enabled: false

coreApi:
  replicaCount: 2
  autoscaling:
    enabled: false
```

## Preview Environment Management

Preview environments are created automatically for PRs but can also be managed manually:

### Create Preview Environment

```bash
export PR_NUMBER=123
export BRANCH_NAME=feature-new-ui
export IMAGE_TAG=${BRANCH_NAME}-abc123

# Generate ArgoCD Application from template
sed -e "s/{{PR_NUMBER}}/$PR_NUMBER/g" \
    -e "s/{{BRANCH_NAME}}/$BRANCH_NAME/g" \
    -e "s/{{IMAGE_TAG}}/$IMAGE_TAG/g" \
    infra/argocd/applications/mosaic-life-preview-template.yaml | \
kubectl apply -f -
```

### Delete Preview Environment

```bash
kubectl delete application mosaic-life-preview-pr-123 -n argocd
kubectl delete namespace preview-pr-123
```

## Monitoring Deployments

### View Application Status

```bash
# Production
argocd app get mosaic-life-prod

# Staging
argocd app get mosaic-life-staging

# All preview environments
argocd app list --selector type=preview
```

### Sync Application Manually

```bash
argocd app sync mosaic-life-prod
argocd app sync mosaic-life-staging
```

### View Application Logs

```bash
argocd app logs mosaic-life-prod
```

## Rollback

### Rollback to Previous Version

```bash
# Get sync history
argocd app history mosaic-life-prod

# Rollback to specific revision
argocd app rollback mosaic-life-prod 10
```

### Rollback via GitOps

```bash
# Revert the image tag change in GitOps repo
cd mosaic-gitops
git revert <commit-hash>
git push
```

## Health Checks

ArgoCD monitors the following for health:

- Deployment readiness
- Service availability
- Ingress configuration
- Pod status
- HPA metrics

Custom health checks can be added in ArgoCD ConfigMap:

```yaml
resource.customizations.health.apps_Deployment: |
  hs = {}
  if obj.status.conditions ~= nil then
    for _, condition in ipairs(obj.status.conditions) do
      if condition.type == "Progressing" and condition.status == "False" then
        hs.status = "Degraded"
        hs.message = condition.message
        return hs
      end
    end
  end
  hs.status = "Healthy"
  return hs
```

## Troubleshooting

### Application Out of Sync

```bash
# View differences
argocd app diff mosaic-life-prod

# Force sync
argocd app sync mosaic-life-prod --force
```

### Deployment Stuck

```bash
# Get detailed status
kubectl describe application mosaic-life-prod -n argocd

# Check pod status
kubectl get pods -n mosaic-prod

# Check events
kubectl get events -n mosaic-prod --sort-by='.lastTimestamp'
```

### Image Pull Failures

Ensure ECR permissions are correctly configured:

```bash
# Verify service account annotations
kubectl get sa -n mosaic-prod -o yaml

# Check IRSA role
aws iam get-role --role-name mosaic-core-api-role
```

## Security Considerations

1. **RBAC**: AppProject defines who can sync which applications
2. **Repository Access**: Use separate tokens with minimal permissions
3. **Secrets**: Use External Secrets or Sealed Secrets, never commit plain secrets
4. **Image Verification**: Consider enabling cosign signature verification in ArgoCD
5. **Network Policies**: Preview environments have restricted network access

## Integration with GitHub Actions

The CI/CD pipeline integrates with ArgoCD in two ways:

1. **GitOps Updates**: Update image tags in GitOps repo → ArgoCD auto-syncs
2. **Direct Deploy**: Use `kubectl` for preview environments (faster feedback)

See `.github/workflows/build-push.yml` for the GitOps update flow.
