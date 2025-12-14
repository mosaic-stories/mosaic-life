import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderProvider, useHeaderContext } from './HeaderContext';

function TestConsumer() {
  const { slotContent } = useHeaderContext();
  return <div data-testid="slot-content">{slotContent}</div>;
}

describe('HeaderContext', () => {
  it('provides default empty slot content', () => {
    render(
      <HeaderProvider>
        <TestConsumer />
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-content')).toBeEmptyDOMElement();
  });

  it('throws error when used outside provider', () => {
    const consoleError = console.error;
    console.error = () => {};

    expect(() => render(<TestConsumer />)).toThrow(
      'useHeaderContext must be used within HeaderProvider'
    );

    console.error = consoleError;
  });
});
