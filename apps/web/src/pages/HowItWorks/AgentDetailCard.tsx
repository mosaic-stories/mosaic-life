import { CheckCircle2, ArrowRight, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AgentDetail } from './howItWorksData';

interface AgentDetailCardProps {
  agent: AgentDetail;
}

export function AgentDetailCard({ agent }: AgentDetailCardProps) {
  // The chat agent uses MessageSquare icon instead of the one in data
  const IconComponent = agent.id === 'chat' ? MessageSquare : agent.icon;

  return (
    <Card className="overflow-hidden">
      <div className={`${agent.headerGradient} p-6 border-b`}>
        <div className="flex items-start gap-4">
          <div className={`size-14 rounded-xl ${agent.iconBgClass} flex items-center justify-center flex-shrink-0`}>
            <IconComponent className="size-7 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-neutral-900">{agent.title}</h3>
              <Badge className={agent.badgeClasses}>{agent.badge}</Badge>
            </div>
            <p className="text-neutral-600">
              {agent.description}
            </p>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
              <span className={`size-6 rounded-full ${agent.numberBgClass} ${agent.numberTextClass} flex items-center justify-center text-sm`}>1</span>
              What It Does
            </h4>
            <p className="text-neutral-700 leading-relaxed">
              {agent.whatItDoes}
            </p>
          </div>

          <div>
            <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
              <span className={`size-6 rounded-full ${agent.numberBgClass} ${agent.numberTextClass} flex items-center justify-center text-sm`}>2</span>
              Key Capabilities
            </h4>
            <div className="grid md:grid-cols-2 gap-3">
              {agent.capabilities.map((cap) => (
                <div key={cap.title} className="flex items-start gap-2">
                  <CheckCircle2 className={`size-5 ${agent.checkColorClass} flex-shrink-0 mt-0.5`} />
                  <div>
                    <p className="text-sm text-neutral-900">{cap.title}</p>
                    <p className="text-xs text-neutral-600">{cap.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
              <span className={`size-6 rounded-full ${agent.numberBgClass} ${agent.numberTextClass} flex items-center justify-center text-sm`}>3</span>
              Best Used For
            </h4>
            <ul className="space-y-2">
              {agent.bestUsedFor.map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-sm text-neutral-700">
                  <ArrowRight className={`size-4 ${agent.arrowColorClass} flex-shrink-0 mt-0.5`} />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          {agent.callout && (
            <div className={`${agent.callout.bgClass} rounded-lg p-4 border ${agent.callout.borderClass}`}>
              <p className={`text-sm ${agent.callout.textClass}`}>
                <strong>{agent.callout.label}</strong> {agent.callout.text}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
