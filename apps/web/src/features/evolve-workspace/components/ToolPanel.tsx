import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { RewriteTool } from '../tools/RewriteTool';
import { SettingsTool } from '../tools/SettingsTool';

interface ToolPanelProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
  currentContent: string;
  onRewrite: () => void;
  onCancelRewrite?: () => void;
}

export function ToolPanel({
  legacyId,
  storyId,
  conversationId,
  currentContent,
  onRewrite,
  onCancelRewrite,
}: ToolPanelProps) {
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
            key={conversationId}
            legacyId={legacyId}
            storyId={storyId}
            conversationId={conversationId}
          />
        )}
        {activeTool === 'context' && <ContextTool storyId={storyId} />}
        {activeTool === 'versions' && <VersionsTool storyId={storyId} currentContent={currentContent} />}
        {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
        {activeTool === 'rewrite' && (
          <RewriteTool
            storyId={storyId}
            conversationId={conversationId}
            onRewrite={onRewrite}
            onCancel={onCancelRewrite}
            hasContent={currentContent.trim().length > 0}
          />
        )}
        {activeTool === 'settings' && (
          <SettingsTool storyId={storyId} legacyId={legacyId} />
        )}
      </div>
    </div>
  );
}
