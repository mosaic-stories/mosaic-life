import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as neptune from '@aws-cdk/aws-neptune-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface NeptuneDatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  environments: string[];  // e.g., ['prod', 'staging'] — creates secrets + IRSA per env
}

/**
 * Neptune Graph Database Stack (Shared Cluster)
 *
 * A SINGLE Neptune cluster shared by all environments (prod, staging).
 * Data isolation is handled at the application layer via prefix-label strategy.
 *
 * The stack creates:
 * - One Neptune cluster (shared)
 * - One Secrets Manager secret PER environment (same host, different env_prefix)
 * - One IRSA role PER environment (scoped to its K8s namespace)
 *
 * Configuration:
 * - db.t4g.medium writer (2 vCPU, 4 GB RAM) - ~$70/month
 * - Single writer, no readers (add readers later for scaling)
 * - IAM authentication (SigV4 signing, no username/password)
 * - openCypher query language
 * - Encrypted at rest
 * - 7-day automated backups
 */
export class NeptuneDatabaseStack extends cdk.Stack {
  public readonly dbCluster: neptune.DatabaseCluster;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NeptuneDatabaseStackProps) {
    super(scope, id, props);

    const { vpc, environments } = props;

    // ============================================================
    // Security Group for Neptune
    // ============================================================
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'NeptuneSecurityGroup', {
      vpc,
      securityGroupName: 'mosaic-neptune-sg',
      description: 'Security group for Neptune graph database cluster (shared)',
      allowAllOutbound: false,
    });

    const vpcCidr = vpc.vpcCidrBlock || '10.0.0.0/16';
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(8182),
      'Allow Neptune traffic from VPC'
    );

    // ============================================================
    // Cluster Parameter Group
    // ============================================================
    const clusterParameterGroup = new neptune.ClusterParameterGroup(this, 'NeptuneClusterParameterGroup', {
      description: 'Cluster parameter group for Mosaic Life Neptune',
      family: neptune.ParameterGroupFamily.NEPTUNE_1_4,
      parameters: {
        neptune_enable_audit_log: '1',
      },
    });

    // ============================================================
    // Instance Parameter Group
    // ============================================================
    const parameterGroup = new neptune.ParameterGroup(this, 'NeptuneParameterGroup', {
      description: 'Instance parameter group for Mosaic Life Neptune',
      family: neptune.ParameterGroupFamily.NEPTUNE_1_4,
      parameters: {
        neptune_query_timeout: '120000',
      },
    });

    // ============================================================
    // Neptune Database Cluster
    // ============================================================
    this.dbCluster = new neptune.DatabaseCluster(this, 'NeptuneCluster', {
      dbClusterName: 'mosaic-neptune',  // Single shared cluster (not per-environment)
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.dbSecurityGroup],

      // Engine version (must match parameter group family neptune1.4)
      engineVersion: neptune.EngineVersion.V1_4_4_0,

      // Single writer instance
      instanceType: neptune.InstanceType.T4G_MEDIUM,
      instances: 1,

      // Parameter groups
      clusterParameterGroup,
      parameterGroup,

      // IAM authentication
      iamAuthentication: true,

      // Encryption at rest
      storageEncrypted: true,

      // Backup configuration
      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '03:00-04:00',
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',

      // Auto minor version upgrade
      autoMinorVersionUpgrade: true,

      // Deletion protection (always on — shared cluster holds prod data)
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,

      // CloudWatch log exports
      cloudwatchLogsExports: [neptune.LogType.AUDIT],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
    });

    // ============================================================
    // Per-Environment: Connection Secrets + IRSA Roles
    // ============================================================
    // Both environments share the same cluster endpoint.
    // The env_prefix field tells the GraphAdapter which label prefix to use.
    const clusterId = 'D491975E1999961E7BBAAE1A77332FBA';

    for (const environment of environments) {
      const envTitle = environment.charAt(0).toUpperCase() + environment.slice(1);

      // Connection Secret (same host/port, different env_prefix)
      const connectionSecret = new secretsmanager.Secret(this, `NeptuneConnectionSecret${envTitle}`, {
        secretName: `mosaic/${environment}/neptune/connection`,
        description: `Neptune connection metadata for ${environment}`,
        secretObjectValue: {
          host: cdk.SecretValue.unsafePlainText(this.dbCluster.clusterEndpoint.hostname),
          port: cdk.SecretValue.unsafePlainText('8182'),
          engine: cdk.SecretValue.unsafePlainText('neptune'),
          iam_auth: cdk.SecretValue.unsafePlainText('true'),
          region: cdk.SecretValue.unsafePlainText(this.region),
          env_prefix: cdk.SecretValue.unsafePlainText(environment),
        },
      });

      // IRSA Role (scoped to this environment's K8s namespace)
      const neptuneAccessRole = new iam.Role(this, `NeptuneAccessRole${envTitle}`, {
        roleName: `mosaic-${environment}-neptune-access-role`,
        description: `IAM role for ${environment} core-api to access Neptune via IRSA`,
        assumedBy: new iam.FederatedPrincipal(
          `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`,
          {
            StringEquals: {
              [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:sub`]:
                `system:serviceaccount:mosaic-${environment}:core-api-secrets-sa`,
              [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:aud`]:
                'sts.amazonaws.com',
            },
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
      });

      // Grant read access to this environment's connection secret only
      connectionSecret.grantRead(neptuneAccessRole);

      // Grant Neptune IAM DB connect access (same cluster for all envs)
      neptuneAccessRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['neptune-db:connect'],
        resources: [
          `arn:aws:neptune-db:${this.region}:${this.account}:${this.dbCluster.clusterResourceIdentifier}/*`,
        ],
      }));

      // Per-environment outputs
      new cdk.CfnOutput(this, `NeptuneSecretArn${envTitle}`, {
        value: connectionSecret.secretArn,
        description: `ARN of Neptune connection secret (${environment})`,
        exportName: `mosaic-${environment}-neptune-secret-arn`,
      });

      new cdk.CfnOutput(this, `NeptuneAccessRoleArn${envTitle}`, {
        value: neptuneAccessRole.roleArn,
        description: `IAM role ARN for Neptune access (${environment})`,
        exportName: `mosaic-${environment}-neptune-access-role-arn`,
      });
    }

    // ============================================================
    // Shared Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'NeptuneClusterEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: 'Neptune cluster writer endpoint (shared)',
      exportName: 'mosaic-neptune-endpoint',
    });

    new cdk.CfnOutput(this, 'NeptuneClusterPort', {
      value: '8182',
      description: 'Neptune cluster port',
      exportName: 'mosaic-neptune-port',
    });

    new cdk.CfnOutput(this, 'NeptuneSecurityGroupId', {
      value: this.dbSecurityGroup.securityGroupId,
      description: 'Security group ID for Neptune cluster',
      exportName: 'mosaic-neptune-sg-id',
    });

    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: 'db.t4g.medium: ~$70/month + storage/IO: ~$6-11/month = ~$76-81/month total (shared by all envs)',
      description: 'Estimated monthly cost for Neptune configuration',
    });
  }
}
