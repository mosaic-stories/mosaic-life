import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Mail, Send, X, User, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useSendInvitation } from '@/lib/hooks/useInvitations';
import { useUserSearch, UserSearchResult } from '@/lib/hooks/useUsers';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  legacyId: string;
  currentUserRole: string;
  onInviteSent: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator - Full control, can delete legacy',
  admin: 'Admin - Can manage members and content',
  advocate: 'Advocate - Can contribute stories and media',
  admirer: 'Admirer - Can view only',
};

const ROLE_LEVELS: Record<string, number> = {
  creator: 4,
  admin: 3,
  advocate: 2,
  admirer: 1,
};

const DEBOUNCE_MS = 300;

export default function InviteMemberModal({
  isOpen,
  onClose,
  legacyId,
  currentUserRole,
  onInviteSent,
}: InviteMemberModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [role, setRole] = useState<'creator' | 'admin' | 'advocate' | 'admirer'>('advocate');
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sendInvitation = useSendInvitation();

  // Determine mode based on input
  const isEmailMode = inputValue.includes('@');
  const isSearchMode = !isEmailMode && inputValue.length >= 3;

  // Debounce search query
  useEffect(() => {
    if (!isSearchMode) {
      setDebouncedQuery('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [inputValue, isSearchMode]);

  // Search users
  const { data: searchResults, isLoading: isSearching } = useUserSearch(
    debouncedQuery,
    isSearchMode && !selectedUser
  );

  // Show dropdown when we have results or are searching
  useEffect(() => {
    if (isSearchMode && !selectedUser && (searchResults?.length || isSearching)) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [isSearchMode, selectedUser, searchResults, isSearching]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentUserLevel = ROLE_LEVELS[currentUserRole] || 0;

  const getInvitableRoles = () => {
    const allRoles: Array<'creator' | 'admin' | 'advocate' | 'admirer'> = [
      'admirer',
      'advocate',
      'admin',
      'creator',
    ];
    return allRoles.filter((r) => ROLE_LEVELS[r] <= currentUserLevel);
  };

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUser(user);
    setInputValue('');
    setShowDropdown(false);
    setError(null);
  };

  const handleClearSelection = () => {
    setSelectedUser(null);
    setInputValue('');
    inputRef.current?.focus();
  };

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Determine what we're sending
    if (selectedUser) {
      // Send by user_id
      try {
        await sendInvitation.mutateAsync({
          legacyId,
          data: { user_id: selectedUser.id, role },
        });
        resetForm();
        onInviteSent();
      } catch (err) {
        handleError(err);
      }
    } else if (isEmailMode && isValidEmail(inputValue.trim())) {
      // Send by email
      try {
        await sendInvitation.mutateAsync({
          legacyId,
          data: { email: inputValue.trim(), role },
        });
        resetForm();
        onInviteSent();
      } catch (err) {
        handleError(err);
      }
    } else {
      setError('Please enter a valid email address or select a user from the search results.');
    }
  };

  const handleError = (err: unknown) => {
    if (err instanceof Error) {
      // Try to extract detail from API error
      const apiError = err as { data?: { detail?: string } };
      if (apiError.data?.detail) {
        setError(apiError.data.detail);
      } else {
        setError(err.message);
      }
    } else {
      setError('Failed to send invitation. Please try again.');
    }
  };

  const resetForm = () => {
    setInputValue('');
    setSelectedUser(null);
    setRole('advocate');
    setError(null);
    setShowDropdown(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const canSubmit = selectedUser || (isEmailMode && isValidEmail(inputValue.trim()));

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Invite a Member
          </DialogTitle>
          <DialogDescription>
            Search for a user by name or enter an email address to send an invitation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="recipient">Email or Name</Label>

            {selectedUser ? (
              // Show selected user chip
              <div className="flex items-center gap-2 p-2 border rounded-md bg-neutral-50">
                <Avatar className="size-8">
                  <AvatarImage src={selectedUser.avatar_url || undefined} />
                  <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-xs">
                    {getInitials(selectedUser.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium">{selectedUser.name}</span>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="p-1 hover:bg-neutral-200 rounded-full transition-colors"
                  disabled={sendInvitation.isPending}
                >
                  <X className="size-4 text-neutral-500" />
                </button>
              </div>
            ) : (
              // Show input with dropdown
              <div className="relative">
                <Input
                  ref={inputRef}
                  id="recipient"
                  type="text"
                  placeholder="Type a name or email address..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onFocus={() => {
                    if (isSearchMode && searchResults?.length) {
                      setShowDropdown(true);
                    }
                  }}
                  disabled={sendInvitation.isPending}
                  autoFocus
                  autoComplete="off"
                />

                {/* Search results dropdown */}
                {showDropdown && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto"
                  >
                    {isSearching ? (
                      <div className="flex items-center justify-center gap-2 p-4 text-sm text-neutral-500">
                        <Loader2 className="size-4 animate-spin" />
                        Searching...
                      </div>
                    ) : searchResults && searchResults.length > 0 ? (
                      <ul className="py-1">
                        {searchResults.map((user) => (
                          <li key={user.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectUser(user)}
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-neutral-100 transition-colors text-left"
                            >
                              <Avatar className="size-8">
                                <AvatarImage src={user.avatar_url || undefined} />
                                <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-xs">
                                  {getInitials(user.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{user.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-4 text-sm text-neutral-500 text-center">
                        <User className="size-8 mx-auto mb-2 text-neutral-300" />
                        <p>No users found</p>
                        <p className="text-xs mt-1">Try entering an email address instead</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Helper text */}
            {!selectedUser && inputValue.length > 0 && inputValue.length < 3 && !isEmailMode && (
              <p className="text-xs text-neutral-500">
                Type at least 3 characters to search for users
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as typeof role)}
              disabled={sendInvitation.isPending}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getInvitableRoles().map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={sendInvitation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || sendInvitation.isPending}>
              {sendInvitation.isPending ? (
                'Sending...'
              ) : (
                <>
                  <Send className="size-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
