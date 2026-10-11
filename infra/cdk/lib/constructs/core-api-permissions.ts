import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

/**
 * Shared core-api permissions.
 *
 * Defined once and attached to either principal: the EKS IRSA role (while the
 * `eksRoles` context is true) or the ECS task role. Statement Sids, actions and
 * resources are copied unchanged from the original IRSA role definitions so
 * attaching them to the live IRSA roles is not an effective IAM change
 * (apart from the added SES statement).
 */
export interface CoreApiPermissionsProps {
  environment: string;
  account: string;
  region: string;
  mediaBucket: s3.IBucket;
  backupBucket: s3.IBucket;
  /** Bedrock guardrail ARN for ApplyGuardrail. */
  guardrailArn: string;
  /** Graph backend; 'neptune' adds the Neptune data-plane statements. */
  graph?: string;
  /** Allow GetSecretValue on `mosaic/{env}/*`. Default true. */
  includeSecretsRead?: boolean;
  /** Verified SES identity (domain). Default `mosaiclife.me`. */
  sesIdentity?: string;
}

const BEDROCK_REGIONS = ['us-east-1', 'us-east-2', 'us-west-2'];

/** Non-S3 policy statements (S3 uses bucket grants so the actions track CDK). */
export function coreApiStatements(props: CoreApiPermissionsProps): iam.PolicyStatement[] {
  const { environment, account, region, guardrailArn, graph } = props;
  const sesIdentity = props.sesIdentity ?? 'mosaiclife.me';

  const statements: iam.PolicyStatement[] = [
    new iam.PolicyStatement({
      sid: 'AllowBedrockInvoke',
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        // Claude foundation models; cross-region inference may route to any US region
        ...BEDROCK_REGIONS.map((r) => `arn:aws:bedrock:${r}::foundation-model/anthropic.*`),
        ...BEDROCK_REGIONS.map((r) => `arn:aws:bedrock:${r}:${account}:inference-profile/us.anthropic.*`),
        // Amazon Titan Embeddings for AI memory/RAG
        ...BEDROCK_REGIONS.map((r) => `arn:aws:bedrock:${r}::foundation-model/amazon.titan-embed-text-v2:0`),
      ],
    }),
    // Newer Bedrock models (e.g. Claude Haiku 4.5+) require a marketplace agreement handshake.
    new iam.PolicyStatement({
      sid: 'AllowBedrockMarketplaceSubscription',
      effect: iam.Effect.ALLOW,
      actions: [
        'aws-marketplace:ViewSubscriptions',
        'aws-marketplace:Subscribe',
        'aws-marketplace:Unsubscribe',
      ],
      resources: ['*'],
    }),
    new iam.PolicyStatement({
      sid: 'AllowBedrockGuardrail',
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:ApplyGuardrail'],
      resources: [guardrailArn],
    }),
    new iam.PolicyStatement({
      sid: 'AllowSesSend',
      effect: iam.Effect.ALLOW,
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [`arn:aws:ses:${region}:${account}:identity/${sesIdentity}`],
    }),
  ];

  if (props.includeSecretsRead ?? true) {
    statements.push(
      new iam.PolicyStatement({
        sid: 'AllowEnvSecretsAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${region}:${account}:secret:mosaic/${environment}/*`],
      }),
    );
  }

  if (graph === 'neptune') {
    const neptuneArn = cdk.Fn.importValue('mosaic-neptune-data-plane-resource-arn');
    statements.push(
      new iam.PolicyStatement({
        sid: 'AllowNeptuneConnect',
        effect: iam.Effect.ALLOW,
        actions: ['neptune-db:connect'],
        resources: [neptuneArn],
      }),
      new iam.PolicyStatement({
        sid: 'AllowNeptuneOpenCypherQueries',
        effect: iam.Effect.ALLOW,
        actions: [
          'neptune-db:ReadDataViaQuery',
          'neptune-db:WriteDataViaQuery',
          'neptune-db:DeleteDataViaQuery',
          'neptune-db:GetQueryStatus',
        ],
        resources: [neptuneArn],
        conditions: { StringEquals: { 'neptune-db:QueryLanguage': 'OpenCypher' } },
      }),
    );
  }

  return statements;
}

/** Attach the shared core-api permissions (S3 + statements) to a role/principal. */
export function grantCoreApiPermissions(grantee: iam.IGrantable, props: CoreApiPermissionsProps): void {
  props.mediaBucket.grantReadWrite(grantee);
  props.backupBucket.grantReadWrite(grantee);
  coreApiStatements(props).forEach((s) => grantee.grantPrincipal.addToPrincipalPolicy(s));
}
