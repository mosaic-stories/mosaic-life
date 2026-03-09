import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, PenLine, Users, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import LegacyPickerDialog from '@/components/stories-hub/LegacyPickerDialog';
import InviteMemberModal from '@/features/members/components/InviteMemberModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { rewriteBackendUrlForDev } from '@/lib/url';

export default function QuickActions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useLegacies('all');

  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedLegacyId, setSelectedLegacyId] = useState<string | null>(null);

  const legacies = useMemo(() => data?.items ?? [], [data]);

  const currentUserRole = useMemo(() => {
    if (!user || !selectedLegacyId) return 'admirer';
    const legacy = legacies.find((l) => l.id === selectedLegacyId);
    const member = legacy?.members?.find((m) => m.email === user.email);
    return member?.role || 'admirer';
  }, [user, selectedLegacyId, legacies]);

  const handleWriteStory = () => {
    if (legacies.length === 0) return;
    if (legacies.length === 1) {
      navigate(`/legacy/${legacies[0].id}/story/new`);
    } else {
      setStoryPickerOpen(true);
    }
  };

  const handleInviteFamily = () => {
    if (legacies.length === 0) return;
    if (legacies.length === 1) {
      setSelectedLegacyId(legacies[0].id);
      setInviteModalOpen(true);
    } else {
      setInvitePickerOpen(true);
    }
  };

  const handleInviteLegacySelect = (legacyId: string) => {
    setInvitePickerOpen(false);
    setSelectedLegacyId(legacyId);
    setInviteModalOpen(true);
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
      disabled: isLoading || legacies.length === 0,
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
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Quick Actions
        </h3>
        <div className="space-y-1">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <action.icon className="size-4 text-neutral-400" />
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Story legacy picker (reuse existing component) */}
      <LegacyPickerDialog
        open={storyPickerOpen}
        onOpenChange={setStoryPickerOpen}
      />

      {/* Invite legacy picker */}
      <InviteLegacyPicker
        open={invitePickerOpen}
        onOpenChange={setInvitePickerOpen}
        onSelect={handleInviteLegacySelect}
      />

      {/* Invite member modal */}
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

/* ------------------------------------------------------------------ */
/* Internal legacy picker for the invite flow                          */
/* ------------------------------------------------------------------ */

interface InviteLegacyPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (legacyId: string) => void;
}

function InviteLegacyPicker({ open, onOpenChange, onSelect }: InviteLegacyPickerProps) {
  const { data, isLoading } = useLegacies('all', { enabled: open });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a Legacy</DialogTitle>
          <DialogDescription>
            Select which legacy to invite a family member to.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {!isLoading && data && (
          <div className="max-h-[300px] space-y-1 overflow-y-auto">
            {data.items.map((legacy) => (
              <button
                key={legacy.id}
                onClick={() => onSelect(legacy.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100"
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {legacy.name}
                  </p>
                </div>
              </button>
            ))}

            {data.items.length === 0 && (
              <p className="py-4 text-center text-sm text-neutral-500">
                No legacies found. Create a legacy first.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
