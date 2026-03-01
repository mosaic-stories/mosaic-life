import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { RewriteTool } from '../tools/RewriteTool';

interface MobileToolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  storyId: string;
  conversationId: string | null;
  currentContent: string;
  onRewrite: () => void;
  onCancelRewrite?: () => void;
}

export function MobileToolSheet({
  open,
  onOpenChange,
  legacyId,
  storyId,
  conversationId,
  currentContent,
  onRewrite,
  onCancelRewrite,
}: MobileToolSheetProps) {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[60vh]">
        <div className="px-2 py-1 border-b">
          <h2 className="text-sm font-medium text-neutral-600 capitalize">
            {activeTool.replace('-', ' ')}
          </h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {activeTool === 'ai-chat' && (
            <AIChatTool key={conversationId} legacyId={legacyId} storyId={storyId} conversationId={conversationId} />
          )}
          {activeTool === 'context' && <ContextTool storyId={storyId} />}
          {activeTool === 'versions' && <VersionsTool storyId={storyId} currentContent={currentContent} />}
          {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
          {activeTool === 'rewrite' && (
            <RewriteTool
              storyId={storyId}
              conversationId={conversationId}
              onRewrite={() => {
                onRewrite();
                onOpenChange(false); // dismiss sheet after triggering
              }}
              onCancel={onCancelRewrite}
              hasContent={currentContent.trim().length > 0}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
