/**
 * Mobile persona selector using a Sheet component.
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import type { Persona } from '@/features/ai-chat/api/ai';
import { PersonaCard } from './PersonaCard';

interface MobileAgentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (personaId: string) => void;
}

export function MobileAgentSheet({
  open,
  onOpenChange,
  personas,
  selectedPersonaId,
  onSelectPersona,
}: MobileAgentSheetProps) {
  const handleSelect = (personaId: string) => {
    onSelectPersona(personaId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 p-0">
        <SheetHeader className="p-6 pb-2">
          <SheetTitle>Select an Agent</SheetTitle>
          <SheetDescription>
            Each agent brings a unique perspective to help you preserve memories
          </SheetDescription>
        </SheetHeader>
        <div className="p-6 pt-4 space-y-3 overflow-y-auto">
          {personas.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              isSelected={selectedPersonaId === persona.id}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
