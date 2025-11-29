import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Device } from './usePBXData';

export const useDeviceValidation = (devices: Device[], updateDeviceStatus: (deviceId: string, updates: Partial<Device>) => void) => {
  const { user } = useAuth();
  
  // CORREÇÃO: Usa refs para evitar recriações desnecessárias
  const devicesRef = useRef(devices);
  const updateDeviceStatusRef = useRef(updateDeviceStatus);
  
  // Atualiza refs quando mudam
  useEffect(() => {
    devicesRef.current = devices;
    updateDeviceStatusRef.current = updateDeviceStatus;
  }, [devices, updateDeviceStatus]);

  // Simulate device validation checks
  const validateDevice = useCallback(async (device: Device) => {
    if (device.status !== 'online') return;

    try {
      // Simulate internet connectivity check
      const internetStatus = Math.random() > 0.1 ? 'good' : Math.random() > 0.5 ? 'poor' : 'offline';
      
      // Simulate signal strength check  
      const signalStatus = Math.random() > 0.1 ? 'excellent' : Math.random() > 0.5 ? 'good' : 'poor';
      
      // Simulate line block check
      const lineBlocked = Math.random() > 0.95; // 5% chance of being blocked
      
      // Update device status in database
      const { error } = await supabase
        .from('devices')
        .update({
          internet_status: internetStatus,
          signal_status: signalStatus,
          line_blocked: lineBlocked,
          last_seen: new Date().toISOString()
        })
        .eq('id', device.id)
        .eq('user_id', user?.id);

      if (error) {
        console.error('Error updating device validation:', error);
        // Don't show error toast for validation updates as they are background operations
        return;
      }

      // Update local state usando ref
      updateDeviceStatusRef.current(device.id, {
        internet_status: internetStatus,
        signal_status: signalStatus,
        line_blocked: lineBlocked
      });

    } catch (error) {
      // Silently log validation errors as these are background operations
      console.log('Device validation failed (background operation):', error);
    }
  }, [user?.id]);

  // Validate all online devices periodically - usa ref para evitar recriações
  const validateAllDevices = useCallback(async () => {
    const onlineDevices = devicesRef.current.filter(device => device.status === 'online');
    
    for (const device of onlineDevices) {
      await validateDevice(device);
      // Add small delay between validations to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, [validateDevice]);

  // Set up real-time validation - CORRIGIDO: não recria quando devices muda
  useEffect(() => {
    if (!user?.id) return;

    // Initial validation apenas uma vez
    const initialTimeout = setTimeout(() => {
    validateAllDevices();
    }, 2000); // Delay inicial de 2 segundos para evitar validação imediata

    // Set up periodic validation every 30 seconds
    const interval = setInterval(validateAllDevices, 30000);

    // Listen for device status changes
    const channel = supabase
      .channel(`device-validation-${user.id}`) // Canal único por usuário
      .on('presence', { event: 'sync' }, () => {
        console.log('Device validation sync established');
      })
      .on('broadcast', { event: 'validate-device' }, (payload) => {
        if (payload.userId === user.id && payload.deviceId) {
          const device = devicesRef.current.find(d => d.id === payload.deviceId);
          if (device) {
            validateDevice(device);
          }
        }
      })
      .subscribe();

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, validateAllDevices, validateDevice]); // ✅ Removido 'devices' e 'validateAllDevices' das dependências

  // Function to manually trigger validation for a specific device
  const triggerDeviceValidation = useCallback((deviceId: string) => {
    const device = devicesRef.current.find(d => d.id === deviceId);
    if (device) {
      validateDevice(device);
    }
  }, [validateDevice]);

  // Function to send validation command to mobile device
  const requestDeviceValidation = useCallback(async (deviceId: string) => {
    try {
      const channel = supabase.channel('device-commands');
      
      await channel.send({
        type: 'broadcast',
        event: 'validate-status',
        payload: {
          device_id: deviceId,
          command: 'validate_status',
          timestamp: Date.now()
        }
      });

      console.log(`Validation request sent to device ${deviceId}`);
    } catch (error) {
      console.error('Error sending validation request:', error);
    }
  }, []);

  return {
    triggerDeviceValidation,
    requestDeviceValidation,
    validateAllDevices
  };
};