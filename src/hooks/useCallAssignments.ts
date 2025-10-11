import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface CallAssignment {
  id: string;
  number: string;
  status: string;
  device_id: string;
  start_time: string;
}

interface UseCallAssignmentsOptions {
  deviceId: string | null;
  enabled: boolean;
  onNewCall: (number: string, callId: string) => void;
}

/**
 * Hook to listen for call assignments from dashboard
 * Automatically processes calls assigned to this device
 */
export const useCallAssignments = ({ 
  deviceId, 
  enabled,
  onNewCall 
}: UseCallAssignmentsOptions) => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const processedCallsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!deviceId || !enabled) {
      console.log('Call assignments listener disabled:', { deviceId, enabled });
      return;
    }

    console.log('Setting up call assignments listener for device:', deviceId);

    // Subscribe to INSERT events for calls table filtered by device_id
    channelRef.current = supabase
      .channel(`call-assignments-${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `device_id=eq.${deviceId}`
        },
        (payload) => {
          const newCall = payload.new as CallAssignment;
          
          // Avoid processing the same call twice
          if (processedCallsRef.current.has(newCall.id)) {
            console.log('Call already processed:', newCall.id);
            return;
          }

          console.log('New call assigned from dashboard:', {
            id: newCall.id,
            number: newCall.number,
            status: newCall.status
          });

          // Only process calls in 'ringing' status
          if (newCall.status === 'ringing') {
            processedCallsRef.current.add(newCall.id);
            onNewCall(newCall.number, newCall.id);
          }
        }
      )
      .subscribe((status) => {
        console.log('Call assignments subscription status:', status);
      });

    return () => {
      console.log('Cleaning up call assignments listener');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [deviceId, enabled, onNewCall]);

  return {
    clearProcessedCalls: () => {
      processedCallsRef.current.clear();
    }
  };
};
