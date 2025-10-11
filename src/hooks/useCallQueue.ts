import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import PbxMobile from '@/plugins/pbx-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCallStatusSync } from './useCallStatusSync';

interface QueuedCall {
  number: string;
  listId?: string;
  priority?: number;
  callId?: string; // Database call ID if assigned from dashboard
}

interface CallQueueState {
  queue: QueuedCall[];
  activeCalls: Map<string, string>; // Map of native callId -> database callId
  maxConcurrentCalls: number;
  isProcessing: boolean;
}

export const useCallQueue = (maxConcurrentCalls: number = 6) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [state, setState] = useState<CallQueueState>({
    queue: [],
    activeCalls: new Map(),
    maxConcurrentCalls,
    isProcessing: false
  });
  
  const processingRef = useRef(false);
  const deviceIdRef = useRef<string | null>(null);
  
  // Maps for call status synchronization
  const callIdMapRef = useRef<Map<string, string>>(new Map());
  const startTimesRef = useRef<Map<string, number>>(new Map());
  
  // Enable automatic status sync with database
  useCallStatusSync(callIdMapRef.current, startTimesRef.current);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    
    const availableSlots = maxConcurrentCalls - state.activeCalls.size;
    
    if (availableSlots <= 0 || state.queue.length === 0) {
      return;
    }
    
    processingRef.current = true;
    
    try {
      const callsToMake = state.queue.slice(0, availableSlots);
      
      console.log(`Processing ${callsToMake.length} calls from queue`);
      
      for (const queuedCall of callsToMake) {
        try {
          let dbCallId = queuedCall.callId;
          
          // If no database call ID, create one
          if (!dbCallId && user && deviceIdRef.current) {
            const { data, error } = await supabase
              .from('calls')
              .insert({
                user_id: user.id,
                device_id: deviceIdRef.current,
                number: queuedCall.number,
                status: 'ringing',
                start_time: new Date().toISOString()
              })
              .select()
              .single();
            
            if (error) throw error;
            dbCallId = data.id;
          }
          
          // Make the call via native plugin
          const result = await PbxMobile.startCall({ number: queuedCall.number });
          
          // Map native call ID to database call ID
          setState(prev => {
            const newActiveCalls = new Map(prev.activeCalls);
            if (dbCallId) {
              newActiveCalls.set(result.callId, dbCallId);
              // Also add to the sync map
              callIdMapRef.current.set(result.callId, dbCallId);
            }
            return {
              ...prev,
              activeCalls: newActiveCalls,
              queue: prev.queue.filter(c => c !== queuedCall)
            };
          });
          
          console.log(`Call started: ${queuedCall.number} (Native ID: ${result.callId}, DB ID: ${dbCallId})`);
        } catch (error) {
          console.error(`Failed to start call to ${queuedCall.number}:`, error);
          
          // Remove from queue even if failed
          setState(prev => ({
            ...prev,
            queue: prev.queue.filter(c => c !== queuedCall)
          }));
        }
      }
      
    } catch (error) {
      console.error('Error processing call queue:', error);
    } finally {
      processingRef.current = false;
    }
  }, [maxConcurrentCalls, state.activeCalls.size, state.queue, user]);

  const addToQueue = useCallback((calls: QueuedCall | QueuedCall[]) => {
    const callsArray = Array.isArray(calls) ? calls : [calls];
    
    setState(prev => ({
      ...prev,
      queue: [...prev.queue, ...callsArray]
    }));
    
    // Try to process immediately
    setTimeout(() => processQueue(), 100);
    
    const queueStatus = {
      activeCount: state.activeCalls.size,
      queuedCount: state.queue.length + callsArray.length
    };
    
    toast({
      title: "Chamadas adicionadas à fila",
      description: `${callsArray.length} chamadas adicionadas. ${queueStatus.activeCount}/${maxConcurrentCalls} ativas, ${queueStatus.queuedCount} na fila`
    });
  }, [processQueue, toast, state.activeCalls.size, state.queue.length, maxConcurrentCalls]);

  const removeFromActive = useCallback((nativeCallId: string) => {
    setState(prev => {
      const newActiveCalls = new Map(prev.activeCalls);
      newActiveCalls.delete(nativeCallId);
      
      // Note: Status sync is now handled by useCallStatusSync hook
      // No need to update database here
      
      return {
        ...prev,
        activeCalls: newActiveCalls
      };
    });
    
    // Try to fill the slot
    setTimeout(() => processQueue(), 100);
  }, [processQueue]);

  const clearQueue = useCallback(() => {
    setState(prev => ({
      ...prev,
      queue: []
    }));
    
    toast({
      title: "Fila limpa",
      description: "Todas as chamadas pendentes foram removidas"
    });
  }, [toast]);

  const setDeviceId = useCallback((deviceId: string | null) => {
    deviceIdRef.current = deviceId;
  }, []);

  const getQueueStatus = useCallback(() => {
    return {
      queuedCount: state.queue.length,
      activeCount: state.activeCalls.size,
      availableSlots: maxConcurrentCalls - state.activeCalls.size,
      maxConcurrent: maxConcurrentCalls
    };
  }, [state.queue.length, state.activeCalls.size, maxConcurrentCalls]);

  return {
    addToQueue,
    removeFromActive,
    clearQueue,
    getQueueStatus,
    processQueue,
    setDeviceId,
    activeCalls: Array.from(state.activeCalls.keys()),
    queuedCalls: state.queue
  };
};

