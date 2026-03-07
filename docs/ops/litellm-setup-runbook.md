# LiteLLM One-Time Setup Runbook

## Prerequisites

- AWS CLI configured with admin access
- kubectl configured for EKS cluster
- Access to Aurora PostgreSQL (via kubectl port-forward or bastion)

## 1. Create Aurora Database and User

Connect to Aurora PostgreSQL:

    kubectl run -n mosaic-prod psql-client --rm -it --image=postgres:16 -- \
      psql "postgresql://<admin-user>:<password>@<aurora-endpoint>:5432/mosaic"

Run:

    CREATE DATABASE litellm;
    CREATE USER litellm WITH PASSWORD '<generated-password>';
    GRANT ALL PRIVILEGES ON DATABASE litellm TO litellm;
    \c litellm
    GRANT ALL ON SCHEMA public TO litellm;

## 2. Create AWS Secrets Manager Secret

    aws secretsmanager create-secret \
      --name mosaic/shared/litellm/credentials \
      --region us-east-1 \
      --secret-string '{
        "master_key": "sk-litellm-<generate-with-openssl-rand-hex-32>",
        "salt_key": "sk-salt-<generate-with-openssl-rand-hex-32>",
        "db_username": "litellm",
        "db_password": "<same-password-as-step-1>",
        "db_host": "<aurora-cluster-endpoint>",
        "db_port": "5432",
        "db_name": "litellm"
      }'

## 3. Create IRSA Role

Create in this repository's CDK app under `infra/cdk/`.

The LiteLLM IRSA role is application-owned infrastructure, not shared cluster foundation. It is defined in the dedicated stack:

  infra/cdk/lib/litellm-shared-stack.ts

### Trust Policy

    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Federated": "arn:aws:iam::033691785857:oidc-provider/<EKS_OIDC_PROVIDER>"
          },
          "Action": "sts:AssumeRoleWithWebIdentity",
          "Condition": {
            "StringEquals": {
              "<EKS_OIDC_PROVIDER>:sub": "system:serviceaccount:aiservices:litellm",
              "<EKS_OIDC_PROVIDER>:aud": "sts.amazonaws.com"
            }
          }
        }
      ]
    }

### Permissions Policy

    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "BedrockInvoke",
          "Effect": "Allow",
          "Action": [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream"
          ],
          "Resource": "arn:aws:bedrock:us-east-1::foundation-model/*"
        },
        {
          "Sid": "BedrockGuardrails",
          "Effect": "Allow",
          "Action": [
            "bedrock:ApplyGuardrail",
            "bedrock:GetGuardrail"
          ],
          "Resource": "arn:aws:bedrock:us-east-1:033691785857:guardrail/*"
        },
        {
          "Sid": "SecretsManagerRead",
          "Effect": "Allow",
          "Action": [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret"
          ],
          "Resource": "arn:aws:secretsmanager:us-east-1:033691785857:secret:mosaic/shared/litellm/*"
        }
      ]
    }

### Build and Synth the CDK App

    cd infra/cdk
    npm run build
    npx cdk synth MosaicLiteLLMSharedStack

### Deploy the LiteLLM Shared Stack

    cd infra/cdk
    npx cdk deploy MosaicLiteLLMSharedStack

## 4. Update Helm Values with Role ARN

No manual ArgoCD override is required. The Helm chart already points at the CDK-managed role ARN in:

    infra/helm/litellm/values.yaml

Expected value:

    serviceAccount:
      annotations:
        eks.amazonaws.com/role-arn: arn:aws:iam::033691785857:role/mosaic-shared-litellm-role

## 5. Deploy

Push changes to `main` branch. ArgoCD will automatically:
1. Create the `aiservices` namespace
2. Deploy ServiceAccount, ExternalSecret, ConfigMap, Deployment, Service, NetworkPolicy
3. LiteLLM will auto-migrate its database schema on first startup

## 6. Verify

  # Check the CDK-managed role exists
  aws iam get-role --role-name mosaic-shared-litellm-role

  # Check the ServiceAccount annotation in the rendered chart or cluster
  kubectl get sa -n aiservices litellm -o yaml | grep role-arn

    # Check pod is running
    kubectl get pods -n aiservices

    # Check logs
    kubectl logs -n aiservices -l app.kubernetes.io/name=litellm

    # Port-forward to test
    kubectl port-forward -n aiservices svc/litellm 4000:4000

    # Test health
    curl http://localhost:4000/health/liveliness

    # Test model list (requires master key)
    curl -H "Authorization: Bearer sk-litellm-..." http://localhost:4000/v1/models