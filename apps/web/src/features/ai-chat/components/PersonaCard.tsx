/**
 * Persona selection card showing icon, name, and description.
 */

import { Card } from '@/components/ui/card';
import type { Persona } from '@/features/ai-chat/api/ai';
import { PersonaIcon } from './PersonaIcon';
import { getPersonaColor } from './utils';

interface PersonaCardProps {
  persona: Persona;
  isSelected: boolean;
  onSelect: (personaId: string) => void;
}

export function PersonaCard({ persona, isSelected, onSelect }: PersonaCardProps) {
  return (
    <Card
      className={`p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-amber-300 bg-amber-50 shadow-sm'
          : 'hover:border-neutral-300 hover:shadow-sm'
      }`}
      onClick={() => onSelect(persona.id)}
    >
      <div className="flex items-start gap-3">
        <div
          className={`size-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getPersonaColor(persona.id)}`}
        >
          <PersonaIcon iconName={persona.icon} />
        </div>
        <div className="space-y-1 flex-1">
          <h3 className="text-neutral-900">{persona.name}</h3>
          <p className="text-sm text-neutral-600 leading-relaxed">
            {persona.description}
          </p>
        </div>
      </div>
    </Card>
  );
}
