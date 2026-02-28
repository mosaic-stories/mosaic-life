import { MessageSquare, GitBranch, History, Image, Pen, Sparkles } from 'lucide-react';

const MOBILE_TOOLS = [
  { id: 'ai-chat', icon: MessageSquare, label: 'Chat' },
  { id: 'context', icon: GitBranch, label: 'Context' },
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
  { id: 'style', icon: Pen, label: 'Style' },
  { id: 'rewrite', icon: Sparkles, label: 'Rewrite' },
];

interface MobileBottomBarProps {
  wordCount: number;
  onToolSelect: (toolId: string) => void;
}

export function MobileBottomBar({ wordCount, onToolSelect }: MobileBottomBarProps) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 border-t bg-white shrink-0">
      <div className="flex items-center gap-1">
        {MOBILE_TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onToolSelect(id)}
            className="flex flex-col items-center p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={label}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] mt-0.5">{label}</span>
          </button>
        ))}
      </div>
      <span className="text-[10px] text-neutral-400">{wordCount}w</span>
    </div>
  );
}
