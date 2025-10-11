import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PbxMobile from '@/plugins/pbx-mobile';

// Hook to sync call status changes from native to database
export const useCallStatusSync = (
  callIdMap: Map<string, string>, // Maps native callId to database callId
  startTimes: Map<string, number> // Maps native callId to start timestamp
) => {
  useEffect(() => {
    let listenerHandle: any;

    const setupListener = async () => {
      listenerHandle = await PbxMobile.addListener('callStateChanged', async (event) => {
        const dbCallId = callIdMap.get(event.callId);
        
        if (!dbCallId) {
          console.log('No database ID found for call:', event.callId);
          return;
        }

        // Map native state to database status
        const statusMap: Record<string, string> = {
          'dialing': 'ringing',
          'ringing': 'ringing',
          'active': 'answered',
          'disconnected': 'ended'
        };

        const newStatus = statusMap[event.state];
        
        if (!newStatus) {
          console.log('Unknown call state:', event.state);
          return;
        }

        // Prepare update data
        const updateData: any = {
          status: newStatus,
          updated_at: new Date().toISOString()
        };

        // If call ended, calculate duration
        if (event.state === 'disconnected') {
          const startTime = startTimes.get(event.callId);
          if (startTime) {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            updateData.duration = duration;
            
            // Clean up maps
            startTimes.delete(event.callId);
            callIdMap.delete(event.callId);
          }
        } else if (event.state === 'active' && !startTimes.has(event.callId)) {
          // Record start time when call becomes active
          startTimes.set(event.callId, Date.now());
        }

        // Update database
        const { error } = await supabase
          .from('calls')
          .update(updateData)
          .eq('id', dbCallId);

        if (error) {
          console.error('Error updating call status:', error);
        } else {
          console.log(`Call ${dbCallId} updated to ${newStatus}`);
        }
      });
    };

    setupListener();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [callIdMap, startTimes]);
};
