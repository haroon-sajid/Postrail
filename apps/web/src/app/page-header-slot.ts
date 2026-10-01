import { createContext, useContext } from 'react';

/**
 * Where the shell wants the page header drawn: a fixed strip above the scrolling part of
 * the panel. Null outside the shell (tests), where the header renders in place instead.
 */
export const PageHeaderSlotContext = createContext<HTMLElement | null>(null);

export function usePageHeaderSlot(): HTMLElement | null {
  return useContext(PageHeaderSlotContext);
}
