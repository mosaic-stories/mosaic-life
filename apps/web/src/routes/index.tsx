import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import RootLayout from './RootLayout';
import ProtectedRoute from './ProtectedRoute';
import ErrorPage from '@/components/ErrorPage';
import { useAuth } from '@/contexts/AuthContext';

// Lazy load page components for code splitting
const PublicHomePage = lazy(() => import('@/pages/PublicHomePage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LegaciesPage = lazy(() => import('@/pages/LegaciesPage'));
const StoriesPage = lazy(() => import('@/pages/StoriesPage'));
const ConversationsPage = lazy(() => import('@/pages/ConversationsPage'));
const About = lazy(() => import('@/pages/About'));
const HowItWorks = lazy(() => import('@/pages/HowItWorks'));
const Community = lazy(() => import('@/features/community/components/Community'));
const LegacyProfile = lazy(() => import('@/features/legacy/components/LegacyProfile'));
const MyLegacies = lazy(() => import('@/components/MyLegacies'));
const StoryCreation = lazy(() => import('@/features/story/components/StoryCreation'));
const LegacyCreation = lazy(() => import('@/features/legacy/components/LegacyCreation'));
const LegacyEdit = lazy(() => import('@/features/legacy/components/LegacyEdit'));
const MediaGallery = lazy(() => import('@/features/media/components/MediaGallery'));
const InviteAcceptPage = lazy(() => import('@/features/members/components/InviteAcceptPage'));
const NotificationHistory = lazy(() => import('@/features/notifications/components/NotificationHistory'));
const StoryEvolution = lazy(() => import('@/features/evolve-workspace/EvolveWorkspace'));

// Settings components
const SettingsLayout = lazy(() => import('@/features/settings/components/SettingsLayout'));
const ProfileSettings = lazy(() => import('@/features/settings/components/ProfileSettings'));
const AppearanceSettings = lazy(() => import('@/features/settings/components/AppearanceSettings'));
const AIPreferencesSettings = lazy(() => import('@/features/settings/components/AIPreferencesSettings'));
const UsageStats = lazy(() => import('@/features/settings/components/UsageStats'));
const AccountSettings = lazy(() => import('@/features/settings/components/AccountSettings'));

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-background">
      <div className="animate-pulse text-theme-primary">Loading...</div>
    </div>
  );
}

// Wrapper for lazy loaded components
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

// Auth-aware homepage wrapper
// DashboardPage and PublicHomePage are React.lazy components.
// The parent <LazyPage> provides the required <Suspense> boundary.
function AuthAwareHome() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  // If auth check fails, user is null — falls through to PublicHomePage as safe fallback
  return user ? <DashboardPage /> : <PublicHomePage />;
}

// Route param extractors — pass URL params as props to page components
function WithLegacyId({ Component }: { Component: React.ComponentType<{ legacyId: string }> }) {
  const { legacyId } = useParams<{ legacyId: string }>();
  return <Component legacyId={legacyId || ''} />;
}

function WithStoryProps({ Component }: { Component: React.ComponentType<{ legacyId: string; storyId?: string }> }) {
  const { legacyId, storyId } = useParams<{ legacyId: string; storyId?: string }>();
  return <Component legacyId={legacyId || ''} storyId={storyId} />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      // Public routes
      {
        index: true,
        element: <LazyPage><AuthAwareHome /></LazyPage>,
      },
      {
        path: 'about',
        element: <LazyPage><About /></LazyPage>,
      },
      {
        path: 'how-it-works',
        element: <LazyPage><HowItWorks /></LazyPage>,
      },
      {
        path: 'community',
        element: <LazyPage><Community /></LazyPage>,
      },
      // Authenticated navigation pages
      {
        path: 'legacies',
        element: (
          <ProtectedRoute>
            <LazyPage><LegaciesPage /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'stories',
        element: (
          <ProtectedRoute>
            <LazyPage><StoriesPage /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'conversations',
        element: (
          <ProtectedRoute>
            <LazyPage><ConversationsPage /></LazyPage>
          </ProtectedRoute>
        ),
      },
      // Public legacy view
      {
        path: 'legacy/:legacyId',
        element: <LazyPage><WithLegacyId Component={LegacyProfile} /></LazyPage>,
      },
      // Invitation accept page (requires auth but not protected route)
      {
        path: 'invite/:token',
        element: <LazyPage><InviteAcceptPage /></LazyPage>,
      },

      // Protected routes
      {
        path: 'my-legacies',
        element: <Navigate to="/legacies" replace />,
      },
      {
        path: 'legacy/new',
        element: (
          <ProtectedRoute>
            <LazyPage><LegacyCreation /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'notifications',
        element: (
          <ProtectedRoute>
            <LazyPage><NotificationHistory /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/edit',
        element: (
          <ProtectedRoute>
            <LazyPage><WithLegacyId Component={LegacyEdit} /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/story/:storyId',
        element: (
          <ProtectedRoute>
            <LazyPage><WithStoryProps Component={StoryCreation} /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/story/:storyId/evolve',
        element: (
          <ProtectedRoute>
            <LazyPage><WithStoryProps Component={StoryEvolution} /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/gallery',
        element: (
          <ProtectedRoute>
            <LazyPage><WithLegacyId Component={MediaGallery} /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute>
            <LazyPage>
              <SettingsLayout />
            </LazyPage>
          </ProtectedRoute>
        ),
        children: [
          {
            index: true,
            element: <Navigate to="profile" replace />,
          },
          {
            path: 'profile',
            element: <LazyPage><ProfileSettings /></LazyPage>,
          },
          {
            path: 'appearance',
            element: <LazyPage><AppearanceSettings /></LazyPage>,
          },
          {
            path: 'ai',
            element: <LazyPage><AIPreferencesSettings /></LazyPage>,
          },
          {
            path: 'usage',
            element: <LazyPage><UsageStats /></LazyPage>,
          },
          {
            path: 'account',
            element: <LazyPage><AccountSettings /></LazyPage>,
          },
        ],
      },

      // Catch-all redirect
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
