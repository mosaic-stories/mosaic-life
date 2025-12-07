import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ErrorPage from './ErrorPage';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouteError: () => null,
  };
});

describe('ErrorPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the error page with default message', () => {
    render(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Oops!')).toBeInTheDocument();
    expect(screen.getByText(/We encountered an unexpected error/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go to Homepage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go Back/i })).toBeInTheDocument();
  });

  it('displays custom error message when error prop is provided', () => {
    const testError = new Error('Test error message');
    
    render(
      <MemoryRouter>
        <ErrorPage error={testError} />
      </MemoryRouter>
    );

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('navigates to home when "Go to Homepage" is clicked', async () => {
    render(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Go to Homepage/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('navigates back when "Go Back" is clicked', async () => {
    render(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Go Back/i }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('calls resetError when "Try Again" is clicked', async () => {
    const mockResetError = vi.fn();
    
    render(
      <MemoryRouter>
        <ErrorPage resetError={mockResetError} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(mockResetError).toHaveBeenCalled();
  });

  it('displays the Mosaic Life branding', () => {
    render(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Mosaic Life')).toBeInTheDocument();
  });

  it('shows contact support link', () => {
    render(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Contact Support')).toBeInTheDocument();
    expect(screen.getByText('Contact Support').closest('a')).toHaveAttribute('href', 'mailto:support@mosaiclife.com');
  });
});
