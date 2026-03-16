import { useNavigate } from 'react-router-dom';
import { PenLine, Plus, Sparkles, MessageCircle, RefreshCw, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserLink from '@/components/UserLink';
import { useCurrentPrompt, useShufflePrompt, useActOnPrompt } from '@/features/story-prompts/hooks/useStoryPrompt';
import type { Legacy, LegacyMember } from '@/features/legacy/api/legacies';
import type { SectionId } from './SectionNav';
import SidebarSection from './SidebarSection';

interface LegacySidebarProps {
  legacy: Legacy;
  legacyId: string;
  onMembersClick: () => void;
  onSectionChange: (section: SectionId) => void;
}

export default function LegacySidebar({
  legacy,
  legacyId,
  onMembersClick,
  onSectionChange,
}: LegacySidebarProps) {
  const navigate = useNavigate();
  const members = legacy.members ?? [];

  return (
    <aside className="space-y-5">
      {/* About / Timeline / Members card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        {/* About */}
        <SidebarSection title="About">
          {legacy.biography ? (
            <p className="text-sm text-neutral-600 leading-relaxed mb-3">
              {legacy.biography}
            </p>
          ) : (
            <p className="text-sm text-neutral-400 italic mb-3">
              Add a biography to tell their story
            </p>
          )}
          <button
            onClick={() => navigate(`/legacy/${legacyId}/edit`)}
            className="text-sm font-medium text-theme-primary hover:text-theme-primary-dark transition-colors flex items-center gap-1"
          >
            Edit biography <PenLine size={12} />
          </button>
        </SidebarSection>

        {/* Life Timeline (stub) */}
        <SidebarSection title="Life Timeline" defaultOpen={false}>
          <div className="flex items-center gap-3 py-2">
            <div className="flex flex-col items-center">
              <div className="size-2 rounded-full bg-neutral-300" />
              <div className="w-px h-6 bg-stone-200" />
              <div className="size-2 rounded-full bg-neutral-300" />
            </div>
            <div>
              <p className="text-sm text-neutral-400 italic">
                Add life events to build a timeline
              </p>
              <button
                onClick={() => navigate(`/legacy/${legacyId}/edit`)}
                className="text-xs font-medium text-theme-primary hover:text-theme-primary-dark transition-colors mt-1 flex items-center gap-1"
              >
                <Calendar size={11} /> Add events
              </button>
            </div>
          </div>
        </SidebarSection>

        {/* Members */}
        <SidebarSection title="Members">
          <div className="flex flex-col gap-2.5">
            {members.map((member) => (
              <MemberRow key={member.user_id} member={member} />
            ))}
            <button
              onClick={onMembersClick}
              className="flex items-center gap-1.5 py-2 text-sm font-medium text-theme-primary hover:text-theme-primary-dark transition-colors"
            >
              <Plus size={14} /> Invite someone
            </button>
          </div>
        </SidebarSection>
      </div>

      {/* AI Story Prompt widget */}
      <StoryPromptWidget
        legacyId={legacyId}
        onSectionChange={onSectionChange}
      />
    </aside>
  );
}

function MemberRow({ member }: { member: LegacyMember }) {
  const roleLabel = member.role === 'creator' ? 'Creator' : 'Member';

  return (
    <div className="flex items-center gap-2.5">
      <UserLink
        username={member.username}
        displayName={member.name || member.email}
        avatarUrl={member.avatar_url}
        showAvatar
        className="text-sm font-medium text-neutral-800"
      />
      <div className="ml-auto">
        <div className="text-[11px] text-neutral-400">{roleLabel}</div>
      </div>
    </div>
  );
}

function StoryPromptWidget({
  legacyId: _legacyId,
  onSectionChange,
}: {
  legacyId: string;
  onSectionChange: (section: SectionId) => void;
}) {
  const navigate = useNavigate();
  const { data: prompt, isLoading } = useCurrentPrompt();
  const shuffle = useShufflePrompt();
  const act = useActOnPrompt();

  if (isLoading || !prompt) return null;

  const handleDiscuss = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'discuss',
    });
    if (result.conversation_id) {
      navigate(
        `/legacy/${result.legacy_id}?tab=ai&conversation=${result.conversation_id}&seed=story_prompt`,
      );
      onSectionChange('ai');
    }
  };

  const handleWriteStory = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'write_story',
    });
    if (result.story_id) {
      navigate(
        `/legacy/${result.legacy_id}/story/${result.story_id}/evolve?conversation_id=${result.conversation_id}`,
      );
    }
  };

  const handleShuffle = () => {
    shuffle.mutate(prompt.id);
  };

  return (
    <div className="bg-gradient-to-br from-theme-primary-dark to-theme-primary rounded-2xl p-5 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} />
          <span className="text-sm font-semibold">Story Prompt</span>
        </div>
        <button
          onClick={handleShuffle}
          disabled={shuffle.isPending}
          className="text-white/60 hover:text-white transition-colors"
          title="Get a different prompt"
        >
          <RefreshCw size={14} className={shuffle.isPending ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="font-serif text-[15px] italic leading-relaxed mb-4 opacity-95">
        &ldquo;{prompt.prompt_text}&rdquo;
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 bg-white/20 backdrop-blur border-white/30 text-white hover:bg-white/30 hover:text-white"
          onClick={handleDiscuss}
          disabled={act.isPending}
        >
          <MessageCircle size={14} className="mr-1.5" />
          Discuss
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-white text-theme-primary-dark hover:bg-white/90"
          onClick={handleWriteStory}
          disabled={act.isPending}
        >
          <PenLine size={14} className="mr-1.5" />
          Write a Story
        </Button>
      </div>
    </div>
  );
}
