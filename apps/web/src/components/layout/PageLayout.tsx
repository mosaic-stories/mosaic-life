import { ReactNode } from 'react';
import './PageLayout.css';

interface PageLayoutProps {
  children: ReactNode;
  maxWidth?: 'narrow' | 'medium' | 'wide' | 'full';
  className?: string;
}

export function PageLayout({ children, maxWidth = 'medium', className = '' }: PageLayoutProps) {
  return (
    <div className={`page-layout page-layout-${maxWidth} ${className}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <main id="main-content" className="page-main">
        {children}
      </main>
    </div>
  );
}

interface ReadingLayoutProps {
  children: ReactNode;
  className?: string;
}

export function ReadingLayout({ children, className = '' }: ReadingLayoutProps) {
  return (
    <PageLayout maxWidth="narrow" className={className}>
      <article className="reading-container">
        <div className="reading-text">{children}</div>
      </article>
    </PageLayout>
  );
}
