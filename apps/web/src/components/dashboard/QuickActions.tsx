import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader2, PenLine, Plus, Users } from 'lucide-react';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import { useCreateStory } from '@/features/story/hooks/useStories';
import InviteMemberModal from '@/features/members/components/InviteMemberModal';
import { rewriteBackendUrlForDev } from '@/lib/url';

type PickerMode = 'story' | 'invite' | null;

export default function QuickActions() {
  const navigate = useNavigate();
  const { data, isLoading } = useLegacies('all');
  const createStory = useCreateStory();

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedLegacyId, setSelectedLegacyId] = useState<string | null>(null);

  const legacies = useMemo(() => data?.items ?? [], [data]);

  const currentUserRole = useMemo(() => {
    if (!selectedLegacyId) return 'admirer';
    const legacy = legacies.find((item) => item.id === selectedLegacyId);
    return legacy?.current_user_role || 'admirer';
  }, [legacies, selectedLegacyId]);

  const createDraftStoryAndNavigate = async (legacyId: string) => {
    try {
      const title = `Untitled Story - ${new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
      const newStory = await createStory.mutateAsync({
        title,
        content: '',
        visibility: 'private',
        status: 'draft',
        legacies: [{ legacy_id: legacyId, role: 'primary', position: 0 }],
      });
      navigate(`/legacy/${legacyId}/story/${newStory.id}/evolve`);
    } catch (error) {
      console.error('Failed to create story:', error);
    }
  };

  const handleWriteStory = async () => {
    if (legacies.length === 0) return;
    if (legacies.length === 1) {
      await createDraftStoryAndNavigate(legacies[0].id);
      return;
    }
    setPickerMode((currentMode) => (currentMode === 'story' ? null : 'story'));
  };

  const handleInviteFamily = () => {
    if (legacies.length === 0) return;
    if (legacies.length === 1) {
      setSelectedLegacyId(legacies[0].id);
      setPickerMode(null);
      setInviteModalOpen(true);
      return;
    }
    setPickerMode((currentMode) => (currentMode === 'invite' ? null : 'invite'));
  };

  const handleLegacySelect = async (legacyId: string) => {
    if (pickerMode === 'story') {
      setPickerMode(null);
      await createDraftStoryAndNavigate(legacyId);
      return;
    }

    if (pickerMode === 'invite') {
      setPickerMode(null);
      setSelectedLegacyId(legacyId);
      setInviteModalOpen(true);
    }
  };

  const handleInviteModalClose = () => {
    setInviteModalOpen(false);
    setSelectedLegacyId(null);
  };

  const actions = [
    {
      icon: Plus,
      label: 'Create a Legacy',
      onClick: () => navigate('/legacy/new'),
      disabled: false,
    },
    {
      icon: PenLine,
      label: 'Write a Story',
      onClick: handleWriteStory,
      disabled: isLoading || legacies.length === 0 || createStory.isPending,
    },
    {
      icon: Users,
      label: 'Invite Family',
      onClick: handleInviteFamily,
      disabled: isLoading || legacies.length === 0,
    },
  ];

  return (
    <>
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Quick Actions
          </h3>
          {pickerMode && legacies.length > 1 && (
            <button
              type="button"
              onClick={() => setPickerMode(null)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-700"
            >
              Collapse
              <ChevronUp className="size-3" />
            </button>
          )}
        </div>
        <div className="space-y-1">
          {actions.map((action) => (
            <button
              type="button"
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label === 'Write a Story' && createStory.isPending ? (
                <Loader2 className="size-4 animate-spin text-neutral-400" />
              ) : (
                <action.icon className="size-4 text-neutral-400" />
              )}
              {action.label}
            </button>
          ))}
        </div>

        {pickerMode && legacies.length > 1 && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              <ChevronDown className="size-3.5" />
              {pickerMode === 'story'
                ? 'Choose a legacy to start writing'
                : 'Choose a legacy to invite family to'}
            </div>
            <div className="space-y-1">
              {legacies.map((legacy) => (
                <button
                  key={legacy.id}
                  type="button"
                  onClick={() => handleLegacySelect(legacy.id)}
                  disabled={createStory.isPending}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="size-10 flex-shrink-0 overflow-hidden rounded-full bg-neutral-100">
                    {legacy.profile_image_url ? (
                      <img
                        src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                        alt={legacy.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Users className="size-4 text-neutral-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {legacy.name}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {pickerMode === 'story' ? 'Open story draft workspace' : 'Open invitation dialog'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedLegacyId && (
        <InviteMemberModal
          isOpen={inviteModalOpen}
          onClose={handleInviteModalClose}
          legacyId={selectedLegacyId}
          currentUserRole={currentUserRole}
          onInviteSent={handleInviteModalClose}
        />
      )}
    </>
  );
}
