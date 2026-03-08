import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class LiteLLMSharedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const clusterId = 'D491975E1999961E7BBAAE1A77332FBA';
    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`;
    const oidcProviderUrl = `oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`;

    const litellmRole = new iam.Role(this, 'LiteLLMSharedRole', {
      roleName: 'mosaic-shared-litellm-role',
      description: 'IAM role for LiteLLM shared service in EKS (Bedrock, guardrails, Secrets Manager)',
      assumedBy: new iam.FederatedPrincipal(
        oidcProviderArn,
        {
          StringEquals: {
            [`${oidcProviderUrl}:sub`]: 'system:serviceaccount:aiservices:litellm',
            [`${oidcProviderUrl}:aud`]: 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    litellmRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowBedrockInvoke',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        ],
      })
    );

    litellmRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowBedrockGuardrails',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:ApplyGuardrail',
          'bedrock:GetGuardrail',
        ],
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:guardrail/*`],
      })
    );

    litellmRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowLiteLLMSecretsRead',
        effect: iam.Effect.ALLOW,
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:mosaic/shared/litellm/*`,
        ],
      })
    );

    cdk.Tags.of(litellmRole).add('Project', 'MosaicLife');
    cdk.Tags.of(litellmRole).add('Environment', 'shared');
    cdk.Tags.of(litellmRole).add('ManagedBy', 'CDK');
    cdk.Tags.of(litellmRole).add('Component', 'IAM');

    new cdk.CfnOutput(this, 'LiteLLMSharedRoleArn', {
      value: litellmRole.roleArn,
      description: 'IRSA role ARN for the shared LiteLLM service',
      exportName: 'mosaic-shared-litellm-role-arn',
    });
  }
}