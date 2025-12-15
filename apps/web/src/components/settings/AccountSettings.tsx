/**
 * Account settings section.
 */

import { AlertTriangle, Download, LogOut } from 'lucide-react';
import { useState } from 'react';

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
import { useProfile } from '@/lib/hooks/useSettings';

export default function AccountSettings() {
  const { data: profile } = useProfile();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const handleExportData = () => {
    // TODO: Implement data export
    alert('Data export will be implemented in a future update.');
  };

  const handleDeleteAccount = () => {
    // TODO: Implement account deletion
    alert('Account deletion will be implemented in a future update.');
    setShowDeleteDialog(false);
    setDeleteConfirmation('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Account</h2>
        <p className="text-sm text-gray-500">
          Manage your account security and data
        </p>
      </div>

      {/* Connected Accounts */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">
          Connected Accounts
        </h3>
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
        <p className="mt-3 text-sm text-gray-500">
          Primary sign-in method - Cannot be disconnected
        </p>
      </div>

      {/* Active Sessions - Placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">
          Active Sessions
        </h3>
        <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-gray-100 rounded-full flex items-center justify-center">
              <LogOut className="size-5 text-gray-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Current Session</p>
              <p className="text-sm text-gray-500">This browser</p>
            </div>
          </div>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
            Active
          </span>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          Session management will be available in a future update.
        </p>
      </div>

      {/* Export Data */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Export Your Data
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Download a copy of your data including legacies, stories, media, and
          account information.
        </p>
        <Button variant="outline" onClick={handleExportData}>
          <Download className="size-4 mr-2" />
          Request Data Export
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 rounded-lg border border-red-200 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Delete Account</h3>
            <p className="text-sm text-red-600 mt-1">
              Permanently delete your account and all data. This action cannot be
              undone.
            </p>
            <Button
              variant="destructive"
              className="mt-4"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Account
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              account and remove all your data from our servers, including:
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
              disabled={deleteConfirmation !== 'DELETE'}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
