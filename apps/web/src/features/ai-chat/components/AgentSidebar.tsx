/**
 * Desktop persona list sidebar.
 */

import type { Persona } from '@/features/ai-chat/api/ai';
import { PersonaCard } from './PersonaCard';

interface AgentSidebarProps {
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (personaId: string) => void;
}

export function AgentSidebar({ personas, selectedPersonaId, onSelectPersona }: AgentSidebarProps) {
  return (
    <aside className="hidden md:block w-80 bg-white border-r p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-neutral-900">Select an Agent</h2>
        <p className="text-sm text-neutral-600">
          Each agent brings a unique perspective to help you preserve memories
        </p>
      </div>

      <div className="space-y-3">
        {personas.map((persona) => (
          <PersonaCard
            key={persona.id}
            persona={persona}
            isSelected={selectedPersonaId === persona.id}
            onSelect={onSelectPersona}
          />
        ))}
      </div>
    </aside>
  );
}
