import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderProvider, useHeaderContext, HeaderSlot } from './HeaderContext';

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

describe('HeaderSlot', () => {
  it('updates slot content when rendered', () => {
    function SlotReader() {
      const { slotContent } = useHeaderContext();
      return <div data-testid="slot-reader">{slotContent}</div>;
    }

    render(
      <HeaderProvider>
        <SlotReader />
        <HeaderSlot>
          <button>Test Button</button>
        </HeaderSlot>
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-reader')).toHaveTextContent('Test Button');
  });

  it('clears slot content on unmount', () => {
    function SlotReader() {
      const { slotContent } = useHeaderContext();
      return <div data-testid="slot-reader">{slotContent}</div>;
    }

    const { rerender } = render(
      <HeaderProvider>
        <SlotReader />
        <HeaderSlot>
          <button>Test Button</button>
        </HeaderSlot>
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-reader')).toHaveTextContent('Test Button');

    rerender(
      <HeaderProvider>
        <SlotReader />
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-reader')).toBeEmptyDOMElement();
  });
});
