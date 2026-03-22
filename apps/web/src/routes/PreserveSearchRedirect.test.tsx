import { describe, it, expect } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import PreserveSearchRedirect from './PreserveSearchRedirect';

function LocationCapture() {
  const location = useLocation();
  return (
    <div data-testid="target">
      {location.pathname}
      {location.search}
    </div>
  );
}

describe('PreserveSearchRedirect', () => {
  it('preserves the current query string when redirecting', () => {
    render(
      <MemoryRouter initialEntries={['/connections?tab=requests&request=req-1&focus=incoming']}>
        <Routes>
          <Route
            path="/connections"
            element={<PreserveSearchRedirect to="/my/conversations" />}
          />
          <Route
            path="/my/conversations"
            element={<LocationCapture />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('target')).toHaveTextContent(
      '/my/conversations?tab=requests&request=req-1&focus=incoming'
    );
  });
});
