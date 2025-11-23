/**
 * Testes para hooks existentes
 * 
 * Testa hooks que estão disponíveis nesta branch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePBXData } from '@/hooks/usePBXData';

// Mock do Supabase - subscribe retorna objeto com unsubscribe (não Promise)
const createMockChannel = () => {
  const mockSubscription = {
    unsubscribe: vi.fn(() => Promise.resolve()),
  };
  
  const mockChannel = {
    on: vi.fn(() => mockChannel),
    send: vi.fn(() => Promise.resolve({ error: null })),
    state: 'joined' as const,
    subscribe: vi.fn(() => mockSubscription), // Retorna objeto diretamente, não Promise
  };
  
  return mockChannel;
};

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      channel: vi.fn(() => createMockChannel()),
      removeChannel: vi.fn(),
    },
  };
});

// Mock do useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' },
    signOut: vi.fn(),
  }),
}));

// Mock do useToast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('usePBXData Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve inicializar com estados padrão', async () => {
    const { result } = renderHook(() => usePBXData());

    // Aguarda hook inicializar
    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    expect(result.current.devices).toEqual([]);
    expect(result.current.calls).toEqual([]);
    expect(result.current.lists).toEqual([]);
  });

  it('deve ter funções de gerenciamento disponíveis', async () => {
    const { result } = renderHook(() => usePBXData());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    expect(typeof result.current.addDevice).toBe('function');
    expect(typeof result.current.updateDeviceStatus).toBe('function');
    expect(typeof result.current.removeDevice).toBe('function');
    expect(typeof result.current.addCall).toBe('function');
    expect(typeof result.current.updateCallStatus).toBe('function');
  });
});
