import { useState, useEffect } from 'react';
import PbxMobile from '@/plugins/pbx-mobile';
import type { SimCardInfo } from '@/plugins/pbx-mobile';
import { Capacitor } from '@capacitor/core';

export const useNativeSimDetection = () => {
  const [simCards, setSimCards] = useState<SimCardInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detectSims = async () => {
      // Only run on native platforms
      if (!Capacitor.isNativePlatform()) {
        setIsLoading(false);
        // Return mock data for web testing
        setSimCards([
          {
            id: 'web-sim-1',
            slotIndex: 0,
            displayName: 'SIM Principal',
            carrierName: 'Operadora 1',
            phoneNumber: '',
            iccId: '',
            isEmbedded: false,
            type: 'physical'
          }
        ]);
        return;
      }

      try {
        const result = await PbxMobile.getSimCards();
        setSimCards(result.simCards || []);
        setError(null);
      } catch (err) {
        console.error('Error detecting SIM cards:', err);
        setError('Não foi possível detectar os chips do dispositivo');
        // Fallback to default SIM
        setSimCards([
          {
            id: 'default-sim',
            slotIndex: 0,
            displayName: 'SIM Principal',
            carrierName: 'Operadora',
            phoneNumber: '',
            iccId: '',
            isEmbedded: false,
            type: 'physical'
          }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    detectSims();
  }, []);

  return { simCards, isLoading, error };
};
