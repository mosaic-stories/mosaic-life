import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { StyleTool } from '../tools/StyleTool';

interface ToolPanelProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
}

export function ToolPanel({ legacyId, storyId, conversationId }: ToolPanelProps) {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-4 py-2 border-b shrink-0">
        <h2 className="text-sm font-medium text-neutral-600 capitalize">
          {activeTool.replace('-', ' ')}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTool === 'ai-chat' && (
          <AIChatTool
            legacyId={legacyId}
            storyId={storyId}
            conversationId={conversationId}
          />
        )}
        {activeTool === 'context' && <ContextTool storyId={storyId} />}
        {activeTool === 'versions' && <VersionsTool storyId={storyId} />}
        {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
        {activeTool === 'style' && <StyleTool />}
      </div>
    </div>
  );
}
