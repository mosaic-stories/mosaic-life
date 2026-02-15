/**
 * Account settings section.
 */

import { AlertTriangle, Download, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCreateAccountDeletionToken,
  useDeleteAccount,
  useProfile,
  useRequestDataExport,
  useRevokeSession,
  useSessions,
} from '@/lib/hooks/useSettings';

function relativeTime(value: string): string {
  const now = Date.now();
  const then = new Date(value).getTime();
  const delta = Math.max(0, now - then);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AccountSettings() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: sessionData } = useSessions();
  const revokeSession = useRevokeSession();
  const requestExport = useRequestDataExport();
  const createDeletionToken = useCreateAccountDeletionToken();
  const deleteAccount = useDeleteAccount();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sessions = sessionData?.sessions ?? [];
  const otherSessions = sessions.filter((session) => !session.is_current);

  const handleExportData = async () => {
    setError(null);
    try {
      await requestExport.mutateAsync();
    } catch {
      setError('Failed to request data export. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    setError(null);
    try {
      const token = await createDeletionToken.mutateAsync();
      await deleteAccount.mutateAsync({
        confirmation_text: deleteConfirmation,
        confirmation_token: token.token,
      });
      setShowDeleteDialog(false);
      setDeleteConfirmation('');
      navigate('/');
    } catch {
      setError('Failed to delete account. Please try again.');
    }
  };

  const handleRevokeSession = async (id: string) => {
    setError(null);
    try {
      await revokeSession.mutateAsync(id);
    } catch {
      setError('Failed to revoke session. Please try again.');
    }
  };

  const handleRevokeAllOthers = async () => {
    setError(null);
    try {
      await Promise.all(otherSessions.map((session) => revokeSession.mutateAsync(session.id)));
    } catch {
      setError('Failed to revoke sessions. Please try again.');
    }
  };

  const exporting = requestExport.isPending;
  const deleting = createDeletionToken.isPending || deleteAccount.isPending;
  const revoking = revokeSession.isPending;
  const exportResult = requestExport.data;

  const deleteDialogClose = (open: boolean) => {
    setShowDeleteDialog(open);
    if (!open) {
      setDeleteConfirmation('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Account</h2>
        <p className="text-sm text-gray-500">Manage your account security and data</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Connected Accounts</h3>
        <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="size-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Google</p>
              <p className="text-sm text-gray-500">{profile?.email}</p>
            </div>
          </div>
          <span className="text-sm text-green-600 font-medium">Connected</span>
        </div>
        <p className="mt-3 text-sm text-gray-500">Primary sign-in method - Cannot be disconnected</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700">Active Sessions</h3>
            <p className="text-xs text-gray-500">
              {sessions.length === 1 ? '1 active session' : `${sessions.length} active sessions`}
            </p>
          </div>
          {otherSessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevokeAllOthers}
              disabled={revoking}
            >
              {revoking ? 'Revoking sessions...' : 'Sign out all other sessions'}
            </Button>
          )}
        </div>

        {sessions.length === 0 && (
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-gray-100 rounded-full flex items-center justify-center">
                <LogOut className="size-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Current browser session</p>
                <p className="text-sm text-gray-500">This browser</p>
              </div>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Active</span>
          </div>
        )}

        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <LogOut className="size-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {session.device_info || (session.is_current ? 'Current browser session' : 'Browser session')}
                  </p>
                  <p className="text-sm text-gray-500">{session.location || 'Unknown location'}</p>
                  <p className="text-sm text-gray-500">
                    {session.is_current
                      ? 'Current'
                      : `Last active ${relativeTime(session.last_active_at)}`}
                  </p>
                </div>
              </div>

              {session.is_current ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Current</span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevokeSession(session.id)}
                  disabled={revoking}
                >
                  Sign out
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Export Your Data</h3>
        <p className="text-sm text-gray-500 mb-4">
          Download a copy of your data including legacies, stories, media, and account information.
        </p>
        <Button variant="outline" onClick={handleExportData} disabled={exporting}>
          <Download className="size-4 mr-2" />
          {exporting ? 'Requesting export...' : 'Request Data Export'}
        </Button>

        {exportResult && (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            <p>Export requested successfully. A download link has been emailed to you.</p>
            <a
              className="underline"
              href={exportResult.download_url}
              target="_blank"
              rel="noreferrer"
            >
              Open export link now
            </a>
            <p className="mt-1 text-xs">
              Expires: {new Date(exportResult.expires_at).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      <div className="bg-red-50 rounded-lg border border-red-200 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Delete Account</h3>
            <p className="text-sm text-red-600 mt-1">
              Permanently delete your account and all data. This action cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="mt-4"
              disabled={deleting}
              onClick={() => setShowDeleteDialog(true)}
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={deleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers, including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All legacies you've created</li>
                <li>All stories and media</li>
                <li>Your profile and preferences</li>
                <li>All AI chat history</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <p className="text-sm text-gray-600 mb-2">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmation('')}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteConfirmation !== 'DELETE' || deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
