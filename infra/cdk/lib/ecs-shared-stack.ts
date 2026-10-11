import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/** SSM prefix under which this stack publishes values for the env stacks (no Fn::ImportValue). */
export const ECS_SSM_PREFIX = '/mosaiclife/lean/ecs';
export const ECS_CLUSTER_NAME = 'mosaic';
/** Foundation SSM parameters for the two public subnets used by the ALB and the tasks. */
export const PUBLIC_SUBNET_PARAMS = ['us-east-1a', 'us-east-1b'].map((az) => `/mosaiclife/network/subnets/public/${az}`);

const CERTIFICATE_ARN = 'arn:aws:acm:us-east-1:033691785857:certificate/2988e3f2-676b-4401-b59f-34149da4a051';
const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload';

/** Two public subnets pinned by ID (deploy-time SSM resolution), never by SubnetType. */
export function publicSubnets(scope: Construct): ec2.ISubnet[] {
  return PUBLIC_SUBNET_PARAMS.map((p, i) =>
    ec2.Subnet.fromSubnetId(scope, `PublicSubnet${i}`, ssm.StringParameter.valueForStringParameter(scope, p)),
  );
}

export interface EcsSharedStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

/**
 * Shared ECS edge (design D1/D11): cluster `mosaic` and the internet-facing ALB shared by prod
 * and staging. Only instantiated with `-c leanRuntime=true`. Env stacks read the SSM parameters
 * under `/mosaiclife/lean/ecs/` instead of CloudFormation exports.
 */
export class EcsSharedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsSharedStackProps) {
    super(scope, id, props);
    const { vpc } = props;

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: ECS_CLUSTER_NAME,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
      enableFargateCapacityProviders: true,
    });

    const albSg = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      securityGroupName: 'mosaic-lean-alb-sg',
      description: 'Lean ALB: HTTP/HTTPS from anywhere',
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP (redirected to HTTPS)');
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: 'mosaic-lean-alb',
      vpc,
      internetFacing: true,
      vpcSubnets: { subnets: publicSubnets(this) },
      securityGroup: albSg,
      idleTimeout: cdk.Duration.seconds(3600), // long-lived SSE streams (spec: long-lived AI streams)
    });
    // Same bucket/prefix as the EKS ALB so the existing Athena table keeps working.
    alb.logAccessLogs(s3.Bucket.fromBucketName(this, 'LogsBucket', 'mosaic-life-observability'), 'alb/access/shared');

    alb.addListener('Http', {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.redirect({ protocol: 'HTTPS', port: '443', permanent: true }),
    });
    const https = alb.addListener('Https', {
      port: 443,
      open: false,
      certificates: [elbv2.ListenerCertificate.fromArn(CERTIFICATE_ARN)],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not found',
      }),
    });
    // HSTS on responses nginx never sees (ALB -> core-api rules). No L2 prop yet; the CFN
    // property exists (CfnListener.ListenerAttributes), so use the escape hatch.
    (https.node.defaultChild as elbv2.CfnListener).listenerAttributes = [
      { key: 'routing.http.response.strict_transport_security.header_value', value: HSTS_VALUE },
    ];

    const publish = (name: string, value: string, description: string) =>
      new ssm.StringParameter(this, `Param${name.replace(/[^A-Za-z0-9]/g, '')}`, {
        parameterName: `${ECS_SSM_PREFIX}/${name}`,
        stringValue: value,
        description,
      });
    publish('cluster-name', cluster.clusterName, 'ECS cluster name');
    publish('alb-arn', alb.loadBalancerArn, 'Shared ALB ARN');
    publish('alb-dns-name', alb.loadBalancerDnsName, 'Shared ALB DNS name');
    publish('alb-hosted-zone-id', alb.loadBalancerCanonicalHostedZoneId, 'Shared ALB canonical hosted zone ID');
    publish('alb-sg-id', albSg.securityGroupId, 'Shared ALB security group ID');
    publish('https-listener-arn', https.listenerArn, 'Shared ALB HTTPS listener ARN');
  }
}
