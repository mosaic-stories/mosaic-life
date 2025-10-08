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
exports.DnsCertificateStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
/**
 * Minimal CDK stack that only creates DNS and Certificate resources
 * All other infrastructure (VPC, EKS, Cognito, S3, ECR) already exists
 * in the infrastructure repository
 */
class DnsCertificateStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        }
        else {
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
exports.DnsCertificateStack = DnsCertificateStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG5zLWNlcnRpZmljYXRlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZG5zLWNlcnRpZmljYXRlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxpRUFBbUQ7QUFDbkQsd0VBQTBEO0FBUzFEOzs7O0dBSUc7QUFDSCxNQUFhLG1CQUFvQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSWhELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBK0I7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXZELCtEQUErRDtRQUMvRCxzQkFBc0I7UUFDdEIsK0RBQStEO1FBQy9ELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsMkJBQTJCO1lBQzNCLElBQUksQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO2dCQUNoRixZQUFZO2dCQUNaLFFBQVEsRUFBRSxVQUFVO2FBQ3JCLENBQUMsQ0FBQztZQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7Z0JBQzlDLEtBQUssRUFBRSxZQUFZO2dCQUNuQixXQUFXLEVBQUUsb0NBQW9DO2FBQ2xELENBQUMsQ0FBQztRQUNMLENBQUM7YUFBTSxDQUFDO1lBQ04seUJBQXlCO1lBQ3pCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtnQkFDakUsUUFBUSxFQUFFLFVBQVU7Z0JBQ3BCLE9BQU8sRUFBRSxtQkFBbUIsVUFBVSxFQUFFO2FBQ3pDLENBQUMsQ0FBQztZQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO2dCQUNyQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMscUJBQXFCLElBQUksRUFBRSxDQUFDO2dCQUNyRSxXQUFXLEVBQUUsc0RBQXNEO2FBQ3BFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCwrREFBK0Q7UUFDL0QsNEJBQTRCO1FBQzVCLCtEQUErRDtRQUMvRCxNQUFNLHVCQUF1QixHQUFHO1lBQzlCLEtBQUssVUFBVSxFQUFFO1lBQ2pCLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO1NBQ2pELENBQUM7UUFFRixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQzFELFVBQVU7WUFDVix1QkFBdUI7WUFDdkIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztTQUMvRCxDQUFDLENBQUM7UUFFSCwrREFBK0Q7UUFDL0QsVUFBVTtRQUNWLCtEQUErRDtRQUMvRCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN0QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZO1lBQ25DLFdBQVcsRUFBRSx3QkFBd0I7WUFDckMsVUFBVSxFQUFFLHVCQUF1QjtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3hDLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7WUFDdEMsV0FBVyxFQUFFLDZCQUE2QjtZQUMxQyxVQUFVLEVBQUUsd0JBQXdCO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxVQUFVO1lBQ2pCLFdBQVcsRUFBRSxxQkFBcUI7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNqRCxLQUFLLEVBQUUsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztZQUN6QyxXQUFXLEVBQUUsa0JBQWtCO1NBQ2hDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTNFRCxrREEyRUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBEbnNDZXJ0aWZpY2F0ZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGRvbWFpbk5hbWU6IHN0cmluZztcbiAgaG9zdGVkWm9uZUlkPzogc3RyaW5nO1xuICBzdWJkb21haW5zOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBNaW5pbWFsIENESyBzdGFjayB0aGF0IG9ubHkgY3JlYXRlcyBETlMgYW5kIENlcnRpZmljYXRlIHJlc291cmNlc1xuICogQWxsIG90aGVyIGluZnJhc3RydWN0dXJlIChWUEMsIEVLUywgQ29nbml0bywgUzMsIEVDUikgYWxyZWFkeSBleGlzdHNcbiAqIGluIHRoZSBpbmZyYXN0cnVjdHVyZSByZXBvc2l0b3J5XG4gKi9cbmV4cG9ydCBjbGFzcyBEbnNDZXJ0aWZpY2F0ZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGhvc3RlZFpvbmU6IHJvdXRlNTMuSUhvc3RlZFpvbmU7XG4gIHB1YmxpYyByZWFkb25seSBjZXJ0aWZpY2F0ZTogYWNtLkNlcnRpZmljYXRlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEbnNDZXJ0aWZpY2F0ZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZG9tYWluTmFtZSwgaG9zdGVkWm9uZUlkLCBzdWJkb21haW5zIH0gPSBwcm9wcztcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFJvdXRlNTMgSG9zdGVkIFpvbmVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBpZiAoaG9zdGVkWm9uZUlkKSB7XG4gICAgICAvLyBVc2UgZXhpc3RpbmcgaG9zdGVkIHpvbmVcbiAgICAgIHRoaXMuaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIGhvc3RlZFpvbmVJZCxcbiAgICAgICAgem9uZU5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICB9KTtcblxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0V4aXN0aW5nSG9zdGVkWm9uZUlkJywge1xuICAgICAgICB2YWx1ZTogaG9zdGVkWm9uZUlkLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1VzaW5nIGV4aXN0aW5nIFJvdXRlNTMgaG9zdGVkIHpvbmUnLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgaG9zdGVkIHpvbmVcbiAgICAgIHRoaXMuaG9zdGVkWm9uZSA9IG5ldyByb3V0ZTUzLlB1YmxpY0hvc3RlZFpvbmUodGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIHpvbmVOYW1lOiBkb21haW5OYW1lLFxuICAgICAgICBjb21tZW50OiBgSG9zdGVkIHpvbmUgZm9yICR7ZG9tYWluTmFtZX1gLFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdOYW1lU2VydmVycycsIHtcbiAgICAgICAgdmFsdWU6IGNkay5Gbi5qb2luKCcsICcsIHRoaXMuaG9zdGVkWm9uZS5ob3N0ZWRab25lTmFtZVNlcnZlcnMgfHwgW10pLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1VwZGF0ZSB5b3VyIGRvbWFpbiByZWdpc3RyYXIgd2l0aCB0aGVzZSBuYW1lIHNlcnZlcnMnLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQUNNIENlcnRpZmljYXRlIHdpdGggU0FOc1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHN1YmplY3RBbHRlcm5hdGl2ZU5hbWVzID0gW1xuICAgICAgYCouJHtkb21haW5OYW1lfWAsXG4gICAgICAuLi5zdWJkb21haW5zLm1hcChzdWIgPT4gYCR7c3VifS4ke2RvbWFpbk5hbWV9YCksXG4gICAgXTtcblxuICAgIHRoaXMuY2VydGlmaWNhdGUgPSBuZXcgYWNtLkNlcnRpZmljYXRlKHRoaXMsICdDZXJ0aWZpY2F0ZScsIHtcbiAgICAgIGRvbWFpbk5hbWUsXG4gICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lcyxcbiAgICAgIHZhbGlkYXRpb246IGFjbS5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyh0aGlzLmhvc3RlZFpvbmUpLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gT3V0cHV0c1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdIb3N0ZWRab25lSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5ob3N0ZWRab25lLmhvc3RlZFpvbmVJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm91dGU1MyBIb3N0ZWQgWm9uZSBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnbW9zYWljLWhvc3RlZC16b25lLWlkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDZXJ0aWZpY2F0ZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNlcnRpZmljYXRlLmNlcnRpZmljYXRlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBQ00gQ2VydGlmaWNhdGUgQVJOIGZvciBBTEInLFxuICAgICAgZXhwb3J0TmFtZTogJ21vc2FpYy1jZXJ0aWZpY2F0ZS1hcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RvbWFpbicsIHtcbiAgICAgIHZhbHVlOiBkb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdQcmltYXJ5IGRvbWFpbiBuYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdWJqZWN0QWx0ZXJuYXRpdmVOYW1lcycsIHtcbiAgICAgIHZhbHVlOiBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lcy5qb2luKCcsICcpLFxuICAgICAgZGVzY3JpcHRpb246ICdDZXJ0aWZpY2F0ZSBTQU5zJyxcbiAgICB9KTtcbiAgfVxufVxuIl19