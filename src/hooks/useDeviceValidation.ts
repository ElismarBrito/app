import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Device } from './usePBXData';

export const useDeviceValidation = (devices: Device[], updateDeviceStatus: (deviceId: string, updates: Partial<Device>) => void) => {
  const { user } = useAuth();

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

      // Update local state
      updateDeviceStatus(device.id, {
        internet_status: internetStatus,
        signal_status: signalStatus,
        line_blocked: lineBlocked
      });

    } catch (error) {
      // Silently log validation errors as these are background operations
      console.log('Device validation failed (background operation):', error);
    }
  }, [user?.id, updateDeviceStatus]);

  // Validate all online devices periodically
  const validateAllDevices = useCallback(async () => {
    const onlineDevices = devices.filter(device => device.status === 'online');
    
    for (const device of onlineDevices) {
      await validateDevice(device);
      // Add small delay between validations to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, [devices, validateDevice]);

  // Set up real-time validation
  useEffect(() => {
    if (!user || devices.length === 0) return;

    // Initial validation
    validateAllDevices();

    // Set up periodic validation every 30 seconds
    const interval = setInterval(validateAllDevices, 30000);

    // Listen for device status changes
    const channel = supabase
      .channel('device-validation')
      .on('presence', { event: 'sync' }, () => {
        console.log('Device validation sync established');
      })
      .on('broadcast', { event: 'validate-device' }, (payload) => {
        if (payload.userId === user.id && payload.deviceId) {
          const device = devices.find(d => d.id === payload.deviceId);
          if (device) {
            validateDevice(device);
          }
        }
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user, devices, validateAllDevices, validateDevice]);

  // Function to manually trigger validation for a specific device
  const triggerDeviceValidation = useCallback((deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (device) {
      validateDevice(device);
    }
  }, [devices, validateDevice]);

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