import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface DnsCertificateStackProps extends cdk.StackProps {
  domainName: string;
  hostedZoneId?: string;
  subdomains: string[];
}

/**
 * Minimal CDK stack that only creates DNS and Certificate resources
 * All other infrastructure (VPC, EKS, Cognito, S3, ECR) already exists
 * in the infrastructure repository
 */
export class DnsCertificateStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: DnsCertificateStackProps) {
    super(scope, id, props);

    const { domainName, hostedZoneId, subdomains } = props;

    // ============================================================
    // Route53 Hosted Zone
    // ============================================================
    if (hostedZoneId) {
      // Use existing hosted zone
      this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId,
        zoneName: domainName,
      });

      new cdk.CfnOutput(this, 'ExistingHostedZoneId', {
        value: hostedZoneId,
        description: 'Using existing Route53 hosted zone',
      });
    } else {
      // Create new hosted zone
      this.hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
        zoneName: domainName,
        comment: `Hosted zone for ${domainName}`,
      });

      new cdk.CfnOutput(this, 'NameServers', {
        value: cdk.Fn.join(', ', this.hostedZone.hostedZoneNameServers || []),
        description: 'Update your domain registrar with these name servers',
      });
    }

    // ============================================================
    // ACM Certificate with SANs
    // ============================================================
    const subjectAlternativeNames = [
      `*.${domainName}`,
      ...subdomains.map(sub => `${sub}.${domainName}`),
    ];

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      subjectAlternativeNames,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Route53 Hosted Zone ID',
      exportName: 'mosaic-hosted-zone-id',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM Certificate ARN for ALB',
      exportName: 'mosaic-certificate-arn',
    });

    new cdk.CfnOutput(this, 'Domain', {
      value: domainName,
      description: 'Primary domain name',
    });

    new cdk.CfnOutput(this, 'SubjectAlternativeNames', {
      value: subjectAlternativeNames.join(', '),
      description: 'Certificate SANs',
    });
  }
}
