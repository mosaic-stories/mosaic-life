import { MessageSquare, GitBranch, History, Image, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { type ToolId, useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ASSEMBLY_TOOLS: { id: ToolId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'ai-chat', icon: MessageSquare, label: 'AI Persona' },
  { id: 'context', icon: GitBranch, label: 'Context' },
];

const REFERENCE_TOOLS: { id: ToolId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
];

const REWRITE_TOOL: { id: ToolId; icon: typeof Sparkles; label: string } = {
  id: 'rewrite', icon: Sparkles, label: 'Rewrite',
};

function ToolButton({
  id,
  icon: Icon,
  label,
  activeTool,
  onClick,
}: {
  id: ToolId;
  icon: typeof MessageSquare;
  label: string;
  activeTool: ToolId;
  onClick: (id: ToolId) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onClick(id)}
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
  );
}

export function ToolStrip() {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);

  return (
    <div className="flex flex-col items-center py-2 px-1 border-x bg-neutral-50 shrink-0 w-12">
      {/* Assembly tools */}
      {ASSEMBLY_TOOLS.map((tool) => (
        <ToolButton key={tool.id} {...tool} activeTool={activeTool} onClick={setActiveTool} />
      ))}

      {/* Divider */}
      <hr className="w-6 border-neutral-200 my-1" />

      {/* Reference tools */}
      {REFERENCE_TOOLS.map((tool) => (
        <ToolButton key={tool.id} {...tool} activeTool={activeTool} onClick={setActiveTool} />
      ))}

      {/* Spacer pushes Rewrite to bottom */}
      <div className="flex-1" />

      {/* Divider */}
      <hr className="w-6 border-neutral-200 my-1" />

      {/* Rewrite tool at bottom */}
      <ToolButton {...REWRITE_TOOL} activeTool={activeTool} onClick={setActiveTool} />
    </div>
  );
}
