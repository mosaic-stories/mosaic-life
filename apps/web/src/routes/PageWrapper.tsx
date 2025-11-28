import { useOutletContext, useParams } from 'react-router-dom';
import { SharedPageProps } from './RootLayout';

// Hook to get shared props from RootLayout
export function useSharedProps(): SharedPageProps {
  return useOutletContext<SharedPageProps>();
}

// HOC to inject shared props into page components
export function withSharedProps<P extends object>(
  Component: React.ComponentType<P & SharedPageProps>
): React.FC<Omit<P, keyof SharedPageProps>> {
  return function WrappedComponent(props: Omit<P, keyof SharedPageProps>) {
    const sharedProps = useSharedProps();
    return <Component {...(props as P)} {...sharedProps} />;
  };
}

// Wrapper for legacy-related pages that need legacyId from URL params
export function withLegacyProps<P extends object>(
  Component: React.ComponentType<P & SharedPageProps & { legacyId: string }>
): React.FC<Omit<P, keyof SharedPageProps | 'legacyId'>> {
  return function WrappedComponent(props: Omit<P, keyof SharedPageProps | 'legacyId'>) {
    const sharedProps = useSharedProps();
    const { legacyId } = useParams<{ legacyId: string }>();
    return <Component {...(props as P)} {...sharedProps} legacyId={legacyId || '1'} />;
  };
}

// Wrapper for story pages that need both legacyId and storyId
export function withStoryProps<P extends object>(
  Component: React.ComponentType<P & SharedPageProps & { legacyId: string; storyId?: string }>
): React.FC<Omit<P, keyof SharedPageProps | 'legacyId' | 'storyId'>> {
  return function WrappedComponent(props: Omit<P, keyof SharedPageProps | 'legacyId' | 'storyId'>) {
    const sharedProps = useSharedProps();
    const { legacyId, storyId } = useParams<{ legacyId: string; storyId?: string }>();
    return <Component {...(props as P)} {...sharedProps} legacyId={legacyId || '1'} storyId={storyId} />;
  };
}
