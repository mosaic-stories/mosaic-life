import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AuroraDatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  environment: string;
  snapshotIdentifier: string;
}

/**
 * Aurora PostgreSQL Database Stack
 *
 * Restored from an RDS PostgreSQL snapshot to enable extensions
 * not available on RDS (e.g., Apache AGE for graph relationships).
 *
 * Configuration:
 * - db.t4g.medium writer (2 vCPU, 4 GB RAM) - ~$50-60/month
 * - Single writer, no readers (add readers later for HA/scaling)
 * - Aurora-managed storage (auto-scales, encrypted)
 * - 7-day automated backups
 * - PostgreSQL 16.10 (Aurora compatible, matches RDS source)
 */
export class AuroraDatabaseStack extends cdk.Stack {
  public readonly dbCluster: rds.DatabaseCluster;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: AuroraDatabaseStackProps) {
    super(scope, id, props);

    const { vpc, environment, snapshotIdentifier } = props;

    // ============================================================
    // Security Group for Aurora
    // ============================================================
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc,
      securityGroupName: `mosaic-${environment}-aurora-sg`,
      description: 'Security group for Aurora PostgreSQL cluster',
      allowAllOutbound: false,
    });

    const vpcCidr = vpc.vpcCidrBlock || '10.0.0.0/16';
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL traffic from VPC'
    );

    // ============================================================
    // Cluster Parameter Group (Aurora PostgreSQL optimizations)
    // ============================================================
    const clusterParameterGroup = new rds.ParameterGroup(this, 'AuroraClusterParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_10,
      }),
      description: 'Custom cluster parameter group for Mosaic Life Aurora PostgreSQL',
      parameters: {
        // Connection settings
        'max_connections': '100',

        // Query optimization
        'random_page_cost': '1.1',
        // Note: effective_io_concurrency is managed by Aurora automatically
        // and is not modifiable in cluster parameter groups.

        // Logging
        'log_min_duration_statement': '1000',
        'log_connections': '1',
        'log_disconnections': '1',
        'log_lock_waits': '1',

        // Connection timeout settings
        'idle_in_transaction_session_timeout': '300000',
        'statement_timeout': '30000',
      },
    });

    // Note: shared_buffers, effective_cache_size, maintenance_work_mem, work_mem
    // are managed by Aurora automatically based on instance class. Do NOT set
    // these in the cluster parameter group — Aurora optimizes them.
    //
    // Similarly, wal_buffers and checkpoint_completion_target are Aurora-managed
    // WAL settings and should not be overridden.

    // ============================================================
    // Aurora PostgreSQL Cluster (from RDS snapshot)
    // ============================================================
    this.dbCluster = new rds.DatabaseClusterFromSnapshot(this, 'AuroraCluster', {
      snapshotIdentifier,

      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_10,
      }),

      // Single writer instance, no readers
      writer: rds.ClusterInstance.provisioned('writer', {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T4G,
          ec2.InstanceSize.MEDIUM // ~$50-60/month
        ),
        publiclyAccessible: false,
        autoMinorVersionUpgrade: true,
      }),

      // Network configuration
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.dbSecurityGroup],

      // Port
      port: 5432,

      // Cluster parameter group
      parameterGroup: clusterParameterGroup,

      // Storage encryption (Aurora manages storage automatically)
      storageEncrypted: true,

      // Backup configuration
      backup: {
        retention: cdk.Duration.days(7),
        preferredWindow: '03:00-04:00', // UTC
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',

      // Delete protection — safe during migration
      deletionProtection: environment === 'prod',

      // RETAIN during migration so we don't accidentally lose the cluster
      removalPolicy: cdk.RemovalPolicy.RETAIN,

      // CloudWatch log exports
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,

      // Cluster identifier
      clusterIdentifier: `mosaic-${environment}-aurora`,
    });

    // ============================================================
    // Secrets Manager — reference existing secret (created by DatabaseStack)
    // ============================================================
    const dbSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'DatabaseSecret', `mosaic/${environment}/rds/credentials`
    );

    // ============================================================
    // IRSA Role — core-api service account access to secrets + SES
    // ============================================================
    const clusterId = 'D491975E1999961E7BBAAE1A77332FBA';

    const eksServiceAccountRole = new iam.Role(this, 'CoreApiSecretsAccessRole', {
      roleName: `mosaic-${environment}-core-api-secrets-role`,
      description: 'IAM role for core-api to access database secrets and send emails via IRSA',
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
      inlinePolicies: {
        'SESEmailSendPolicy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ses:GetSendQuota',
                'ses:GetSendStatistics',
                'ses:ListVerifiedEmailAddresses',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Grant read access to database credentials secret
    dbSecret.grantRead(eksServiceAccountRole);

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'CoreApiSecretsRoleArn', {
      value: eksServiceAccountRole.roleArn,
      description: 'IAM role ARN for core-api to access database secrets',
      exportName: `mosaic-${environment}-aurora-core-api-secrets-role-arn`,
    });

    new cdk.CfnOutput(this, 'AuroraClusterEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL writer endpoint',
      exportName: `mosaic-${environment}-aurora-endpoint`,
    });

    new cdk.CfnOutput(this, 'AuroraClusterPort', {
      value: this.dbCluster.clusterEndpoint.port.toString(),
      description: 'Aurora PostgreSQL port',
      exportName: `mosaic-${environment}-aurora-port`,
    });

    new cdk.CfnOutput(this, 'AuroraClusterIdentifier', {
      value: `mosaic-${environment}-aurora`,
      description: 'Aurora cluster identifier',
      exportName: `mosaic-${environment}-aurora-cluster-id`,
    });

    new cdk.CfnOutput(this, 'AuroraSecurityGroupId', {
      value: this.dbSecurityGroup.securityGroupId,
      description: 'Security group ID for Aurora cluster',
      exportName: `mosaic-${environment}-aurora-sg-id`,
    });

    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: 'db.t4g.medium writer: ~$50-60/month + Aurora storage: ~$3-5/month = ~$53-65/month total',
      description: 'Estimated monthly cost for Aurora configuration',
    });
  }
}
