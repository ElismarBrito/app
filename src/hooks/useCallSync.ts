import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// Hook for syncing real-time call data from mobile devices
export const useCallSync = (addCall: any, updateCallStatus: any) => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Listen for call events from mobile devices via realtime channel
    const callEventsChannel = supabase
      .channel('call-events')
      .on('presence', { event: 'sync' }, () => {
        console.log('Call sync established');
      })
      .on('broadcast', { event: 'call-started' }, (payload) => {
        console.log('Call started from device:', payload);
        if (payload.userId === user.id) {
          addCall(payload.number, payload.deviceId);
        }
      })
      .on('broadcast', { event: 'call-answered' }, (payload) => {
        console.log('Call answered:', payload);
        if (payload.userId === user.id) {
          updateCallStatus(payload.callId, 'answered');
        }
      })
      .on('broadcast', { event: 'call-ended' }, (payload) => {
        console.log('Call ended:', payload);
        if (payload.userId === user.id) {
          updateCallStatus(payload.callId, 'ended', payload.duration);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(callEventsChannel);
    };
  }, [user, addCall, updateCallStatus]);

  // Function to send call commands to specific devices
  const sendCallCommand = async (deviceId: string, command: string, data: any) => {
    const channel = supabase.channel('device-commands');
    
    await channel.send({
      type: 'broadcast',
      event: 'call-command',
      payload: {
        deviceId,
        command,
        data,
        timestamp: Date.now()
      }
    });
    
    console.log(`Call command sent to device ${deviceId}:`, command, data);
  };

  return {
    sendCallCommand
  };
};