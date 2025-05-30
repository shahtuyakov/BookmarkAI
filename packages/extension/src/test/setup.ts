import { beforeAll, vi } from 'vitest';
import 'jsdom';

// Mock webextension-polyfill
const mockBrowser = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
    onInstalled: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
  },
};

beforeAll(() => {
  // @ts-expect-error - Mocking global browser object
  global.browser = mockBrowser;
  // @ts-expect-error - Mocking global chrome object for compatibility
  global.chrome = mockBrowser;
}); 