import { ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { usePersonas } from '@/features/ai-chat/hooks/useAIChat';
import { PersonaIcon } from '@/features/ai-chat/components/PersonaIcon';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

const PHASE_1_PERSONAS = ['biographer', 'friend'];

export function PersonaSelector({ disabled }: { disabled?: boolean }) {
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);
  const setActivePersona = useEvolveWorkspaceStore((s) => s.setActivePersona);
  const { data: personas } = usePersonas();

  const available = personas?.filter((p) => PHASE_1_PERSONAS.includes(p.id)) ?? [];
  const active = available.find((p) => p.id === activePersonaId);

  return (
    <div className="px-3 py-2 border-b shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between h-auto py-1.5 px-2 font-normal"
            disabled={disabled}
          >
            <span className="flex items-center gap-2 min-w-0">
              {active && <PersonaIcon iconName={active.icon} />}
              <span className="text-sm font-medium truncate">
                {active?.name ?? 'Select persona'}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
          {available.map((persona) => (
            <DropdownMenuItem
              key={persona.id}
              onClick={() => setActivePersona(persona.id)}
              className="flex items-center gap-2"
            >
              <PersonaIcon iconName={persona.icon} />
              <span className="flex-1 text-sm">{persona.name}</span>
              {persona.id === activePersonaId && (
                <Check className="h-4 w-4 text-theme-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
