import { createContext, useContext, useState, ReactNode } from 'react';

interface HeaderContextValue {
  slotContent: ReactNode;
  setSlotContent: (content: ReactNode) => void;
}

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function useHeaderContext(): HeaderContextValue {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeaderContext must be used within HeaderProvider');
  }
  return context;
}

interface HeaderProviderProps {
  children: ReactNode;
}

export function HeaderProvider({ children }: HeaderProviderProps) {
  const [slotContent, setSlotContent] = useState<ReactNode>(null);

  return (
    <HeaderContext.Provider value={{ slotContent, setSlotContent }}>
      {children}
    </HeaderContext.Provider>
  );
}
