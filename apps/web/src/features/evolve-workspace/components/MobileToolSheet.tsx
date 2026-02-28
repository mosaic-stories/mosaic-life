import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { StyleTool } from '../tools/StyleTool';

interface MobileToolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  storyId: string;
  conversationId: string | null;
  currentContent: string;
}

export function MobileToolSheet({
  open,
  onOpenChange,
  legacyId,
  storyId,
  conversationId,
  currentContent,
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
            <AIChatTool legacyId={legacyId} storyId={storyId} conversationId={conversationId} />
          )}
          {activeTool === 'context' && <ContextTool storyId={storyId} />}
          {activeTool === 'versions' && <VersionsTool storyId={storyId} currentContent={currentContent} />}
          {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
          {activeTool === 'style' && <StyleTool />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
