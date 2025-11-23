import { useState, useEffect } from 'react';
import PbxMobile from '@/plugins/pbx-mobile';

interface DeviceInfo {
  model: string;
  realDeviceName: string | null; // Nome real do dispositivo do sistema
  os: string;
  osVersion: string;
  userAgent: string;
  simType: 'physical' | 'esim' | 'dual' | 'unknown';
  hasPhysicalSim: boolean;
  hasESim: boolean;
}

export const useDeviceInfo = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    model: 'Smartphone',
    realDeviceName: null,
    os: 'Unknown',
    osVersion: '',
    userAgent: '',
    simType: 'unknown',
    hasPhysicalSim: false,
    hasESim: false
  });

  useEffect(() => {
    const detectDeviceInfo = async () => {
      // Tentar pegar o nome real do dispositivo do sistema Android
      let realDeviceName: string | null = null;
      try {
        const result = await PbxMobile.getDeviceName();
        realDeviceName = result.deviceName || null;
        console.log('📱 Nome real do dispositivo obtido:', realDeviceName);
      } catch (error) {
        console.warn('⚠️ Erro ao obter nome real do dispositivo:', error);
        // Continua com a detecção normal mesmo se falhar
      }
      const userAgent = navigator.userAgent;
      
      // Detectar sistema operacional
      let os = 'Unknown';
      let osVersion = '';
      
      if (/Android/i.test(userAgent)) {
        os = 'Android';
        const match = userAgent.match(/Android\s([0-9\.]+)/);
        osVersion = match ? match[1] : '';
      } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
        os = 'iOS';
        const match = userAgent.match(/OS\s([0-9_]+)/);
        osVersion = match ? match[1].replace(/_/g, '.') : '';
      }

      // Detectar modelo do dispositivo
      let model = 'Smartphone';
      
      // Android devices
      if (/Android/i.test(userAgent)) {
        // Samsung
        if (/SM-/i.test(userAgent)) {
          const match = userAgent.match(/SM-([A-Z0-9]+)/);
          model = match ? `Samsung ${match[1]}` : 'Samsung Galaxy';
        }
        // Xiaomi
        else if (/Mi\s|Redmi/i.test(userAgent)) {
          const match = userAgent.match(/(Mi\s[A-Z0-9\s]+|Redmi[A-Z0-9\s]+)/i);
          model = match ? `Xiaomi ${match[1].trim()}` : 'Xiaomi';
        }
        // Huawei
        else if (/Huawei|Honor/i.test(userAgent)) {
          const match = userAgent.match(/(Huawei|Honor)\s([A-Z0-9-]+)/i);
          model = match ? `${match[1]} ${match[2]}` : 'Huawei';
        }
        // Motorola
        else if (/Motorola|moto/i.test(userAgent)) {
          const match = userAgent.match(/moto\s([a-z0-9\s]+)/i);
          model = match ? `Motorola ${match[1].trim()}` : 'Motorola';
        }
        // LG
        else if (/LG/i.test(userAgent)) {
          const match = userAgent.match(/LG-([A-Z0-9]+)/i);
          model = match ? `LG ${match[1]}` : 'LG';
        }
        // Sony
        else if (/Sony/i.test(userAgent)) {
          const match = userAgent.match(/Sony\s([A-Z0-9\s]+)/i);
          model = match ? `Sony ${match[1].trim()}` : 'Sony Xperia';
        }
        // Generic Android
        else {
          model = 'Android Device';
        }
      }
      // iOS devices
      else if (/iPhone/i.test(userAgent)) {
        model = 'iPhone';
        // Try to detect iPhone model
        if (/iPhone OS 15|iPhone OS 16|iPhone OS 17/i.test(userAgent)) {
          model = 'iPhone (Recente)';
        }
      } else if (/iPad/i.test(userAgent)) {
        model = 'iPad';
      }

      // Detectar capacidades de SIM
      // Esta é uma detecção básica, em um app real você usaria APIs nativas
      let simType: DeviceInfo['simType'] = 'unknown';
      let hasPhysicalSim = false;
      let hasESim = false;

      // Heurística básica baseada no modelo e ano
      if (os === 'iOS') {
        // iPhones desde o iPhone XS (2018) têm eSIM
        hasESim = true;
        hasPhysicalSim = true; // Maioria tem dual SIM
        simType = 'dual';
      } else if (os === 'Android') {
        // Dispositivos Android mais recentes frequentemente têm eSIM
        const currentYear = new Date().getFullYear();
        // Assumir que dispositivos de marcas principais têm eSIM se forem recentes
        if (model.includes('Samsung') || model.includes('Google') || 
            model.includes('Xiaomi') || model.includes('Huawei')) {
          hasPhysicalSim = true;
          hasESim = true; // Assumir eSIM em flagships
          simType = 'dual';
        } else {
          hasPhysicalSim = true;
          simType = 'physical';
        }
      }

      setDeviceInfo({
        model,
        realDeviceName,
        os,
        osVersion,
        userAgent,
        simType,
        hasPhysicalSim,
        hasESim
      });
    };

    detectDeviceInfo();
  }, []);

  const getAvailableSims = () => {
    const sims = [];
    
    if (deviceInfo.hasPhysicalSim) {
      sims.push({
        id: 'sim1',
        name: 'SIM Físico',
        operator: 'Operadora 1',
        type: 'physical' as const
      });
    }
    
    if (deviceInfo.hasESim) {
      sims.push({
        id: 'esim1',
        name: 'eSIM',
        operator: 'Operadora 2', 
        type: 'esim' as const
      });
    }

    // Se não detectamos nada, assumir SIM físico
    if (sims.length === 0) {
      sims.push({
        id: 'sim1',
        name: 'SIM Físico',
        operator: 'Operadora 1',
        type: 'physical' as const
      });
    }

    return sims;
  };

  return {
    deviceInfo,
    availableSims: getAvailableSims()
  };
};