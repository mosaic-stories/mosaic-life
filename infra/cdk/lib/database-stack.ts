import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  environment: string;
}

/**
 * RDS PostgreSQL Database Stack
 * 
 * Cost-optimized configuration:
 * - db.t3.micro (2 vCPU, 1 GB RAM) - ~$13-15/month
 * - Single-AZ deployment (can upgrade to Multi-AZ later)
 * - 20 GB gp3 storage (scalable)
 * - 7-day automated backups
 * - PostgreSQL 16.x
 * 
 * Upgrade path to production:
 * - Scale to db.t3.small or db.t3.medium
 * - Enable Multi-AZ for high availability
 * - Increase backup retention to 30 days
 * - Enable Performance Insights
 * - Add read replicas for scaling
 */
export class DatabaseStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { vpc, environment } = props;

    // ============================================================
    // Security Group for RDS
    // ============================================================
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      securityGroupName: `mosaic-${environment}-rds-sg`,
      description: 'Security group for RDS PostgreSQL instance',
      allowAllOutbound: false, // Restrict outbound traffic
    });

    // Allow inbound PostgreSQL traffic from VPC CIDR
    // For imported VPCs, we'll use a specific CIDR block
    const vpcCidr = vpc.vpcCidrBlock || '10.0.0.0/16'; // Default for mosaic VPC
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL traffic from VPC'
    );

    // ============================================================
    // DB Subnet Group (use private subnets for security)
    // ============================================================
    const dbSubnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc,
      description: 'Subnet group for RDS PostgreSQL',
      subnetGroupName: `mosaic-${environment}-db-subnet-group`,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ============================================================
    // Database Credentials (managed by Secrets Manager)
    // ============================================================
    this.dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `mosaic/${environment}/rds/credentials`,
      description: 'Master credentials for RDS PostgreSQL',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'mosaicadmin',
        }),
        generateStringKey: 'password',
        excludePunctuation: true, // Avoid URL encoding issues
        passwordLength: 32,
        requireEachIncludedType: true,
      },
    });

    // ============================================================
    // Parameter Group (PostgreSQL optimizations)
    // ============================================================
    const parameterGroup = new rds.ParameterGroup(this, 'DatabaseParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      description: 'Custom parameter group for Mosaic Life PostgreSQL',
      parameters: {
        // Connection settings
        'max_connections': '100', // Adequate for MVP, increase for production
        
        // Performance optimizations (using formulas for dynamic sizing)
        'shared_buffers': '{DBInstanceClassMemory/4096}', // 25% of instance memory
        'effective_cache_size': '{DBInstanceClassMemory*3/4096}', // 75% of instance memory
        'maintenance_work_mem': '{DBInstanceClassMemory/16384}', // ~6% of memory, in 8KB blocks
        'work_mem': '{DBInstanceClassMemory/25600}', // ~4MB for db.t3.micro
        
        // WAL settings for better performance (in 8KB blocks)
        'wal_buffers': '2048', // 16MB in 8KB blocks
        'checkpoint_completion_target': '0.9',
        
        // Query optimization
        'random_page_cost': '1.1', // Optimized for SSD storage
        'effective_io_concurrency': '200',
        
        // Logging for debugging (can be reduced in production)
        'log_min_duration_statement': '1000', // Log queries > 1 second (milliseconds)
        'log_connections': '1',
        'log_disconnections': '1',
        'log_lock_waits': '1',
        
        // Connection timeout settings (in milliseconds)
        'idle_in_transaction_session_timeout': '300000', // 5 minutes
        'statement_timeout': '30000', // 30 seconds (adjust as needed)
      },
    });

    // ============================================================
    // RDS PostgreSQL Instance
    // ============================================================
    this.dbInstance = new rds.DatabaseInstance(this, 'Database', {
      instanceIdentifier: `mosaic-${environment}-db`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      
      // Cost-optimized instance type (upgrade path: t3.small -> t3.medium -> t3.large)
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO // ~$13-15/month
      ),
      
      // Credentials from Secrets Manager
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      
      // Database configuration
      databaseName: 'mosaic',
      port: 5432,
      
      // Network configuration
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      subnetGroup: dbSubnetGroup,
      securityGroups: [this.dbSecurityGroup],
      
      // Single-AZ for cost savings (upgrade to Multi-AZ for production HA)
      multiAz: false,
      
      // Public accessibility (set to false for security)
      publiclyAccessible: false,
      
      // Storage configuration (gp3 is more cost-effective than gp2)
      allocatedStorage: 20, // GB, can auto-scale
      maxAllocatedStorage: 100, // Auto-scaling limit
      storageType: rds.StorageType.GP3,
      storageEncrypted: true, // Encryption at rest
      
      // Backup configuration
      backupRetention: cdk.Duration.days(7), // Increase to 30 days for production
      preferredBackupWindow: '03:00-04:00', // UTC, adjust for your timezone
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00', // UTC
      
      // Automated minor version upgrades
      autoMinorVersionUpgrade: true,
      
      // Delete protection for production
      deletionProtection: environment === 'prod',
      
      // Removal policy
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
      
      // Parameter group
      parameterGroup,
      
      // Monitoring (basic for cost savings, enable enhanced for production)
      monitoringInterval: cdk.Duration.seconds(60), // Basic monitoring
      enablePerformanceInsights: false, // Enable for production debugging
      
      // CloudWatch log exports
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_WEEK, // Increase for production
    });

    // ============================================================
    // Note: The application will use External Secrets Operator to fetch
    // credentials from dbSecret and construct the connection URL with
    // the database endpoint address and port.
    // ============================================================

    // Grant core-api service account read access to secrets
    // This will be used by External Secrets Operator in Kubernetes
    const eksServiceAccountRole = new iam.Role(this, 'CoreApiSecretsAccessRole', {
      roleName: `mosaic-${environment}-core-api-secrets-role`,
      description: 'IAM role for core-api to access database secrets via IRSA',
      assumedBy: new iam.FederatedPrincipal(
        `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_OIDC_ID`,
        {
          StringEquals: {
            [`oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_OIDC_ID:sub`]: 
              `system:serviceaccount:mosaic-${environment}:core-api`,
            [`oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_OIDC_ID:aud`]: 
              'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // Grant read access to database credentials secret
    this.dbSecret.grantRead(eksServiceAccountRole);

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.dbInstance.dbInstanceEndpointAddress,
      description: 'RDS PostgreSQL endpoint address',
      exportName: `mosaic-${environment}-db-endpoint`,
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.dbInstance.dbInstanceEndpointPort,
      description: 'RDS PostgreSQL port',
      exportName: `mosaic-${environment}-db-port`,
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: 'mosaic',
      description: 'Database name',
      exportName: `mosaic-${environment}-db-name`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'ARN of the database credentials secret (username/password)',
      exportName: `mosaic-${environment}-db-secret-arn`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecurityGroupId', {
      value: this.dbSecurityGroup.securityGroupId,
      description: 'Security group ID for database access',
      exportName: `mosaic-${environment}-db-sg-id`,
    });

    new cdk.CfnOutput(this, 'CoreApiSecretsRoleArn', {
      value: eksServiceAccountRole.roleArn,
      description: 'IAM role ARN for core-api to access database secrets',
      exportName: `mosaic-${environment}-core-api-secrets-role-arn`,
    });

    // Cost estimation output
    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: 'db.t3.micro: ~$13-15/month + storage: ~$2-4/month = ~$15-19/month total',
      description: 'Estimated monthly cost for this database configuration',
    });

    new cdk.CfnOutput(this, 'UpgradePath', {
      value: 'To upgrade: Change instanceType to T3_SMALL (~$30/mo) or T3_MEDIUM (~$60/mo), set multiAz=true (+100% cost)',
      description: 'How to scale up for production workloads',
    });
  }
}
