import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import RootLayout from './RootLayout';
import ProtectedRoute from './ProtectedRoute';
import { withSharedProps, withLegacyProps, withStoryProps } from './PageWrapper';

// Lazy load page components for code splitting
const HomepageBase = lazy(() => import('@/components/Homepage'));
const HomePageMinimalBase = lazy(() => import('@/components/HomePageMinimal'));
const AboutBase = lazy(() => import('@/components/About'));
const AboutMinimalBase = lazy(() => import('@/components/AboutMinimal'));
const HowItWorksBase = lazy(() => import('@/components/HowItWorks'));
const HowItWorksMinimalBase = lazy(() => import('@/components/HowItWorksMinimal'));
const ExploreMinimalBase = lazy(() => import('@/components/ExploreMinimal'));
const CommunityBase = lazy(() => import('@/components/Community'));
const CommunityMinimalBase = lazy(() => import('@/components/CommunityMinimal'));
const LegacyProfileBase = lazy(() => import('@/components/LegacyProfile'));
const LegacyProfileMinimalBase = lazy(() => import('@/components/LegacyProfileMinimal'));
const MyLegaciesBase = lazy(() => import('@/components/MyLegacies'));
const MyLegaciesMinimalBase = lazy(() => import('@/components/MyLegaciesMinimal'));
const StoryCreationBase = lazy(() => import('@/components/StoryCreation'));
const StoryCreationMinimalBase = lazy(() => import('@/components/StoryCreationMinimal'));
const LegacyCreationBase = lazy(() => import('@/components/LegacyCreation'));
const LegacyEditBase = lazy(() => import('@/components/LegacyEdit'));
const MediaGalleryBase = lazy(() => import('@/components/MediaGallery'));
const AIAgentChatBase = lazy(() => import('@/components/AIAgentChat'));
const AIAgentChatMinimalBase = lazy(() => import('@/components/AIAgentChatMinimal'));
const InviteAcceptPageBase = lazy(() => import('@/components/InviteAcceptPage'));
const NotificationHistoryBase = lazy(() => import('@/components/NotificationHistory'));

// Wrapped components with shared props
const Homepage = withSharedProps(HomepageBase);
const HomePageMinimal = withSharedProps(HomePageMinimalBase);
const About = withSharedProps(AboutBase);
const AboutMinimal = withSharedProps(AboutMinimalBase);
const HowItWorks = withSharedProps(HowItWorksBase);
const HowItWorksMinimal = withSharedProps(HowItWorksMinimalBase);
const ExploreMinimal = withSharedProps(ExploreMinimalBase);
const Community = withSharedProps(CommunityBase);
const CommunityMinimal = withSharedProps(CommunityMinimalBase);
const MyLegacies = withSharedProps(MyLegaciesBase);
const MyLegaciesMinimal = withSharedProps(MyLegaciesMinimalBase);
const LegacyCreation = withSharedProps(LegacyCreationBase);
const LegacyEdit = withLegacyProps(LegacyEditBase);
const NotificationHistory = withSharedProps(NotificationHistoryBase);

// Components that need legacyId from URL
const LegacyProfile = withLegacyProps(LegacyProfileBase);
const LegacyProfileMinimal = withLegacyProps(LegacyProfileMinimalBase);
const MediaGallery = withLegacyProps(MediaGalleryBase);
const AIAgentChat = withLegacyProps(AIAgentChatBase);
const AIAgentChatMinimal = withLegacyProps(AIAgentChatMinimalBase);

// Components that need legacyId and optionally storyId
const StoryCreation = withStoryProps(StoryCreationBase);
const StoryCreationMinimal = withStoryProps(StoryCreationMinimalBase);

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--theme-background))]">
      <div className="animate-pulse text-[rgb(var(--theme-primary))]">Loading...</div>
    </div>
  );
}

// Wrapper for lazy loaded components
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // Public routes
      {
        index: true,
        element: <LazyPage><Homepage /></LazyPage>,
      },
      {
        path: 'minimal',
        element: <LazyPage><HomePageMinimal /></LazyPage>,
      },
      {
        path: 'about',
        element: <LazyPage><About /></LazyPage>,
      },
      {
        path: 'about/minimal',
        element: <LazyPage><AboutMinimal /></LazyPage>,
      },
      {
        path: 'how-it-works',
        element: <LazyPage><HowItWorks /></LazyPage>,
      },
      {
        path: 'how-it-works/minimal',
        element: <LazyPage><HowItWorksMinimal /></LazyPage>,
      },
      {
        path: 'explore',
        element: <LazyPage><ExploreMinimal /></LazyPage>,
      },
      {
        path: 'community',
        element: <LazyPage><Community /></LazyPage>,
      },
      {
        path: 'community/minimal',
        element: <LazyPage><CommunityMinimal /></LazyPage>,
      },
      // Public legacy view
      {
        path: 'legacy/:legacyId',
        element: <LazyPage><LegacyProfile /></LazyPage>,
      },
      {
        path: 'legacy/:legacyId/minimal',
        element: <LazyPage><LegacyProfileMinimal /></LazyPage>,
      },
      // Invitation accept page (requires auth but not protected route)
      {
        path: 'invite/:token',
        element: <LazyPage><InviteAcceptPageBase /></LazyPage>,
      },

      // Protected routes
      {
        path: 'my-legacies',
        element: (
          <ProtectedRoute>
            <LazyPage><MyLegacies /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'my-legacies/minimal',
        element: (
          <ProtectedRoute>
            <LazyPage><MyLegaciesMinimal /></LazyPage>
          </ProtectedRoute>
        ),
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
            <LazyPage><LegacyEdit /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/story/new',
        element: (
          <ProtectedRoute>
            <LazyPage><StoryCreation /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/story/new/minimal',
        element: (
          <ProtectedRoute>
            <LazyPage><StoryCreationMinimal /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/story/:storyId',
        element: (
          <ProtectedRoute>
            <LazyPage><StoryCreation /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/gallery',
        element: (
          <ProtectedRoute>
            <LazyPage><MediaGallery /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/ai-chat',
        element: (
          <ProtectedRoute>
            <LazyPage><AIAgentChat /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/ai-chat/minimal',
        element: (
          <ProtectedRoute>
            <LazyPage><AIAgentChatMinimal /></LazyPage>
          </ProtectedRoute>
        ),
      },

      // Catch-all redirect
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
