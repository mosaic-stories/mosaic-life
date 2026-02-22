import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Clock, User, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useInvitationPreview, useAcceptInvitation } from '@/features/members/hooks/useInvitations';
import { useAuth } from '@/contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator',
  admin: 'Admin',
  advocate: 'Advocate',
  admirer: 'Admirer',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  creator: 'Full control including deleting the legacy',
  admin: 'Manage members and all content',
  advocate: 'Contribute stories and media',
  admirer: 'View stories and media',
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, login } = useAuth();

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
  } = useInvitationPreview(token || '');

  const acceptInvitation = useAcceptInvitation();

  const handleAccept = async () => {
    if (!token) return;

    try {
      const result = await acceptInvitation.mutateAsync(token);
      navigate(`/legacy/${result.legacy_id}`);
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleDecline = () => {
    navigate('/');
  };

  const handleLogin = () => {
    // Store the current URL to redirect back after login
    sessionStorage.setItem('auth_return_url', window.location.pathname);
    login();
  };

  if (authLoading || previewLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading invitation...</div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-center">
              Please sign in to accept this invitation.
            </p>
            <Button onClick={handleLogin} className="w-full">
              Sign In with Google
            </Button>
            <Button variant="outline" onClick={() => navigate('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (previewError) {
    const errorMessage = previewError instanceof Error
      ? previewError.message
      : 'This invitation is no longer valid.';

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Invitation Invalid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
            <Button onClick={() => navigate('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            {preview.legacy_profile_image_url ? (
              <Avatar className="size-24">
                <AvatarImage src={preview.legacy_profile_image_url} />
                <AvatarFallback className="text-2xl">
                  {preview.legacy_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="size-12 text-primary" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl">{preview.legacy_name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {preview.legacy_biography && (
            <p className="text-muted-foreground text-center line-clamp-3">
              {preview.legacy_biography}
            </p>
          )}

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            {preview.inviter_name && (
              <div className="flex items-center gap-2 text-sm">
                <User className="size-4 text-muted-foreground" />
                <span>
                  <strong>{preview.inviter_name}</strong> invited you
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-muted-foreground" />
              <span>
                You'll join as{' '}
                <Badge variant="secondary">{ROLE_LABELS[preview.role]}</Badge>
              </span>
            </div>

            <div className="text-xs text-muted-foreground">
              {ROLE_DESCRIPTIONS[preview.role]}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3" />
              <span>
                Expires {new Date(preview.expires_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {acceptInvitation.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {acceptInvitation.error instanceof Error
                  ? acceptInvitation.error.message
                  : 'Failed to accept invitation.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={acceptInvitation.isPending}
              className="flex-1"
            >
              <X className="size-4 mr-2" />
              Decline
            </Button>
            <Button
              onClick={handleAccept}
              disabled={acceptInvitation.isPending}
              className="flex-1"
            >
              {acceptInvitation.isPending ? (
                'Joining...'
              ) : (
                <>
                  <Check className="size-4 mr-2" />
                  Accept & Join
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
