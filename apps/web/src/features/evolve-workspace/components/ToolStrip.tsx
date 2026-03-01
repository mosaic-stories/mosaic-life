import { MessageSquare, GitBranch, History, Image, Pen } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { type ToolId, useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TOOLS: { id: ToolId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'ai-chat', icon: MessageSquare, label: 'AI Persona' },
  { id: 'context', icon: GitBranch, label: 'Context' },
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
  { id: 'style', icon: Pen, label: 'Style' },
];

export function ToolStrip() {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);

  return (
    <div className="flex flex-col items-center py-2 px-1 border-x bg-neutral-50 shrink-0 w-12">
      {TOOLS.map(({ id, icon: Icon, label }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveTool(id)}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-md mb-1 transition-colors',
                activeTool === id
                  ? 'bg-theme-primary/10 text-theme-primary'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
              )}
              aria-label={label}
              aria-pressed={activeTool === id}
            >
              <Icon className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
