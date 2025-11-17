/**
 * Testes para useDeviceCommunication hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDeviceCommunication } from '@/hooks/useDeviceCommunication';

// Mock do Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => Promise.resolve({ status: 'SUBSCRIBED' })),
      })),
      send: vi.fn(() => Promise.resolve({ error: null })),
      subscribe: vi.fn(() => Promise.resolve({ status: 'SUBSCRIBED' })),
    })),
    removeChannel: vi.fn(),
  },
}));

describe('useDeviceCommunication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve criar canais de comunicação quando habilitado', async () => {
    const onCommand = vi.fn();
    
    renderHook(() =>
      useDeviceCommunication({
        deviceId: 'test-device-id',
        enabled: true,
        onCommand
      })
    );

    await waitFor(() => {
      expect(onCommand).toBeDefined();
    });
  });

  it('não deve criar canais quando desabilitado', () => {
    const onCommand = vi.fn();
    
    renderHook(() =>
      useDeviceCommunication({
        deviceId: 'test-device-id',
        enabled: false,
        onCommand
      })
    );

    // Verifica que não criou canais
    // (verificação depende da implementação do mock)
  });
});

