/**
 * Mock do Supabase para testes
 */

import { vi } from 'vitest';

export const createMockSupabaseClient = () => {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => Promise.resolve({})),
      })),
      send: vi.fn(() => Promise.resolve({ error: null })),
      subscribe: vi.fn(() => Promise.resolve({})),
    })),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })),
    },
  };
};

export const mockSupabase = createMockSupabaseClient();

