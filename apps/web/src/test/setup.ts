import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// The browser stubs only apply under jsdom. src/worker.test.ts runs in the node
// environment (it needs Node's Request/Headers), where there is no window at all.
if (typeof window !== 'undefined') {
  // jsdom has no matchMedia or ResizeObserver; Radix and the theme hook expect both.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.ResizeObserver = ResizeObserverStub;
  Element.prototype.scrollIntoView = vi.fn();
}
