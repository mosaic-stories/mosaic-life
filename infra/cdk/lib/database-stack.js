"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
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
class DatabaseStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        this.dbSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpcCidr), ec2.Port.tcp(5432), 'Allow PostgreSQL traffic from VPC');
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
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO // ~$13-15/month
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
            assumedBy: new iam.FederatedPrincipal(`arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_OIDC_ID`, {
                StringEquals: {
                    [`oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_OIDC_ID:sub`]: `system:serviceaccount:mosaic-${environment}:core-api`,
                    [`oidc.eks.${this.region}.amazonaws.com/id/CLUSTER_OIDC_ID:aud`]: 'sts.amazonaws.com',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
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
exports.DatabaseStack = DatabaseStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2Utc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQywrRUFBaUU7QUFDakUseURBQTJDO0FBUTNDOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBQ0gsTUFBYSxhQUFjLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLMUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF5QjtRQUNqRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUVuQywrREFBK0Q7UUFDL0QseUJBQXlCO1FBQ3pCLCtEQUErRDtRQUMvRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDMUUsR0FBRztZQUNILGlCQUFpQixFQUFFLFVBQVUsV0FBVyxTQUFTO1lBQ2pELFdBQVcsRUFBRSw0Q0FBNEM7WUFDekQsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLDRCQUE0QjtTQUN0RCxDQUFDLENBQUM7UUFFSCxpREFBaUQ7UUFDakQscURBQXFEO1FBQ3JELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxZQUFZLElBQUksYUFBYSxDQUFDLENBQUMseUJBQXlCO1FBQzVFLElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUNqQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFDdEIsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLG1DQUFtQyxDQUNwQyxDQUFDO1FBRUYsK0RBQStEO1FBQy9ELHFEQUFx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QVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLHFCQUFxQixDQUFDLE9BQU87WUFDcEMsV0FBVyxFQUFFLHNEQUFzRDtZQUNuRSxVQUFVLEVBQUUsVUFBVSxXQUFXLDRCQUE0QjtTQUM5RCxDQUFDLENBQUM7UUFFSCx5QkFBeUI7UUFDekIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUseUVBQXlFO1lBQ2hGLFdBQVcsRUFBRSx3REFBd0Q7U0FDdEUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLDZHQUE2RztZQUNwSCxXQUFXLEVBQUUsMENBQTBDO1NBQ3hELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQW5QRCxzQ0FtUEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgcmRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yZHMnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgdnBjOiBlYzIuSVZwYztcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBSRFMgUG9zdGdyZVNRTCBEYXRhYmFzZSBTdGFja1xuICogXG4gKiBDb3N0LW9wdGltaXplZCBjb25maWd1cmF0aW9uOlxuICogLSBkYi50My5taWNybyAoMiB2Q1BVLCAxIEdCIFJBTSkgLSB+JDEzLTE1L21vbnRoXG4gKiAtIFNpbmdsZS1BWiBkZXBsb3ltZW50IChjYW4gdXBncmFkZSB0byBNdWx0aS1BWiBsYXRlcilcbiAqIC0gMjAgR0IgZ3AzIHN0b3JhZ2UgKHNjYWxhYmxlKVxuICogLSA3LWRheSBhdXRvbWF0ZWQgYmFja3Vwc1xuICogLSBQb3N0Z3JlU1FMIDE2LnhcbiAqIFxuICogVXBncmFkZSBwYXRoIHRvIHByb2R1Y3Rpb246XG4gKiAtIFNjYWxlIHRvIGRiLnQzLnNtYWxsIG9yIGRiLnQzLm1lZGl1bVxuICogLSBFbmFibGUgTXVsdGktQVogZm9yIGhpZ2ggYXZhaWxhYmlsaXR5XG4gKiAtIEluY3JlYXNlIGJhY2t1cCByZXRlbnRpb24gdG8gMzAgZGF5c1xuICogLSBFbmFibGUgUGVyZm9ybWFuY2UgSW5zaWdodHNcbiAqIC0gQWRkIHJlYWQgcmVwbGljYXMgZm9yIHNjYWxpbmdcbiAqL1xuZXhwb3J0IGNsYXNzIERhdGFiYXNlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgZGJJbnN0YW5jZTogcmRzLkRhdGFiYXNlSW5zdGFuY2U7XG4gIHB1YmxpYyByZWFkb25seSBkYlNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbiAgcHVibGljIHJlYWRvbmx5IGRiU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IERhdGFiYXNlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyB2cGMsIGVudmlyb25tZW50IH0gPSBwcm9wcztcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFNlY3VyaXR5IEdyb3VwIGZvciBSRFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB0aGlzLmRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRGF0YWJhc2VTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgc2VjdXJpdHlHcm91cE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tcmRzLXNnYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFJEUyBQb3N0Z3JlU1FMIGluc3RhbmNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLCAvLyBSZXN0cmljdCBvdXRib3VuZCB0cmFmZmljXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBpbmJvdW5kIFBvc3RncmVTUUwgdHJhZmZpYyBmcm9tIFZQQyBDSURSXG4gICAgLy8gRm9yIGltcG9ydGVkIFZQQ3MsIHdlJ2xsIHVzZSBhIHNwZWNpZmljIENJRFIgYmxvY2tcbiAgICBjb25zdCB2cGNDaWRyID0gdnBjLnZwY0NpZHJCbG9jayB8fCAnMTAuMC4wLjAvMTYnOyAvLyBEZWZhdWx0IGZvciBtb3NhaWMgVlBDXG4gICAgdGhpcy5kYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KHZwY0NpZHIpLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgdHJhZmZpYyBmcm9tIFZQQydcbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gREIgU3VibmV0IEdyb3VwICh1c2UgcHJpdmF0ZSBzdWJuZXRzIGZvciBzZWN1cml0eSlcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBkYlN1Ym5ldEdyb3VwID0gbmV3IHJkcy5TdWJuZXRHcm91cCh0aGlzLCAnRGF0YWJhc2VTdWJuZXRHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3VibmV0IGdyb3VwIGZvciBSRFMgUG9zdGdyZVNRTCcsXG4gICAgICBzdWJuZXRHcm91cE5hbWU6IGBtb3NhaWMtJHtlbnZpcm9ubWVudH0tZGItc3VibmV0LWdyb3VwYCxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIERhdGFiYXNlIENyZWRlbnRpYWxzIChtYW5hZ2VkIGJ5IFNlY3JldHMgTWFuYWdlcilcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB0aGlzLmRiU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnRGF0YWJhc2VTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgbW9zYWljLyR7ZW52aXJvbm1lbnR9L3Jkcy9jcmVkZW50aWFsc2AsXG4gICAgICBkZXNjcmlwdGlvbjogJ01hc3RlciBjcmVkZW50aWFscyBmb3IgUkRTIFBvc3RncmVTUUwnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB1c2VybmFtZTogJ21vc2FpY2FkbWluJyxcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsIC8vIEF2b2lkIFVSTCBlbmNvZGluZyBpc3N1ZXNcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDMyLFxuICAgICAgICByZXF1aXJlRWFjaEluY2x1ZGVkVHlwZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBQYXJhbWV0ZXIgR3JvdXAgKFBvc3RncmVTUUwgb3B0aW1pemF0aW9ucylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBwYXJhbWV0ZXJHcm91cCA9IG5ldyByZHMuUGFyYW1ldGVyR3JvdXAodGhpcywgJ0RhdGFiYXNlUGFyYW1ldGVyR3JvdXAnLCB7XG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLlBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTYsXG4gICAgICB9KSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ3VzdG9tIHBhcmFtZXRlciBncm91cCBmb3IgTW9zYWljIExpZmUgUG9zdGdyZVNRTCcsXG4gICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgIC8vIENvbm5lY3Rpb24gc2V0dGluZ3NcbiAgICAgICAgJ21heF9jb25uZWN0aW9ucyc6ICcxMDAnLCAvLyBBZGVxdWF0ZSBmb3IgTVZQLCBpbmNyZWFzZSBmb3IgcHJvZHVjdGlvblxuICAgICAgICBcbiAgICAgICAgLy8gUGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9ucyAodXNpbmcgZm9ybXVsYXMgZm9yIGR5bmFtaWMgc2l6aW5nKVxuICAgICAgICAnc2hhcmVkX2J1ZmZlcnMnOiAne0RCSW5zdGFuY2VDbGFzc01lbW9yeS80MDk2fScsIC8vIDI1JSBvZiBpbnN0YW5jZSBtZW1vcnlcbiAgICAgICAgJ2VmZmVjdGl2ZV9jYWNoZV9zaXplJzogJ3tEQkluc3RhbmNlQ2xhc3NNZW1vcnkqMy80MDk2fScsIC8vIDc1JSBvZiBpbnN0YW5jZSBtZW1vcnlcbiAgICAgICAgJ21haW50ZW5hbmNlX3dvcmtfbWVtJzogJ3tEQkluc3RhbmNlQ2xhc3NNZW1vcnkvMTYzODR9JywgLy8gfjYlIG9mIG1lbW9yeSwgaW4gOEtCIGJsb2Nrc1xuICAgICAgICAnd29ya19tZW0nOiAne0RCSW5zdGFuY2VDbGFzc01lbW9yeS8yNTYwMH0nLCAvLyB+NE1CIGZvciBkYi50My5taWNyb1xuICAgICAgICBcbiAgICAgICAgLy8gV0FMIHNldHRpbmdzIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2UgKGluIDhLQiBibG9ja3MpXG4gICAgICAgICd3YWxfYnVmZmVycyc6ICcyMDQ4JywgLy8gMTZNQiBpbiA4S0IgYmxvY2tzXG4gICAgICAgICdjaGVja3BvaW50X2NvbXBsZXRpb25fdGFyZ2V0JzogJzAuOScsXG4gICAgICAgIFxuICAgICAgICAvLyBRdWVyeSBvcHRpbWl6YXRpb25cbiAgICAgICAgJ3JhbmRvbV9wYWdlX2Nvc3QnOiAnMS4xJywgLy8gT3B0aW1pemVkIGZvciBTU0Qgc3RvcmFnZVxuICAgICAgICAnZWZmZWN0aXZlX2lvX2NvbmN1cnJlbmN5JzogJzIwMCcsXG4gICAgICAgIFxuICAgICAgICAvLyBMb2dnaW5nIGZvciBkZWJ1Z2dpbmcgKGNhbiBiZSByZWR1Y2VkIGluIHByb2R1Y3Rpb24pXG4gICAgICAgICdsb2dfbWluX2R1cmF0aW9uX3N0YXRlbWVudCc6ICcxMDAwJywgLy8gTG9nIHF1ZXJpZXMgPiAxIHNlY29uZCAobWlsbGlzZWNvbmRzKVxuICAgICAgICAnbG9nX2Nvbm5lY3Rpb25zJzogJzEnLFxuICAgICAgICAnbG9nX2Rpc2Nvbm5lY3Rpb25zJzogJzEnLFxuICAgICAgICAnbG9nX2xvY2tfd2FpdHMnOiAnMScsXG4gICAgICAgIFxuICAgICAgICAvLyBDb25uZWN0aW9uIHRpbWVvdXQgc2V0dGluZ3MgKGluIG1pbGxpc2Vjb25kcylcbiAgICAgICAgJ2lkbGVfaW5fdHJhbnNhY3Rpb25fc2Vzc2lvbl90aW1lb3V0JzogJzMwMDAwMCcsIC8vIDUgbWludXRlc1xuICAgICAgICAnc3RhdGVtZW50X3RpbWVvdXQnOiAnMzAwMDAnLCAvLyAzMCBzZWNvbmRzIChhZGp1c3QgYXMgbmVlZGVkKVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFJEUyBQb3N0Z3JlU1FMIEluc3RhbmNlXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdGhpcy5kYkluc3RhbmNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdEYXRhYmFzZScsIHtcbiAgICAgIGluc3RhbmNlSWRlbnRpZmllcjogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1kYmAsXG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLlBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTYsXG4gICAgICB9KSxcbiAgICAgIFxuICAgICAgLy8gQ29zdC1vcHRpbWl6ZWQgaW5zdGFuY2UgdHlwZSAodXBncmFkZSBwYXRoOiB0My5zbWFsbCAtPiB0My5tZWRpdW0gLT4gdDMubGFyZ2UpXG4gICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoXG4gICAgICAgIGVjMi5JbnN0YW5jZUNsYXNzLlQzLFxuICAgICAgICBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPIC8vIH4kMTMtMTUvbW9udGhcbiAgICAgICksXG4gICAgICBcbiAgICAgIC8vIENyZWRlbnRpYWxzIGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5kYlNlY3JldCksXG4gICAgICBcbiAgICAgIC8vIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25cbiAgICAgIGRhdGFiYXNlTmFtZTogJ21vc2FpYycsXG4gICAgICBwb3J0OiA1NDMyLFxuICAgICAgXG4gICAgICAvLyBOZXR3b3JrIGNvbmZpZ3VyYXRpb25cbiAgICAgIHZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzdWJuZXRHcm91cDogZGJTdWJuZXRHcm91cCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5kYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgXG4gICAgICAvLyBTaW5nbGUtQVogZm9yIGNvc3Qgc2F2aW5ncyAodXBncmFkZSB0byBNdWx0aS1BWiBmb3IgcHJvZHVjdGlvbiBIQSlcbiAgICAgIG11bHRpQXo6IGZhbHNlLFxuICAgICAgXG4gICAgICAvLyBQdWJsaWMgYWNjZXNzaWJpbGl0eSAoc2V0IHRvIGZhbHNlIGZvciBzZWN1cml0eSlcbiAgICAgIHB1YmxpY2x5QWNjZXNzaWJsZTogZmFsc2UsXG4gICAgICBcbiAgICAgIC8vIFN0b3JhZ2UgY29uZmlndXJhdGlvbiAoZ3AzIGlzIG1vcmUgY29zdC1lZmZlY3RpdmUgdGhhbiBncDIpXG4gICAgICBhbGxvY2F0ZWRTdG9yYWdlOiAyMCwgLy8gR0IsIGNhbiBhdXRvLXNjYWxlXG4gICAgICBtYXhBbGxvY2F0ZWRTdG9yYWdlOiAxMDAsIC8vIEF1dG8tc2NhbGluZyBsaW1pdFxuICAgICAgc3RvcmFnZVR5cGU6IHJkcy5TdG9yYWdlVHlwZS5HUDMsXG4gICAgICBzdG9yYWdlRW5jcnlwdGVkOiB0cnVlLCAvLyBFbmNyeXB0aW9uIGF0IHJlc3RcbiAgICAgIFxuICAgICAgLy8gQmFja3VwIGNvbmZpZ3VyYXRpb25cbiAgICAgIGJhY2t1cFJldGVudGlvbjogY2RrLkR1cmF0aW9uLmRheXMoNyksIC8vIEluY3JlYXNlIHRvIDMwIGRheXMgZm9yIHByb2R1Y3Rpb25cbiAgICAgIHByZWZlcnJlZEJhY2t1cFdpbmRvdzogJzAzOjAwLTA0OjAwJywgLy8gVVRDLCBhZGp1c3QgZm9yIHlvdXIgdGltZXpvbmVcbiAgICAgIHByZWZlcnJlZE1haW50ZW5hbmNlV2luZG93OiAnc3VuOjA0OjAwLXN1bjowNTowMCcsIC8vIFVUQ1xuICAgICAgXG4gICAgICAvLyBBdXRvbWF0ZWQgbWlub3IgdmVyc2lvbiB1cGdyYWRlc1xuICAgICAgYXV0b01pbm9yVmVyc2lvblVwZ3JhZGU6IHRydWUsXG4gICAgICBcbiAgICAgIC8vIERlbGV0ZSBwcm90ZWN0aW9uIGZvciBwcm9kdWN0aW9uXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICBcbiAgICAgIC8vIFJlbW92YWwgcG9saWN5XG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuU05BUFNIT1QgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgXG4gICAgICAvLyBQYXJhbWV0ZXIgZ3JvdXBcbiAgICAgIHBhcmFtZXRlckdyb3VwLFxuICAgICAgXG4gICAgICAvLyBNb25pdG9yaW5nIChiYXNpYyBmb3IgY29zdCBzYXZpbmdzLCBlbmFibGUgZW5oYW5jZWQgZm9yIHByb2R1Y3Rpb24pXG4gICAgICBtb25pdG9yaW5nSW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSwgLy8gQmFzaWMgbW9uaXRvcmluZ1xuICAgICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogZmFsc2UsIC8vIEVuYWJsZSBmb3IgcHJvZHVjdGlvbiBkZWJ1Z2dpbmdcbiAgICAgIFxuICAgICAgLy8gQ2xvdWRXYXRjaCBsb2cgZXhwb3J0c1xuICAgICAgY2xvdWR3YXRjaExvZ3NFeHBvcnRzOiBbJ3Bvc3RncmVzcWwnLCAndXBncmFkZSddLFxuICAgICAgY2xvdWR3YXRjaExvZ3NSZXRlbnRpb246IGNkay5hd3NfbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLCAvLyBJbmNyZWFzZSBmb3IgcHJvZHVjdGlvblxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gTm90ZTogVGhlIGFwcGxpY2F0aW9uIHdpbGwgdXNlIEV4dGVybmFsIFNlY3JldHMgT3BlcmF0b3IgdG8gZmV0Y2hcbiAgICAvLyBjcmVkZW50aWFscyBmcm9tIGRiU2VjcmV0IGFuZCBjb25zdHJ1Y3QgdGhlIGNvbm5lY3Rpb24gVVJMIHdpdGhcbiAgICAvLyB0aGUgZGF0YWJhc2UgZW5kcG9pbnQgYWRkcmVzcyBhbmQgcG9ydC5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEdyYW50IGNvcmUtYXBpIHNlcnZpY2UgYWNjb3VudCByZWFkIGFjY2VzcyB0byBzZWNyZXRzXG4gICAgLy8gVGhpcyB3aWxsIGJlIHVzZWQgYnkgRXh0ZXJuYWwgU2VjcmV0cyBPcGVyYXRvciBpbiBLdWJlcm5ldGVzXG4gICAgY29uc3QgZWtzU2VydmljZUFjY291bnRSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb3JlQXBpU2VjcmV0c0FjY2Vzc1JvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1jb3JlLWFwaS1zZWNyZXRzLXJvbGVgLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgY29yZS1hcGkgdG8gYWNjZXNzIGRhdGFiYXNlIHNlY3JldHMgdmlhIElSU0EnLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06b2lkYy1wcm92aWRlci9vaWRjLmVrcy4ke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tL2lkL0NMVVNURVJfT0lEQ19JRGAsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgIFtgb2lkYy5la3MuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS9pZC9DTFVTVEVSX09JRENfSUQ6c3ViYF06IFxuICAgICAgICAgICAgICBgc3lzdGVtOnNlcnZpY2VhY2NvdW50Om1vc2FpYy0ke2Vudmlyb25tZW50fTpjb3JlLWFwaWAsXG4gICAgICAgICAgICBbYG9pZGMuZWtzLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vaWQvQ0xVU1RFUl9PSURDX0lEOmF1ZGBdOiBcbiAgICAgICAgICAgICAgJ3N0cy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcmVhZCBhY2Nlc3MgdG8gZGF0YWJhc2UgY3JlZGVudGlhbHMgc2VjcmV0XG4gICAgdGhpcy5kYlNlY3JldC5ncmFudFJlYWQoZWtzU2VydmljZUFjY291bnRSb2xlKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIE91dHB1dHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRiSW5zdGFuY2UuZGJJbnN0YW5jZUVuZHBvaW50QWRkcmVzcyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUkRTIFBvc3RncmVTUUwgZW5kcG9pbnQgYWRkcmVzcycsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWRiLWVuZHBvaW50YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVBvcnQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kYkluc3RhbmNlLmRiSW5zdGFuY2VFbmRwb2ludFBvcnQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JEUyBQb3N0Z3JlU1FMIHBvcnQnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1kYi1wb3J0YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogJ21vc2FpYycsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIG5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1kYi1uYW1lYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVNlY3JldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRiU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBkYXRhYmFzZSBjcmVkZW50aWFscyBzZWNyZXQgKHVzZXJuYW1lL3Bhc3N3b3JkKScsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWRiLXNlY3JldC1hcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlU2VjdXJpdHlHcm91cElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGJTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgSUQgZm9yIGRhdGFiYXNlIGFjY2VzcycsXG4gICAgICBleHBvcnROYW1lOiBgbW9zYWljLSR7ZW52aXJvbm1lbnR9LWRiLXNnLWlkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb3JlQXBpU2VjcmV0c1JvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogZWtzU2VydmljZUFjY291bnRSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIEFSTiBmb3IgY29yZS1hcGkgdG8gYWNjZXNzIGRhdGFiYXNlIHNlY3JldHMnLFxuICAgICAgZXhwb3J0TmFtZTogYG1vc2FpYy0ke2Vudmlyb25tZW50fS1jb3JlLWFwaS1zZWNyZXRzLXJvbGUtYXJuYCxcbiAgICB9KTtcblxuICAgIC8vIENvc3QgZXN0aW1hdGlvbiBvdXRwdXRcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXN0aW1hdGVkTW9udGhseUNvc3QnLCB7XG4gICAgICB2YWx1ZTogJ2RiLnQzLm1pY3JvOiB+JDEzLTE1L21vbnRoICsgc3RvcmFnZTogfiQyLTQvbW9udGggPSB+JDE1LTE5L21vbnRoIHRvdGFsJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXN0aW1hdGVkIG1vbnRobHkgY29zdCBmb3IgdGhpcyBkYXRhYmFzZSBjb25maWd1cmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVcGdyYWRlUGF0aCcsIHtcbiAgICAgIHZhbHVlOiAnVG8gdXBncmFkZTogQ2hhbmdlIGluc3RhbmNlVHlwZSB0byBUM19TTUFMTCAofiQzMC9tbykgb3IgVDNfTUVESVVNICh+JDYwL21vKSwgc2V0IG11bHRpQXo9dHJ1ZSAoKzEwMCUgY29zdCknLFxuICAgICAgZGVzY3JpcHRpb246ICdIb3cgdG8gc2NhbGUgdXAgZm9yIHByb2R1Y3Rpb24gd29ya2xvYWRzJyxcbiAgICB9KTtcbiAgfVxufVxuIl19