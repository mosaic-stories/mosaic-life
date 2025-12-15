import { useState } from 'react';
import { UserPlus, MoreVertical, Mail, Clock, Link, Check } from 'lucide-react';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import {
  useMembers,
  useChangeMemberRole,
  useRemoveMember,
  useLeaveLegacy,
} from '@/lib/hooks/useLegacies';
import {
  useInvitations,
  useRevokeInvitation,
} from '@/lib/hooks/useInvitations';
import { useAuth } from '@/contexts/AuthContext';
import InviteMemberModal from './InviteMemberModal';

interface MemberDrawerProps {
  legacyId: string;
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: string;
  visibility?: 'public' | 'private';
  isMember?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator',
  admin: 'Admin',
  advocate: 'Advocate',
  admirer: 'Admirer',
};

const ROLE_COLORS: Record<string, string> = {
  creator: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  advocate: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  admirer: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const ROLE_LEVELS: Record<string, number> = {
  creator: 4,
  admin: 3,
  advocate: 2,
  admirer: 1,
};

export default function MemberDrawer({
  legacyId,
  isOpen,
  onClose,
  currentUserRole,
  visibility = 'private',
  isMember = true,
}: MemberDrawerProps) {
  const { user } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: members = [], isLoading: membersLoading } = useMembers(legacyId);
  const { data: invitations = [], isLoading: _invitationsLoading } = useInvitations(legacyId);

  const changeRole = useChangeMemberRole();
  const removeMember = useRemoveMember();
  const leaveLegacy = useLeaveLegacy();
  const revokeInvitation = useRevokeInvitation();

  const canManage = currentUserRole === 'creator' || currentUserRole === 'admin';
  const canInvite = currentUserRole !== 'admirer';
  const currentUserLevel = ROLE_LEVELS[currentUserRole] || 0;

  const handleRoleChange = async (userId: string, newRole: string) => {
    await changeRole.mutateAsync({ legacyId, userId, role: newRole });
  };

  const handleRemoveMember = async (userId: string) => {
    if (confirm('Are you sure you want to remove this member?')) {
      await removeMember.mutateAsync({ legacyId, userId });
    }
  };

  const handleLeaveLegacy = async () => {
    if (confirm('Are you sure you want to leave this legacy?')) {
      await leaveLegacy.mutateAsync(legacyId);
      onClose();
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (confirm('Are you sure you want to revoke this invitation?')) {
      await revokeInvitation.mutateAsync({ legacyId, invitationId });
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/legacy/${legacyId}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const getManageableRoles = () => {
    const roles = ['admirer', 'advocate', 'admin', 'creator'];
    return roles.filter(role => ROLE_LEVELS[role] <= currentUserLevel);
  };

  // Filter to only show pending invitations
  const pendingInvitations = invitations.filter(inv => inv.status === 'pending');

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between">
            <SheetTitle>Members</SheetTitle>
            <div className="flex items-center gap-2">
              {canInvite && isMember && (
                <Button
                  size="sm"
                  onClick={() => setShowInviteModal(true)}
                >
                  <UserPlus className="size-4 mr-2" />
                  Invite
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Copy Link for Public Legacies */}
            {visibility === 'public' && (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
                    <Link className="size-4" />
                    <span>This legacy is public</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyLink}
                    className="border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-800"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="size-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Link className="size-4 mr-2" />
                        Copy Link
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Anyone with this link can view this legacy without being a member.
                </p>
              </div>
            )}
            {/* Members List */}
            <div className="space-y-3">
              {membersLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                members.map((member) => {
                  const isCurrentUser = member.user_id === user?.id;
                  const canManageThis = canManage &&
                    ROLE_LEVELS[member.role] <= currentUserLevel &&
                    !isCurrentUser;

                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      <Avatar className="size-10">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback>
                          {(member.name || member.email).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {member.name || member.email}
                          {isCurrentUser && (
                            <span className="text-muted-foreground ml-1">(you)</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {member.email}
                        </div>
                      </div>

                      {canManageThis ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.user_id, value)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getManageableRoles().map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={ROLE_COLORS[member.role]}>
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      )}

                      {canManageThis && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}

                      {isCurrentUser && currentUserRole !== 'creator' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={handleLeaveLegacy}
                        >
                          Leave
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Pending Invitations */}
            {canManage && pendingInvitations.length > 0 && (
              <>
                <Separator />

                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Mail className="size-4" />
                    Pending Invitations
                  </h3>

                  <div className="space-y-3">
                    {pendingInvitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-dashed"
                      >
                        <Avatar className="size-10">
                          <AvatarFallback>
                            {invitation.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {invitation.email}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            Expires {new Date(invitation.expires_at).toLocaleDateString()}
                          </div>
                        </div>

                        <Badge variant="outline" className={ROLE_COLORS[invitation.role]}>
                          {ROLE_LABELS[invitation.role]}
                        </Badge>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleRevokeInvitation(invitation.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        legacyId={legacyId}
        currentUserRole={currentUserRole}
        onInviteSent={() => setShowInviteModal(false)}
      />
    </>
  );
}
