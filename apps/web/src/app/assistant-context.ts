import { createContext, useContext } from 'react';

export interface AssistantContextValue {
  open: boolean;
  toggle: () => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

/** Null outside the shell (tests, auth pages), where there is no assistant to open. */
export function useAssistant(): AssistantContextValue | null {
  return useContext(AssistantContext);
}
