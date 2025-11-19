import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDeviceStatus } from '@/hooks/useDeviceStatus';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { useNativeSimDetection } from '@/hooks/useNativeSimDetection';
import { useQRScanner } from '@/hooks/useQRScanner';
import { useCallQueue } from '@/hooks/useCallQueue';
import { useCallAssignments } from '@/hooks/useCallAssignments';
import { CorporateDialer } from '@/components/CorporateDialer';
import { SimSelector } from '@/components/SimSelector';
import { CallHistoryManager } from '@/components/CallHistoryManager';
import { Smartphone, Wifi, WifiOff, Phone, PhoneOff, Settings, Play, Square, CreditCard, Pause, SkipForward } from 'lucide-react';
import PbxMobile from '@/plugins/pbx-mobile';
import type { CallInfo, SimCardInfo, CampaignProgress, CampaignSummary, PluginListenerHandle } from '@/plugins/pbx-mobile';

interface MobileAppProps {
  isStandalone?: boolean;
}

// Função helper para obter ou criar deviceId persistente (fora do componente para evitar problemas de inicialização)
const getOrCreateDeviceId = (): string | null => {
  try {
    // Verifica se estamos no ambiente do navegador/Capacitor
    if (typeof window === 'undefined') {
      return null;
    }

    const storageKey = 'pbx_device_id';
    
    // Verifica se localStorage está disponível
    if (typeof localStorage === 'undefined') {
      console.warn('localStorage não disponível, gerando deviceId temporário');
      return null;
    }
    
    let storedDeviceId: string | null = null;
    
    try {
      storedDeviceId = localStorage.getItem(storageKey);
    } catch (e) {
      console.warn('Erro ao acessar localStorage:', e);
      return null;
    }
    
    if (!storedDeviceId) {
      // Gera um novo ID persistente
      try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          storedDeviceId = crypto.randomUUID();
        } else {
          // Fallback para ambientes sem crypto.randomUUID
          storedDeviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        localStorage.setItem(storageKey, storedDeviceId);
        console.log('📱 Novo deviceId criado e salvo:', storedDeviceId);
      } catch (e) {
        console.error('Erro ao salvar deviceId:', e);
        return null;
      }
    } else {
      console.log('📱 DeviceId recuperado do localStorage:', storedDeviceId);
    }
    
    return storedDeviceId;
  } catch (error) {
    console.error('❌ Erro ao obter/criar deviceId:', error);
    // Retorna null em caso de erro para que o código possa lidar com isso
    return null;
  }
};

export const MobileApp = ({ isStandalone = false }: MobileAppProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { deviceInfo } = useDeviceInfo();
  const { simCards, isLoading: isLoadingSims } = useNativeSimDetection();
  const { scanQRCode } = useQRScanner();
  const { addToQueue, removeFromActive, clearQueue, getQueueStatus, setDeviceId: setQueueDeviceId } = useCallQueue(6);
  const [sessionCode, setSessionCode] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [deviceName, setDeviceName] = useState(deviceInfo.model);
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasDialerRole, setHasDialerRole] = useState(false);
  const [hasAllPermissions, setHasAllPermissions] = useState(false);
  const [activeCalls, setActiveCalls] = useState<CallInfo[]>([]);
  const [selectedSimId, setSelectedSimId] = useState<string>(simCards[0]?.id || 'default-sim');
  const [pendingCall, setPendingCall] = useState<string | null>(null);

  // Recupera o estado de pareamento quando o app inicia
  // Adiciona delay para garantir que tudo está inicializado
  useEffect(() => {
    if (!user) return;

    // Adiciona um pequeno delay para garantir que o app está completamente inicializado
    const restoreTimeout = setTimeout(() => {
      const restorePairingState = async () => {
        try {
          // Verifica se localStorage está disponível antes de usar
          if (typeof localStorage === 'undefined') {
            console.log('📱 localStorage não disponível ainda');
            return;
          }

          const persistentDeviceId = getOrCreateDeviceId();
          if (!persistentDeviceId) {
            console.log('📱 Não foi possível obter deviceId persistente');
            return;
          }
          
          // Verifica se o dispositivo existe no banco e está pareado
          const { data: device, error } = await supabase
            .from('devices')
            .select('*')
            .eq('id', persistentDeviceId)
            .eq('user_id', user.id)
            .single();

          if (error || !device) {
            console.log('📱 Dispositivo não encontrado no banco ou não pareado');
            // Limpa o localStorage se o dispositivo não existe mais
            if (error?.code === 'PGRST116' && typeof localStorage !== 'undefined') {
              try {
                localStorage.removeItem('pbx_device_id');
                localStorage.removeItem('pbx_is_paired');
              } catch (e) {
                console.warn('Erro ao limpar localStorage:', e);
              }
            }
            return;
          }

          // Verifica se o dispositivo foi desconectado no dashboard (status = 'offline')
          // Se foi desconectado, NÃO restaura o pareamento automaticamente
          // Verificação case-insensitive para garantir que funciona mesmo com variações de case
          const deviceStatus = device.status?.toLowerCase()?.trim();
          if (deviceStatus === 'offline') {
            console.log('⚠️ Dispositivo foi desconectado no dashboard (status: offline), não restaurando pareamento');
            // Limpa o localStorage para permitir novo pareamento manual
            if (typeof localStorage !== 'undefined') {
              try {
                localStorage.removeItem('pbx_is_paired');
                console.log('🧹 localStorage limpo: pbx_is_paired removido');
                // Mantém o deviceId para permitir repareamento futuro sem novo ID
              } catch (e) {
                console.warn('Erro ao limpar localStorage:', e);
              }
            }
            // Não restaura o pareamento - dispositivo deve ser pareado manualmente novamente
            return;
          }

          // Se o dispositivo existe e NÃO está offline, restaura o pareamento
          console.log('✅ Dispositivo encontrado no banco com status:', device.status);
          console.log('✅ Restaurando pareamento para dispositivo:', device.id);
          
          setDeviceId(device.id);
          setIsPaired(true);
          setIsConnected(true);
          
          // Verifica se está configurado (status deve ser 'configured' ou 'online')
          const isDeviceConfigured = deviceStatus === 'configured' || deviceStatus === 'online';
          setIsConfigured(isDeviceConfigured);
          
          // Atualiza o status para online apenas se já estava online ou configured
          // Se estava offline, não atualiza (já retornou acima)
          if (deviceStatus === 'online' || deviceStatus === 'configured') {
            console.log('🔄 Atualizando status do dispositivo para online...');
            supabase
              .from('devices')
              .update({
                status: 'online',
                last_seen: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', device.id)
              .then(() => {
                console.log('✅ Status do dispositivo atualizado para online');
                // Mostra toast apenas após sucesso
                if (toast) {
                  toast({
                    title: "Pareamento restaurado",
                    description: `${device.name || device.model} reconectado`,
                    variant: "default"
                  });
                }
              })
              .catch(err => console.error('❌ Erro ao atualizar status:', err));
          }
        } catch (error) {
          console.error('❌ Erro ao restaurar pareamento:', error);
          // Não quebra o app, apenas loga o erro
        }
      };

      restorePairingState();
    }, 500); // Delay de 500ms para garantir inicialização completa

    return () => clearTimeout(restoreTimeout);
  }, [user]);
  const [deviceStatus, setDeviceStatus] = useState({
    internet_status: 'good',
    signal_status: 'good',
    line_blocked: false
  });

  // New states for Power Dialer
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgress | null>(null);
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary | null>(null);
  const [campaignName, setCampaignName] = useState<string>('');

  // Map to track native call IDs to database call IDs
  const callMapRef = useRef<Map<string, string>>(new Map());
  
  // Handle new call assignments from dashboard
  const handleNewCallAssignment = (number: string, callId: string) => {
    console.log(`New call assigned: ${number} (DB ID: ${callId})`);
    
    toast({
      title: "Nova chamada atribuída",
      description: `Chamada para ${number} adicionada à fila`,
    });
    
    // Add to queue with database call ID
    addToQueue({ number, callId });
  };
  
  // Listen for call assignments from dashboard
  useCallAssignments({
    deviceId,
    enabled: isPaired && hasDialerRole,
    onNewCall: handleNewCallAssignment
  });

  useEffect(() => {
    if (deviceId) {
      // Update queue's device ID reference
      setQueueDeviceId(deviceId);
    }
  }, [deviceId, setQueueDeviceId]);

  // Update selected SIM when simCards are loaded
  useEffect(() => {
    if (simCards.length > 0 && !simCards.find(sim => sim.id === selectedSimId)) {
      setSelectedSimId(simCards[0].id);
    }
  }, [simCards, selectedSimId]);

  // Get selected SIM object
  const selectedSim = simCards.find(sim => sim.id === selectedSimId) || {
    id: 'default',
    slotIndex: 0,
    displayName: 'SIM Principal',
    carrierName: 'Operadora',
    phoneNumber: '',
    iccId: '',
    isEmbedded: false,
    type: 'physical' as const
  };

  // Use device status hook only when device is paired
  const { startHeartbeat, stopHeartbeat } = useDeviceStatus(deviceId || '');

  // Extrai o código de sessão da URL do QR Code ou retorna o código diretamente
  const extractSessionCode = (scannedValue: string): string | null => {
    if (!scannedValue) {
      return null;
    }
    
    try {
      const trimmed = scannedValue.trim();
      console.log('🔍 extractSessionCode - Valor recebido:', trimmed);
      
      // Se for uma URL, tenta extrair o parâmetro 'session'
      if (trimmed.includes('http://') || trimmed.includes('https://') || trimmed.includes('?')) {
        try {
          // Tenta criar URL direta ou adicionar protocolo se necessário
          let urlString = trimmed;
          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            urlString = `http://${trimmed}`;
          }
          
          const url = new URL(urlString);
          const sessionParam = url.searchParams.get('session');
          
          if (sessionParam) {
            console.log('🔍 extractSessionCode - Código extraído da URL (searchParams):', sessionParam);
            return sessionParam.trim();
          }
        } catch (urlError) {
          console.warn('⚠️ Erro ao parsear URL, tentando regex:', urlError);
        }
        
        // Fallback: usa regex para extrair session=xxx
        const pathMatch = trimmed.match(/[?&]session=([^&]+)/);
        if (pathMatch && pathMatch[1]) {
          const code = pathMatch[1].trim();
          console.log('🔍 extractSessionCode - Código extraído da URL (regex):', code);
          return code;
        }
      }
      
      // Se o código começa com "17" e é numérico, usa diretamente (formato esperado)
      // ou se é apenas números (pode ser código de sessão), usa diretamente
      const numericCode = trimmed;
      if (/^\d{10,}$/.test(numericCode)) { // Mínimo 10 dígitos (timestamp tem 13)
        console.log('🔍 extractSessionCode - Código numérico direto:', numericCode);
        return numericCode;
      }
      
      console.warn('⚠️ extractSessionCode - Nenhum código válido encontrado');
      return null;
    } catch (error) {
      console.error('❌ Erro ao extrair código de sessão:', error);
      
      // Último fallback: tenta usar o valor diretamente se for numérico
      const numericCode = scannedValue.trim();
      if (/^\d{10,}$/.test(numericCode)) {
        console.log('🔍 extractSessionCode - Fallback numérico:', numericCode);
        return numericCode;
      }
      
      return null;
    }
  };

  useEffect(() => {
    // Automatically fill session code from URL parameters and auto-pair if possible
    const urlParams = new URLSearchParams(window.location.search);
    const sessionFromUrl = urlParams.get('session');
    
    if (sessionFromUrl && !deviceId) {
      const extractedCode = extractSessionCode(sessionFromUrl);
      if (extractedCode) {
        setSessionCode(extractedCode);
        // Auto-pair after a short delay if user is authenticated
        if (user) {
          setTimeout(() => pairDevice(), 1000);
        }
      } else {
        setSessionCode(sessionFromUrl);
      }
    }
  }, [deviceId, user]);

  // Setup all event listeners on component mount
  useEffect(() => {
    const setup = async () => {
      console.log("Setting up native event listeners...");
      const handles = await Promise.all([
        PbxMobile.addListener('callStateChanged', async (event) => {
          console.log('Event: callStateChanged', event);
          if (event.state === 'disconnected') removeFromActive(event.callId);
          updateActiveCalls();
        }),
        PbxMobile.addListener('activeCallsChanged', (event) => {
          console.log('Event: activeCallsChanged', event.calls);
          setActiveCalls(event.calls);
        }),
        PbxMobile.addListener('dialerCampaignProgress', (progress) => {
          console.log('Event: dialerCampaignProgress', progress);
          setCampaignProgress(progress as CampaignProgress);
        }),
        PbxMobile.addListener('dialerCampaignCompleted', (summary) => {
          console.log('Event: dialerCampaignCompleted', summary);
          setCampaignSummary(summary as CampaignSummary);
          setCampaignProgress(null); // Reset progress
          toast({ title: "Campanha Finalizada", description: `Foram realizadas ${summary.totalAttempts} tentativas.` });
        })
      ]);
      console.log("Native event listeners set up.");
      // Sync state immediately after setup to avoid race conditions
      updateActiveCalls();
      return handles;
    };

    const handlesPromise = setup();

    return () => {
      console.log("Cleaning up native event listeners...");
      handlesPromise.then(handles => {
        handles.forEach(handle => handle.remove());
      });
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Handle user-dependent actions
  useEffect(() => {
    if (user) {
      requestAllPermissions();
      checkDialerRole();
    }
  }, [user]);

  useEffect(() => {
    // Update device name when deviceInfo changes
    setDeviceName(deviceInfo.model);
  }, [deviceInfo]);

  // Declare handleUnpaired before it's used in useEffect
  const handleUnpaired = () => {
    setDeviceId(null);
    setIsConnected(false);
    setIsPaired(false);
    setIsConfigured(false);
    setSessionCode('');
    stopHeartbeat();
    
    // Remove o pareamento do localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pbx_is_paired');
        // Mantém o deviceId para permitir repareamento futuro
        // localStorage.removeItem('pbx_device_id');
      }
    } catch (error) {
      console.error('❌ Erro ao remover do localStorage:', error);
    }
    
    toast({
      title: "Dispositivo despareado",
      description: "O dispositivo foi desconectado do dashboard",
      variant: "default"
    });
  };

  useEffect(() => {
    if (deviceId && isPaired) {
      startHeartbeat();
      
      // Listen for real-time updates on device status
      // Monitora UPDATE (mudanças de status) e DELETE (exclusão do dispositivo)
      const subscription = supabase
        .channel(`device-status-${deviceId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
          filter: `id=eq.${deviceId}`
        }, (payload) => {
          console.log('Device status updated:', payload.new);
          const newStatus = (payload.new as any)?.status;
          const newStatusLower = newStatus?.toLowerCase()?.trim();
          
          // Detecta quando o dispositivo foi desempareado no dashboard
          // O dashboard muda o status para 'offline' quando desempareia
          // Verificação case-insensitive para garantir que funciona mesmo com variações de case
          if (newStatusLower === 'offline' && isPaired) {
            console.log('⚠️ Dispositivo foi desempareado no dashboard (status: offline)');
            handleUnpaired();
          }
        })
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'devices',
          filter: `id=eq.${deviceId}`
        }, (payload) => {
          console.log('⚠️ Dispositivo foi deletado no dashboard:', payload.old);
          // Se o dispositivo foi deletado, também precisa desparear
          if (isPaired) {
            handleUnpaired();
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    } else {
      stopHeartbeat();
    }
  }, [deviceId, isPaired, startHeartbeat, stopHeartbeat]);

  const requestAllPermissions = async () => {
    try {
      const result = await PbxMobile.requestAllPermissions();
      setHasAllPermissions(result.granted);
      
      if (result.granted) {
        toast({
          title: "Permissões concedidas",
          description: "Todas as permissões necessárias foram concedidas",
        });
      } else {
        toast({
          title: "Permissões necessárias",
          description: "O app precisa de permissões para funcionar corretamente",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
    }
  };

  const checkDialerRole = async () => {
    try {
      const result = await PbxMobile.hasRoleDialer();
      setHasDialerRole(result.hasRole);
    } catch (error) {
      console.log('Error checking dialer role:', error);
    }
  };

  const requestDialerRole = async () => {
    try {
      const result = await PbxMobile.requestRoleDialer();
      setHasDialerRole(result.granted);
      
      if (result.granted) {
        // Register phone account
        await PbxMobile.registerPhoneAccount({ accountLabel: deviceName });
        toast({
          title: "Permissões concedidas",
          description: "App configurado como discador padrão",
          variant: "default"
        });
      } else {
        toast({
          title: "Permissões negadas",
          description: "É necessário ser o discador padrão para funcionar",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error requesting dialer role:', error);
      toast({
        title: "Erro",
        description: "Falha ao solicitar permissões",
        variant: "destructive"
      });
    }
  };

  const updateActiveCalls = async () => {
    try {
      const result = await PbxMobile.getActiveCalls();
      setActiveCalls(result.calls);
    } catch (error) {
      console.log('Error getting active calls:', error);
    }
  };

  // Sincroniza dados quando o app volta para foreground
  useEffect(() => {
    if (!deviceId || !isPaired) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && deviceId && isPaired) {
        // App voltou para foreground - atualiza dados
        console.log('📱 App voltou para foreground, sincronizando dados...');
        
        // Atualiza chamadas ativas
        updateActiveCalls();
        
        // Atualiza last_seen no dispositivo
        startHeartbeat();
      }
      // Quando vai para background, NÃO faz nada - mantém rodando em background
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, isPaired, startHeartbeat]);

  const makeCall = async (number: string) => {
    if (!hasDialerRole) {
      toast({
        title: "Permissão necessária",
        description: "Configure o app como discador padrão primeiro",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado",
        variant: "destructive"
      });
      return;
    }

    // Check if we can make more calls
    const queueStatus = getQueueStatus();
    
    if (queueStatus.activeCount >= 6) {
      // Add to queue instead
      addToQueue({ number });
      return;
    }

    try {
      // Insert call record in database first
      const { data: callData, error: dbError } = await supabase
        .from('calls')
        .insert({
          user_id: user.id,
          device_id: deviceId,
          number,
          status: 'ringing',
          start_time: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Make the call via native plugin
      const { callId } = await PbxMobile.startCall({ number });
      
      // Map native callId to database call id
      callMapRef.current.set(callId, callData.id);
      
      updateActiveCalls();
      
      toast({
        title: "Chamada iniciada",
        description: `Ligando para ${number}`,
      });
    } catch (error) {
      console.error('Error making call:', error);
      toast({
        title: "Erro na chamada",
        description: "Falha ao realizar chamada",
        variant: "destructive"
      });
    }
  };

  const endCall = async (callId: string) => {
    try {
      // Get database call ID from native call ID
      const dbCallId = callMapRef.current.get(callId);
      
      // End call via native plugin
      await PbxMobile.endCall({ callId });
      
      // Update database
      if (dbCallId) {
        const startTime = new Date();
        await supabase
          .from('calls')
          .update({ 
            status: 'ended',
            duration: 0 // Will be calculated by database trigger if needed
          })
          .eq('id', dbCallId);
        
        callMapRef.current.delete(callId);
      }
      
      toast({
        title: "Chamada encerrada",
      });
    } catch (error) {
      console.error('Error ending call:', error);
    } finally {
      // Always update the call list to reflect the real state
      updateActiveCalls();
    }
  };

  const mergeActiveCalls = async () => {
    try {
      const result = await PbxMobile.mergeActiveCalls();
      updateActiveCalls();
      
      toast({
        title: "Chamadas mescladas",
        description: "Conferência criada com sucesso",
        variant: "default"
      });
    } catch (error) {
      console.error('Error merging calls:', error);
      toast({
        title: "Erro na conferência",
        description: "Falha ao mesclar chamadas",
        variant: "destructive"
      });
    }
  };

  const saveDeviceName = async () => {
    setIsEditingName(false);
    if (deviceId) {
      // Update device name in database
      try {
        await supabase
          .from('devices')
          .update({ name: deviceName })
          .eq('id', deviceId);
      } catch (error) {
        console.error('Error updating device name:', error);
      }
    }
  };

  const pairDevice = async () => {
    // Remove espaços em branco e normaliza o código
    const cleanSessionCode = sessionCode.trim();
    
    if (!cleanSessionCode) {
      toast({
        title: "Erro",
        description: "Digite o código de sessão do QR Code",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado",
        variant: "destructive"
      });
      return;
    }

    try {
      // Usa o deviceId persistente ao invés de gerar um novo
      const persistentDeviceId = getOrCreateDeviceId();
      
      if (!persistentDeviceId) {
        toast({
          title: "Erro",
          description: "Não foi possível obter ID do dispositivo",
          variant: "destructive"
        });
        return;
      }
      
      const devicePayload = {
        device_id: persistentDeviceId,
        name: deviceName,
        model: deviceInfo.model,
        os: deviceInfo.os,
        os_version: deviceInfo.osVersion,
        sim_type: deviceInfo.simType,
        has_physical_sim: deviceInfo.hasPhysicalSim,
        has_esim: deviceInfo.hasESim
      };

      // Log para debug
      console.log('🔍 Pareamento - Código de sessão:', cleanSessionCode);
      console.log('🔍 Pareamento - User ID:', user.id);
      console.log('🔍 Pareamento - Device Payload:', devicePayload);

      const response = await fetch(`https://jovnndvixqymfvnxkbep.supabase.co/functions/v1/pair-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvdm5uZHZpeHF5bWZ2bnhrYmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzA4NzQsImV4cCI6MjA3MjAwNjg3NH0.wBLgUwk_VkwgPhyyh1Dk8dnAEtuTr8zl3fOxuWO1Scs`
        },
        body: JSON.stringify({
          session_code: cleanSessionCode,
          user_id: user.id,
          device_info: devicePayload
        })
      });

      const data = await response.json();
      
      // Log da resposta
      console.log('🔍 Pareamento - Resposta do servidor:', {
        status: response.status,
        ok: response.ok,
        data
      });

      if (response.ok) {
        setDeviceId(data.device.id);
        setIsConnected(true);
        setIsPaired(true);
        
        // Salva o estado de pareamento no localStorage
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pbx_device_id', data.device.id);
            localStorage.setItem('pbx_is_paired', 'true');
          }
        } catch (error) {
          console.error('❌ Erro ao salvar no localStorage:', error);
        }
        
        toast({
          title: "Sucesso!",
          description: `${deviceInfo.model} pareado com sucesso`,
          variant: "default"
        });
      } else {
        console.error('❌ Erro no pareamento:', data);
        toast({
          title: "Erro no pareamento",
          description: data.error || "Código de sessão inválido ou expirado. Gere um novo QR Code no dashboard.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('❌ Erro ao parear dispositivo:', error);
      toast({
        title: "Erro",
        description: "Falha na comunicação com o servidor",
        variant: "destructive"
      });
    }
  };

  const confirmConfiguration = async () => {
    if (!hasDialerRole) {
      toast({
        title: "Configuração necessária",
        description: "Configure o app como discador padrão primeiro",
        variant: "destructive"
      });
      return;
    }

    try {
      // Update device as configured
      await supabase
        .from('devices')
        .update({ 
          status: 'configured',
          updated_at: new Date().toISOString()
        })
        .eq('id', deviceId);

      setIsConfigured(true);
      
      toast({
        title: "Configuração confirmada",
        description: "Dispositivo pronto para receber chamadas",
        variant: "default"
      });
    } catch (error) {
      console.error('Error confirming configuration:', error);
      toast({
        title: "Erro",
        description: "Falha ao confirmar configuração",
        variant: "destructive"
      });
    }
  };

  const handleScanQR = async () => {
    const scannedValue = await scanQRCode();
    if (scannedValue) {
      console.log('📷 QR Code escaneado (valor bruto):', scannedValue);
      
      const extractedCode = extractSessionCode(scannedValue);
      console.log('📷 Código extraído:', extractedCode);
      
      if (extractedCode) {
        // Remove espaços e normaliza
        const cleanCode = extractedCode.trim();
        setSessionCode(cleanCode);
        
        toast({
          title: "Código extraído",
          description: `Código de sessão: ${cleanCode}`,
          variant: "default"
        });
        
        // Automatically try to pair if we got a valid code
        setTimeout(() => {
          console.log('🚀 Iniciando pareamento automático...');
          pairDevice();
        }, 500);
      } else {
        console.error('❌ Não foi possível extrair código de sessão do valor:', scannedValue);
        toast({
          title: "Erro ao processar QR Code",
          description: "Não foi possível extrair o código de sessão. Verifique se o QR Code é válido.",
          variant: "destructive"
        });
      }
    }
  };

  const disconnect = async () => {
    handleUnpaired();
  };

  // Declare handleCommand before it's used in useEffect
  const handleCommand = async (command: any) => {
    console.log('Comando recebido do dashboard:', JSON.stringify(command, null, 2));
    
    switch (command.command) {
      case 'make_call':
        console.log('Processando comando make_call:', command.data);
        setPendingCall(command.data.number);
        toast({
          title: "Nova chamada solicitada",
          description: `Dashboard solicitou chamada para ${command.data.number}`,
          variant: "default"
        });
        break;
        
      case 'start_campaign':
        console.log('Processando comando start_campaign:', command.data);
        if (command.data.list && command.data.list.numbers) {
          try {
            setCampaignName(command.data.listName);
            await PbxMobile.startCampaign({
              numbers: command.data.list.numbers,
              deviceId: deviceId!,
              listId: command.data.listId,
              listName: command.data.listName,
              simId: selectedSimId
            });
            setCampaignSummary(null); // Clear previous summary
            toast({ title: "Campanha Iniciada", description: `Iniciando chamadas para ${command.data.list.numbers.length} números.` });
          } catch (error) {
            console.error('Error starting campaign:', error);
            toast({ title: "Erro na Campanha", description: "Não foi possível iniciar a campanha", variant: "destructive" });
          }
        } else {
          console.error('Dados de campanha inválidos:', command.data);
          toast({ title: "Erro na Campanha", description: "Dados da lista de números são inválidos", variant: "destructive" });
        }
        break;
        
      case 'end_call':
        console.log('Processando comando end_call:', command.data);
        // End specific call
        try {
          if (command.data.callId) {
            await PbxMobile.endCall({ callId: command.data.callId });
            toast({
              title: "Chamada encerrada",
              description: "Chamada encerrada pelo dashboard",
              variant: "default"
            });
          }
        } catch (error) {
          console.error('Error ending call:', error);
          toast({
            title: "Erro ao encerrar",
            description: "Não foi possível encerrar a chamada",
            variant: "destructive"
          });
        }
        break;
        
      case 'answer_call':
        console.log('Processando comando answer_call:', command.data);
        // Auto-answer call (if supported)
        try {
          if (command.data.callId) {
            toast({
              title: "Atendendo chamada",
              description: "Atendendo chamada automaticamente",
              variant: "default"
            });
            // Note: Auto-answer may require additional permissions
          }
        } catch (error) {
          console.error('Error answering call:', error);
        }
        break;
        
      case 'mute_call':
        console.log('Processando comando mute_call:', command.data);
        // Mute current call
        toast({
          title: "Chamada silenciada",
          description: "Microfone silenciado pelo dashboard",
          variant: "default"
        });
        break;
        
      default:
        console.log('Comando desconhecido:', command.command, command);
        toast({
          title: "Comando não reconhecido",
          description: `Comando "${command.command}" não é suportado`,
          variant: "destructive"
        });
    }
  };

  // Listen for commands from dashboard
  useEffect(() => {
    if (!deviceId || !isConnected) return;

    const subscription = supabase
      .channel('device-commands')
      .on('broadcast', { event: 'command' }, (payload) => {
        if (payload.payload.device_id === deviceId) {
          handleCommand(payload.payload);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [deviceId, isConnected, handleCommand]);

  const confirmPendingCall = async () => {
    if (pendingCall) {
      await makeCall(pendingCall);
      setPendingCall(null);
    }
  };

  const cancelPendingCall = () => {
    setPendingCall(null);
    toast({
      title: "Chamada cancelada",
      description: "Chamada solicitada foi cancelada",
      variant: "default"
    });
  };

  const handlePauseCampaign = () => PbxMobile.pauseCampaign();
  const handleResumeCampaign = () => PbxMobile.resumeCampaign();
  const handleStopCampaign = () => PbxMobile.stopCampaign();

  if (isStandalone) {
    // Show Corporate Dialer when paired and configured, OR when there are active calls/campaigns/pending calls
    const shouldShowDialer = (isPaired && isConfigured && hasDialerRole) || 
                            activeCalls.length > 0 || 
                            campaignProgress !== null || 
                            pendingCall !== null;
    
    if (shouldShowDialer) {
      return (
        <CorporateDialer
          deviceName={deviceName}
          selectedSim={{
            id: selectedSim.id,
            name: selectedSim.displayName,
            operator: selectedSim.carrierName,
            type: selectedSim.type
          }}
          activeCalls={activeCalls}
          onMakeCall={makeCall}
          onEndCall={endCall}
          onMergeActiveCalls={mergeActiveCalls}
          deviceModel={deviceInfo.model}
          campaignProgress={campaignProgress}
          campaignName={campaignName}
          onPauseCampaign={handlePauseCampaign}
          onResumeCampaign={handleResumeCampaign}
          onStopCampaign={handleStopCampaign}
        />
      );
    }

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center">
            <Smartphone className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h1 className="text-2xl font-bold">PBX Mobile</h1>
            <p className="text-muted-foreground">Conecte-se ao seu dashboard</p>
          </div>
          
          {/* Device Info Display */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">{deviceInfo.model}</p>
                <p className="text-xs text-muted-foreground">
                  {deviceInfo.os} {deviceInfo.osVersion}
                </p>
                <div className="flex justify-center gap-2 text-xs">
                  {deviceInfo.hasPhysicalSim && (
                    <Badge variant="outline" className="text-xs">SIM Físico</Badge>
                  )}
                  {deviceInfo.hasESim && (
                    <Badge variant="outline" className="text-xs">eSIM</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-red-500" />
                )}
                Status da Conexão
              </CardTitle>
              <CardDescription>
                <Badge variant={isConnected ? "default" : "secondary"}>
                  {isConnected ? "Conectado" : "Desconectado"}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isConnected ? (
                  <div className="space-y-4">
                    {/* Opção de escanear QR Code */}
                    <div className="text-center space-y-4">
                      <Button 
                        onClick={handleScanQR}
                        className="w-full h-14 text-lg"
                        size="lg"
                      >
                        📷 Escanear QR Code
                      </Button>
                      
                      <div className="flex items-center gap-4">
                        <hr className="flex-1" />
                        <span className="text-xs text-muted-foreground">OU</span>
                        <hr className="flex-1" />
                      </div>
                    </div>
                  
                  {/* Opção manual */}
                  <div className="space-y-2">
                    <Label htmlFor="sessionCode">Inserir Código Manualmente</Label>
                    <Input
                      id="sessionCode"
                      placeholder="Digite o código de sessão do QR Code"
                      value={sessionCode}
                      onChange={(e) => setSessionCode(e.target.value)}
                    />
                  </div>
                  <Button onClick={pairDevice} className="w-full" disabled={!sessionCode.trim()}>
                    Parear Dispositivo
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      Dispositivo conectado ao dashboard
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      ID: {deviceId?.slice(0, 8)}...
                    </p>
                  </div>
                  <Button 
                    onClick={disconnect} 
                    variant="outline" 
                    className="w-full"
                  >
                    Desconectar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Device Name Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurações do Dispositivo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deviceName">Nome do Dispositivo</Label>
                {isEditingName ? (
                  <div className="flex gap-2">
                    <Input
                      id="deviceName"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="Ex: Celular 1, Celular 2..."
                    />
                    <Button size="sm" onClick={saveDeviceName}>
                      Salvar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{deviceName}</span>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setIsEditingName(true)}
                    >
                      Editar
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Dialer Role Status */}
              <div className="space-y-2">
                <Label>Permissões</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={hasAllPermissions ? "default" : "destructive"}>
                      {hasAllPermissions ? "Todas concedidas" : "Pendente"}
                    </Badge>
                    {!hasAllPermissions && (
                      <Button size="sm" onClick={requestAllPermissions}>
                        Solicitar
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Discador Padrão</span>
                    <Badge variant={hasDialerRole ? "default" : "destructive"}>
                      {hasDialerRole ? "Sim" : "Não"}
                    </Badge>
                  </div>
                  {!hasDialerRole && (
                    <Button size="sm" onClick={requestDialerRole} className="w-full">
                      Configurar como Discador
                    </Button>
                  )}
                </div>
              </div>

              {/* SIM Card Selection */}
              <SimSelector 
                simCards={simCards}
                selectedSimId={selectedSimId}
                onSimSelect={setSelectedSimId}
              />
              
              {/* Call Queue Status */}
              {(() => {
                const status = getQueueStatus();
                return status.activeCount > 0 || status.queuedCount > 0 ? (
                  <div className="space-y-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <Label className="text-primary">Status de Chamadas</Label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ativas:</span>
                        <Badge variant="default">{status.activeCount}/6</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fila:</span>
                        <Badge variant="secondary">{status.queuedCount}</Badge>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(status.activeCount / 6) * 100}%` }}
                      />
                    </div>
                    {status.queuedCount > 0 && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-full text-xs"
                        onClick={clearQueue}
                      >
                        Limpar Fila
                      </Button>
                    )}
                  </div>
                ) : null;
              })()}
              
              {/* Configuration confirmation button */}
              {isPaired && hasDialerRole && !isConfigured && (
                <div className="pt-4">
                  <Button onClick={confirmConfiguration} className="w-full">
                    Confirmar Configuração
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Confirme para ativar o discador
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Calls */}
          {activeCalls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Chamadas Ativas ({activeCalls.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeCalls.map((call) => (
                  <div key={call.callId} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="font-medium">{call.number}</p>
                      <p className="text-sm text-muted-foreground">{call.state}</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={() => endCall(call.callId)}
                    >
                      <PhoneOff className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                {activeCalls.length > 1 && (
                  <Button onClick={mergeActiveCalls} className="w-full">
                    Mesclar Chamadas (Conferência)
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Call History Manager */}
          {deviceId && isPaired && (
            <CallHistoryManager deviceId={deviceId} />
          )}

          {/* Automated Sessions (Old) - This will be replaced by CampaignProgressCard */}

          {/* Pending Call Request */}
          {pendingCall && (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Phone className="h-5 w-5" />
                  Solicitação de Chamada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-lg font-medium">Dashboard solicitou chamada para:</p>
                  <p className="text-2xl font-bold text-primary">{pendingCall}</p>
                  <p className="text-sm text-muted-foreground">
                    Usando {selectedSim.displayName} - {selectedSim.carrierName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={confirmPendingCall} className="flex-1">
                    <Phone className="h-4 w-4 mr-2" />
                    Confirmar Chamada
                  </Button>
                  <Button variant="outline" onClick={cancelPendingCall} className="flex-1">
                    <PhoneOff className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isConnected && !pendingCall && !campaignProgress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Controles de Chamada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Aguardando comandos do dashboard...
                  </p>
                  <div className="text-xs text-muted-foreground">
                    Chip ativo: {selectedSim.displayName} - {selectedSim.carrierName}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>App Mobile</CardTitle>
        <CardDescription>Simulador do aplicativo móvel</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Component content for dashboard integration */}
        <div className="text-center text-sm text-muted-foreground">
          Use o aplicativo móvel real para parear dispositivos
        </div>
      </CardContent>
    </Card>
  );
};