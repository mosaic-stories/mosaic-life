import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InviteMemberModal from '@/features/members/components/InviteMemberModal';
import { useDismissInvitePrompt } from '@/features/legacy/hooks/useLegacies';
import { shouldShowInvitePrompt, type Legacy } from '@/features/legacy/api/legacies';

interface InvitePromptCardProps {
  legacy: Legacy;
  currentUserRole: string;
}

/**
 * Dismissible full-card prompt shown right after a legacy's first story is
 * published (or right after creation, before any story exists), inviting
 * the founding member to bring in the people who knew the subject.
 *
 * Visibility is entirely derived from the legacy payload (member_count,
 * published_story_count, invite_prompt_dismissed_at) — dismissal persists
 * per legacy, not per user, so once any member dismisses it the prompt
 * disappears for everyone.
 */
export default function InvitePromptCard({ legacy, currentUserRole }: InvitePromptCardProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const dismissInvitePrompt = useDismissInvitePrompt();

  if (!shouldShowInvitePrompt(legacy)) {
    return null;
  }

  const handleDismiss = () => {
    dismissInvitePrompt.mutate(legacy.id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
      <div className="relative bg-gradient-to-br from-theme-primary-dark to-theme-primary rounded-2xl p-5 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissInvitePrompt.isPending}
          aria-label="Dismiss"
          className="absolute top-3 right-3 p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
        >
          <X className="size-4" />
        </button>

        <div className="flex-1 pr-6">
          <h3 className="font-serif text-lg sm:text-xl font-semibold">
            {legacy.name}&rsquo;s page is ready.
          </h3>
          <p className="text-sm text-white/85 mt-1">
            Invite the people who knew {legacy.name} to add their memories.
          </p>
        </div>

        <Button
          className="shrink-0 bg-white text-theme-primary-dark hover:bg-white/90"
          onClick={() => setShowInviteModal(true)}
        >
          <UserPlus className="size-4 mr-2" />
          Invite people
        </Button>
      </div>

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        legacyId={legacy.id}
        currentUserRole={currentUserRole}
        onInviteSent={() => setShowInviteModal(false)}
      />
    </div>
  );
}
