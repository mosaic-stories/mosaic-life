import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhaseIndicator } from './PhaseIndicator';

describe('PhaseIndicator', () => {
  it('renders all 5 workflow phases', () => {
    render(<PhaseIndicator currentPhase="elicitation" />);
    // 'Chat' appears in both mobile and desktop views for the current phase
    expect(screen.getAllByText('Chat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Style')).toBeInTheDocument();
    expect(screen.getByText('Drafting')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('calls onPhaseClick when a completed step is clicked', async () => {
    const user = userEvent.setup();
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="review" onPhaseClick={onPhaseClick} />
    );

    // Chat, Summary, Style are completed steps — click Summary
    await user.click(screen.getByRole('button', { name: /summary/i }));
    expect(onPhaseClick).toHaveBeenCalledWith('summary');
  });

  it('does not make the current step clickable', async () => {
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="summary" onPhaseClick={onPhaseClick} />
    );

    // Summary is the current step — should not be a button
    expect(screen.queryByRole('button', { name: /summary/i })).not.toBeInTheDocument();
  });

  it('does not make future steps clickable', async () => {
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="summary" onPhaseClick={onPhaseClick} />
    );

    // Style is a future step — should not be a button
    expect(screen.queryByRole('button', { name: /style/i })).not.toBeInTheDocument();
  });

  it('does not make the drafting step clickable even when completed', async () => {
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="review" onPhaseClick={onPhaseClick} />
    );

    // Drafting is completed but should NOT be clickable (transient phase)
    expect(screen.queryByRole('button', { name: /drafting/i })).not.toBeInTheDocument();
  });

  it('does not render buttons when onPhaseClick is not provided', () => {
    render(<PhaseIndicator currentPhase="review" />);

    // No buttons should exist when no click handler
    expect(screen.queryByRole('button', { name: /chat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /summary/i })).not.toBeInTheDocument();
  });

  it('makes all completed non-drafting steps clickable', async () => {
    const user = userEvent.setup();
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="review" onPhaseClick={onPhaseClick} />
    );

    // Chat, Summary, Style should all be clickable
    await user.click(screen.getByRole('button', { name: /chat/i }));
    expect(onPhaseClick).toHaveBeenCalledWith('elicitation');

    await user.click(screen.getByRole('button', { name: /style/i }));
    expect(onPhaseClick).toHaveBeenCalledWith('style_selection');
  });
});
