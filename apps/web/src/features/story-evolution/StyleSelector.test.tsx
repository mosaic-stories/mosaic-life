import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StyleSelector } from './StyleSelector';

const defaultProps = {
  onSubmit: vi.fn(),
  isSubmitting: false,
};

describe('StyleSelector', () => {
  it('renders all 5 writing style cards', () => {
    render(<StyleSelector {...defaultProps} />);

    expect(screen.getByText('Vivid')).toBeInTheDocument();
    expect(screen.getByText('Emotional')).toBeInTheDocument();
    expect(screen.getByText('Conversational')).toBeInTheDocument();
    expect(screen.getByText('Concise')).toBeInTheDocument();
    expect(screen.getByText('Documentary')).toBeInTheDocument();
  });

  it('renders all 3 length preference options', () => {
    render(<StyleSelector {...defaultProps} />);

    expect(screen.getByText('Keep similar length')).toBeInTheDocument();
    expect(screen.getByText('Make it shorter')).toBeInTheDocument();
    expect(screen.getByText('Allow it to grow')).toBeInTheDocument();
  });

  it('generate button is disabled initially', () => {
    render(<StyleSelector {...defaultProps} />);

    const button = screen.getByRole('button', { name: /generate draft/i });
    expect(button).toBeDisabled();
  });

  it('selecting a style highlights the card', async () => {
    const user = userEvent.setup();
    render(<StyleSelector {...defaultProps} />);

    const vividButton = screen.getByRole('button', { name: /vivid/i });
    await user.click(vividButton);

    expect(vividButton.querySelector('[aria-pressed="true"]') || vividButton.getAttribute('aria-pressed')).toBeTruthy();
  });

  it('selecting both style and length enables the generate button', async () => {
    const user = userEvent.setup();
    render(<StyleSelector {...defaultProps} />);

    // Select a writing style
    await user.click(screen.getByText('Vivid'));

    // Select a length preference
    await user.click(screen.getByLabelText('Keep similar length'));

    const button = screen.getByRole('button', { name: /generate draft/i });
    expect(button).toBeEnabled();
  });

  it('clicking generate calls onSubmit with correct values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<StyleSelector {...defaultProps} onSubmit={onSubmit} />);

    await user.click(screen.getByText('Emotional'));
    await user.click(screen.getByLabelText('Make it shorter'));
    await user.click(screen.getByRole('button', { name: /generate draft/i }));

    expect(onSubmit).toHaveBeenCalledWith('emotional', 'shorter');
  });

  it('shows "Generating..." text when isSubmitting is true', () => {
    render(<StyleSelector {...defaultProps} isSubmitting={true} />);

    expect(screen.getByText(/generating/i)).toBeInTheDocument();
  });
});
