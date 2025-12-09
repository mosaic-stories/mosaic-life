import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export interface AIChatGuardrailProps {
  environment: string;
}

export class AIChatGuardrail extends Construct {
  public readonly guardrailId: string;
  public readonly guardrailVersion: string;
  public readonly guardrailArn: string;

  constructor(scope: Construct, id: string, props: AIChatGuardrailProps) {
    super(scope, id);

    const guardrail = new bedrock.CfnGuardrail(this, 'AIGuardrail', {
      name: `mosaic-${props.environment}-ai-chat-guardrail`,
      description: 'Content safety guardrail for AI chat feature',

      blockedInputMessaging:
        "I can't process that request. Please rephrase your message.",
      blockedOutputsMessaging:
        "I'm not able to respond to that. Let me help you with something else.",

      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'VIOLENCE', inputStrength: 'LOW', outputStrength: 'LOW' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'LOW', outputStrength: 'LOW' },
          {
            type: 'MISCONDUCT',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM',
          },
          {
            type: 'PROMPT_ATTACK',
            inputStrength: 'MEDIUM',
            outputStrength: 'NONE',
            inputAction: 'BLOCK',
          },
        ],
      },

      tags: [
        { key: 'Environment', value: props.environment },
        { key: 'Component', value: 'AI-Chat' },
      ],
    });

    const guardrailVersion = new bedrock.CfnGuardrailVersion(
      this,
      'AIGuardrailVersion',
      {
        guardrailIdentifier: guardrail.attrGuardrailId,
        description: 'Initial version',
      }
    );

    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailVersion = guardrailVersion.attrVersion;
    this.guardrailArn = guardrail.attrGuardrailArn;
  }
}
