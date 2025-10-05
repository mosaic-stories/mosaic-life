import { useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { Input } from '../components/ui/Input';
import './SearchPage.css';

export function SearchPage() {
  const [query, setQuery] = useState('');

  return (
    <PageLayout maxWidth="wide">
      <div className="search-page">
        <div className="search-header">
          <h1>Search</h1>
          <p className="search-description">
            Find stories, people, places, and moments across all your legacies
          </p>
        </div>

        <div className="search-box">
          <Input
            fullWidth
            placeholder="Search stories, people, places, moments..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
        </div>

        {query.length > 0 ? (
          <div className="search-results">
            <p className="search-results-count">Searching for "{query}"...</p>
            <div className="search-empty">
              <p>Search functionality coming soon</p>
            </div>
          </div>
        ) : (
          <div className="search-suggestions">
            <h2>Recent Searches</h2>
            <p className="search-empty-text">No recent searches</p>

            <h2 style={{ marginTop: 'var(--space-12)' }}>Quick Filters</h2>
            <div className="search-filters">
              <button className="search-filter">Stories</button>
              <button className="search-filter">People</button>
              <button className="search-filter">Places</button>
              <button className="search-filter">Dates</button>
              <button className="search-filter">Media</button>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
