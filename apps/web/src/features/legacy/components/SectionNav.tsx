import { BookOpen, Image, Link2, Sparkles, Users, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

export type SectionId = 'stories' | 'media' | 'links' | 'ai';

interface TabDef {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

const tabs: TabDef[] = [
  { id: 'stories', label: 'Stories', icon: BookOpen },
  { id: 'media', label: 'Media Gallery', icon: Image },
  { id: 'links', label: 'Linked Legacies', icon: Link2 },
  { id: 'ai', label: 'AI Chat', icon: Sparkles },
];

export interface SectionNavProps {
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
  storyCount?: number;
  memberCount?: number;
  creatorName?: string | null;
  creatorUsername?: string | null;
  creatorIsCurrentUser?: boolean;
  onMembersClick?: () => void;
}

export default function SectionNav({
  activeSection,
  onSectionChange,
  storyCount,
  memberCount,
  creatorName,
  creatorUsername,
  creatorIsCurrentUser,
  onMembersClick,
}: SectionNavProps) {
  return (
    <nav className="bg-white border-b sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Tabs */}
        <div className="flex gap-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSectionChange(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3.5 border-b-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'border-theme-primary text-neutral-900 font-semibold'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700'
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === 'stories' && storyCount != null && storyCount > 0 && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-px rounded-md ${
                      isActive
                        ? 'bg-theme-primary text-white'
                        : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {storyCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick stats (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-5">
          {storyCount != null && (
            <div className="flex items-center gap-1.5 text-[13px] text-neutral-500">
              <MessageSquare size={14} />
              {storyCount} {storyCount === 1 ? 'story' : 'stories'}
            </div>
          )}
          {memberCount != null && (
            <button
              onClick={onMembersClick}
              className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-theme-primary transition-colors"
            >
              <Users size={14} />
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </button>
          )}
          {creatorName && (
            <div className="text-[13px] text-neutral-500">
              Created by {' '}
              {creatorUsername ? (
                <Link
                  to={`/u/${creatorUsername}`}
                  className="font-semibold text-theme-primary hover:underline"
                >
                  {creatorIsCurrentUser ? 'you' : creatorName}
                </Link>
              ) : (
                <span className="font-semibold text-theme-primary">{creatorName}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
