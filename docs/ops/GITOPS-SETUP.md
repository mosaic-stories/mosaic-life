# GitOps Repository Setup Guide

## Architecture Overview

Mosaic Life follows GitOps best practices with **separation of concerns**:

### Repository Structure

```
mosaic-life/                          # Application Repository
├── infra/helm/mosaic-life/           # Helm chart definition
│   ├── Chart.yaml                    # Chart metadata
│   ├── values.yaml                   # Default values
│   └── templates/                    # Kubernetes manifests
└── infra/argocd/                     # ArgoCD configurations
    ├── applications/                 # Application definitions
    └── projects/                     # Project definitions

gitops/                               # GitOps Repository (separate)
├── base/                             # Common values across all environments
│   └── values.yaml
└── environments/
    ├── prod/
    │   └── values.yaml               # Production overrides
    └── staging/
        └── values.yaml               # Staging overrides
```

### Design Principles

1. **Helm Charts** live with **application code** (mosaic-life repo)
   - Single source of truth for application structure
   - Versioned with application releases
   - Developers maintain chart structure

2. **Environment Values** live in **GitOps repo** (gitops repo)
   - Environment-specific configuration
   - Separate deployment/rollback per environment
   - Ops teams control environment settings

3. **ArgoCD Multi-Source** pulls from both repositories
   - Chart from `mosaic-life` repo
   - Values from `gitops` repo
   - Automatic sync and drift detection

## ArgoCD Multi-Source Configuration

### How It Works

ArgoCD v2.6+ supports multiple sources in a single application:

```yaml
spec:
  sources:
    # Source 1: Helm chart from application repo
    - repoURL: https://github.com/mosaic-stories/mosaic-life
      path: infra/helm/mosaic-life
      helm:
        valueFiles:
          - $values/environments/prod/values.yaml
          - $values/base/values.yaml
    
    # Source 2: Values from GitOps repo
    - repoURL: https://github.com/mosaic-stories/gitops.git
      ref: values  # Referenced as $values in source 1
```

### Value Precedence

Values are merged in this order (last wins):

1. `infra/helm/mosaic-life/values.yaml` (chart defaults)
2. `base/values.yaml` (common overrides)
3. `environments/{env}/values.yaml` (environment-specific)

## Workflow

### Making Application Changes

```bash
# 1. Update Helm chart in mosaic-life repo
cd /apps/mosaic-life
vim infra/helm/mosaic-life/templates/deployment.yaml

# 2. Commit and push
git add infra/helm/
git commit -m "feat: add new deployment configuration"
git push

# 3. ArgoCD automatically syncs
# (chart updates apply to all environments)
```

### Making Environment-Specific Changes

```bash
# 1. Update values in gitops repo
cd /apps/mosaic-life-gitops
vim environments/prod/values.yaml

# 2. Commit and push
git add environments/prod/
git commit -m "ops: scale prod replicas to 5"
git push

# 3. ArgoCD automatically syncs
# (only prod environment affected)
```

### Manual Sync

```bash
# Sync specific environment
just argocd-sync mosaic-life-prod

# Watch sync progress
just argocd-watch mosaic-life-prod
```

## Team Development Benefits

### For Application Developers

- **Own the chart structure** - Changes to app architecture update the chart
- **Test locally** - `helm install` works with local values
- **Version with code** - Chart versions match app versions

### For Operations Teams

- **Control scaling** - Adjust replicas without touching app code
- **Manage secrets** - Environment-specific configurations
- **Independent rollbacks** - Roll back config without rolling back code

### For Everyone

- **Audit trail** - All changes tracked in Git
- **Review process** - PRs for both app and config changes
- **Automated deployment** - Push to Git, ArgoCD handles the rest

## Migration from Single-Source

If you have existing single-source applications, migrate like this:

```bash
# 1. Create multi-source version
cat infra/argocd/applications/mosaic-life-prod-multisource.yaml

# 2. Apply the new configuration
kubectl apply -f infra/argocd/applications/mosaic-life-prod-multisource.yaml

# 3. Verify sync works
argocd app sync mosaic-life-prod

# 4. Remove old configuration (if needed)
# The new one will replace it (same name)
```

## Troubleshooting

### "authentication required" Error

```bash
# Verify repos are configured in ArgoCD
argocd repo list

# Add missing repo
argocd repo add https://github.com/mosaic-stories/gitops.git
argocd repo add https://github.com/mosaic-stories/mosaic-life
```

### "not permitted in project" Error

```bash
# Update project to allow both repos
kubectl edit appproject mosaic-life -n argocd

# Add to spec.sourceRepos:
# - 'https://github.com/mosaic-stories/mosaic-life'
# - 'https://github.com/mosaic-stories/gitops.git'
```

### Values Not Applied

```bash
# Check value precedence
argocd app manifests mosaic-life-prod

# Verify values file exists in gitops repo
cd /apps/mosaic-life-gitops
git pull
cat environments/prod/values.yaml
```

## References

- [ArgoCD Multi-Source Apps](https://argo-cd.readthedocs.io/en/stable/user-guide/multiple_sources/)
- [Helm Values Files](https://helm.sh/docs/chart_template_guide/values_files/)
- [GitOps Principles](https://opengitops.dev/)
