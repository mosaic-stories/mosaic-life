import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PersonaDetail } from './howItWorksData';

interface PersonaDetailCardProps {
  persona: PersonaDetail;
}

export function PersonaDetailCard({ persona }: PersonaDetailCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className={`${persona.headerGradient} p-6 border-b ${persona.headerBorderClass}`}>
        <div className="flex items-start gap-4">
          <div className={`size-16 rounded-xl ${persona.iconBgClass} flex items-center justify-center flex-shrink-0 shadow-lg`}>
            <span className="text-3xl">{persona.emoji}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-neutral-900">{persona.title}</h3>
              <Badge className={persona.badgeClasses}>{persona.badge}</Badge>
            </div>
            <p className="text-neutral-600 text-sm">
              {persona.tagline}
            </p>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <h4 className="text-neutral-900 mb-2">Personality & Approach</h4>
          <p className="text-sm text-neutral-700 leading-relaxed">
            {persona.personality}
          </p>
        </div>

        <div>
          <h4 className="text-neutral-900 mb-2">Best For</h4>
          <ul className="space-y-2 text-sm text-neutral-700">
            {persona.bestFor.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className={`size-4 ${persona.checkColorClass} flex-shrink-0 mt-0.5`} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${persona.callout.bgClass} rounded-lg p-4 border ${persona.callout.borderClass}`}>
          <p className={`text-xs ${persona.callout.textClass}`}>
            <strong>{persona.callout.label}</strong> {persona.callout.text}
          </p>
        </div>

        <div>
          <h4 className="text-neutral-900 mb-2">Conversation Style</h4>
          <p className="text-xs text-neutral-600">
            {persona.conversationStyle}
          </p>
        </div>

        {persona.extraNote && (
          <div className={`mt-4 p-3 ${persona.extraNote.bgClass} rounded-lg border ${persona.extraNote.borderClass}`}>
            <p className={`text-xs ${persona.extraNote.textClass}`}>
              <strong>Note:</strong> {persona.extraNote.text}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
