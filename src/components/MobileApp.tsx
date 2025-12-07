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
import { useCallStatusSync } from '@/hooks/useCallStatusSync';
import { CorporateDialer } from '@/components/CorporateDialer';
import { ModernDialer } from '@/components/ModernDialer';
import { SimSelector } from '@/components/SimSelector';
import { CallHistoryManager } from '@/components/CallHistoryManager';
import { Smartphone, Wifi, WifiOff, Phone, PhoneOff, Settings, Play, Square, CreditCard, Pause, SkipForward, LayoutGrid, LayoutList } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import PbxMobile from '@/plugins/pbx-mobile';
import type { CallInfo, SimCardInfo, CampaignProgress, CampaignSummary, PluginListenerHandle } from '@/plugins/pbx-mobile';

interface MobileAppProps {
  isStandalone?: boolean;
}

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
  const [deviceStatus, setDeviceStatus] = useState({
    internet_status: 'good',
    signal_status: 'good',
    line_blocked: false
  });

  // New states for Power Dialer
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgress | null>(null);
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary | null>(null);
  const [campaignName, setCampaignName] = useState<string>('');
  
  // Estado para alternar entre views do discador
  const [useModernView, setUseModernView] = useState<boolean>(false);

  // Map to track native call IDs to database call IDs
  const callMapRef = useRef<Map<string, string>>(new Map());
  const startTimesRef = useRef<Map<string, number>>(new Map());
  
  // Temporary map to track campaign number -> dbCallId until native callId is available
  const campaignNumberToDbCallIdRef = useRef<Map<string, string>>(new Map());
  
  // Ref to track if dialerCallStateChanged listener is ready
  const dialerListenerReadyRef = useRef<boolean>(false);
  
  // Ref para rastrear o último valor de active_calls_count para evitar atualizações desnecessárias
  const lastActiveCallsCountRef = useRef<number | null>(null);
  
  // CORREÇÃO: Debounce para evitar race conditions nas atualizações do banco
  const dbUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDbUpdateRef = useRef<number | null>(null);
  
  // Enable automatic status sync with database
  useCallStatusSync(callMapRef.current, startTimesRef.current);
  
  // Handle new call assignments from dashboard
  // CORREÇÃO: Função estável - o hook useCallAssignments já usa useRef internamente
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
      
      // CORREÇÃO: Aceitar código numérico de 13 dígitos (timestamp Date.now())
      // Timestamp atual tem 13 dígitos (ex: 1737654321000)
      const numericCode = trimmed;
      if (/^\d{13}$/.test(numericCode)) {
        // Código de 13 dígitos = timestamp válido
        console.log('🔍 extractSessionCode - Código de 13 dígitos (timestamp) aceito:', numericCode);
        return numericCode;
      } else if (/^\d{8,}$/.test(numericCode)) {
        // Aceita também códigos numéricos com 8+ dígitos (formato flexível)
        console.log('🔍 extractSessionCode - Código numérico direto (8+ dígitos):', numericCode);
        return numericCode;
      }
      
      // CORREÇÃO: Se não passou nas validações anteriores, aceitar o valor diretamente se não estiver vazio
      // Isso permite códigos customizados ou formatos não previstos
      if (trimmed.length > 0) {
        console.log('🔍 extractSessionCode - Aceitando código como está (sem validação rígida):', trimmed);
        return trimmed;
      }
      
      console.warn('⚠️ extractSessionCode - Nenhum código válido encontrado');
      return null;
    } catch (error) {
      console.error('❌ Erro ao extrair código de sessão:', error);
      
      // Último fallback: tenta usar o valor diretamente se for numérico ou não vazio
      const numericCode = scannedValue.trim();
      if (/^\d{8,}$/.test(numericCode)) {
        console.log('🔍 extractSessionCode - Fallback numérico:', numericCode);
        return numericCode;
      }
      
      // Se não é numérico mas não está vazio, aceitar mesmo assim
      if (numericCode.length > 0) {
        console.log('🔍 extractSessionCode - Fallback: aceitando código como está:', numericCode);
        return numericCode;
      }
      
      return null;
    }
  };

  // CORREÇÃO: Carregar pareamento persistido e pedir permissões automaticamente UMA VEZ
  useEffect(() => {
    if (!user) return

    // Carregar pareamento persistido do localStorage
    const loadPersistedPairing = async () => {
      try {
        const savedDeviceId = localStorage.getItem(`pbx_device_id_${user.id}`)
        if (savedDeviceId) {
          console.log('📱 Pareamento persistido encontrado:', savedDeviceId)
          
          // Verificar se o dispositivo ainda existe e está pareado no banco
          const { data: device, error } = await supabase
            .from('devices')
            .select('id, status, name')
            .eq('id', savedDeviceId)
            .eq('user_id', user.id)
            .single()
          
          // CORREÇÃO: Verificar explicitamente se status é 'unpaired' e limpar tudo
          if (error || !device || device.status === 'unpaired') {
            // Dispositivo foi despareado ou não existe mais, limpar TUDO
            console.log('⚠️ Dispositivo não está mais pareado (status:', device?.status || 'não encontrado', '), limpando persistência')
            localStorage.removeItem(`pbx_device_id_${user.id}`)
            if (savedDeviceId) {
              localStorage.removeItem(`pbx_permissions_requested_${savedDeviceId}`)
            }
            setDeviceId(null)
            setIsPaired(false)
            setIsConnected(false)
            return
          }
          
          // Dispositivo ainda está pareado, restaurar estado
          if (device.status !== 'unpaired') {
            setDeviceId(device.id)
            setIsPaired(true)
            setIsConnected(true)
            
            // Verificar permissões (sem pedir, apenas verificar)
            let dialerResult;
            try {
              dialerResult = await PbxMobile.hasRoleDialer()
              setHasDialerRole(dialerResult.hasRole)
              
              // Verificar se já tem todas as permissões
              setHasAllPermissions(dialerResult.hasRole)
              setIsConfigured(dialerResult.hasRole)
              
              // CORREÇÃO: Atualizar chamadas ativas ao restaurar pareamento
              updateActiveCalls()
            } catch (error) {
              console.error('Erro ao verificar permissões:', error)
              dialerResult = { hasRole: false } // Fallback se der erro
            }
            
            // CORREÇÃO: Pedir permissões automaticamente apenas UMA VEZ por dispositivo
            const permissionsRequestedKey = `pbx_permissions_requested_${savedDeviceId}`
            const alreadyRequested = localStorage.getItem(permissionsRequestedKey)
            
            if (!alreadyRequested && !dialerResult.hasRole) {
              console.log('🔐 Pedindo permissões automaticamente pela primeira vez...')
              // Salvar no localStorage que já pediu (antes mesmo de pedir, para evitar múltiplas tentativas)
              localStorage.setItem(permissionsRequestedKey, 'true')
              
              // Pedir permissões automaticamente
              try {
                const permissionResult = await PbxMobile.requestAllPermissions()
                setHasAllPermissions(permissionResult.granted)
                
                // Se permissões foram concedidas, pedir dialer role também
                if (permissionResult.granted) {
                  const roleResult = await PbxMobile.requestRoleDialer()
                  setHasDialerRole(roleResult.granted)
                  
                  if (roleResult.granted) {
                    // Registrar phone account
                    await PbxMobile.registerPhoneAccount({ accountLabel: deviceName })
                    setIsConfigured(true)
                    
                    toast({
                      title: "Permissões concedidas",
                      description: "App configurado automaticamente como discador padrão",
                      variant: "default"
                    })
                  }
                }
              } catch (error) {
                console.error('Erro ao pedir permissões automaticamente:', error)
                // Se der erro, remover flag para tentar novamente na próxima vez
                localStorage.removeItem(permissionsRequestedKey)
              }
            } else {
              console.log('✅ Permissões já foram pedidas anteriormente ou já estão configuradas')
            }
            
            console.log('✅ Pareamento restaurado com sucesso')
          } else {
            // Dispositivo foi despareado ou não existe mais, limpar localStorage
            localStorage.removeItem(`pbx_device_id_${user.id}`)
            console.log('⚠️ Dispositivo não está mais pareado, limpando persistência')
          }
        }
      } catch (error) {
        console.error('Erro ao carregar pareamento persistido:', error)
      }
    }

    loadPersistedPairing()
  }, [user])

  useEffect(() => {
    // Automatically fill session code from URL parameters and auto-pair if possible
    const urlParams = new URLSearchParams(window.location.search);
    const sessionFromUrl = urlParams.get('session');
    
    if (sessionFromUrl && !deviceId) {
      const extractedCode = extractSessionCode(sessionFromUrl);
      if (extractedCode && typeof extractedCode === 'string' && extractedCode.trim().length > 0) {
        const cleanCode = extractedCode.trim();
        setSessionCode(cleanCode);
        // CORREÇÃO: Auto-pair diretamente com o código extraído, sem setTimeout
        // Isso evita race condition onde pairDevice é chamado antes do estado ser atualizado
        if (user) {
          // Pequeno delay para garantir que o componente está pronto
          setTimeout(() => {
            console.log('🚀 Iniciando pareamento automático a partir da URL...');
            pairDevice(cleanCode);
          }, 500);
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
      
      // CORREÇÃO CRÍTICA: Marcar listener como pronto IMEDIATAMENTE, não esperar por async callback
      // Isso evita race condition onde start_campaign chega antes da useEffect completar
      dialerListenerReadyRef.current = true;
      console.log(`✅ [SYNC] dialerListenerReadyRef marcado como PRONTO no início do setup`);
      
      // Registrar dialerCallStateChanged ANTES dos outros para garantir que está pronto
      const dialerListener = PbxMobile.addListener('dialerCallStateChanged', async (event: any) => {
        console.log(`📞 [dialerCallStateChanged] LISTENER ACIONADO - Evento recebido:`, event);
        
        try {
          const eventStr = JSON.stringify(event);
          console.log(`📞 [dialerCallStateChanged] INÍCIO - Evento: ${eventStr}`);
          
          if (!event) {
            console.error(`❌ [dialerCallStateChanged] Evento vazio ou inválido`);
            return;
          }
          
          const eventNumber = event.number || null;
          const eventCallId = event.callId || null;
          const eventState = event.state || null;
          
          console.log(`📞 [dialerCallStateChanged] number=${eventNumber}, callId=${eventCallId}, state=${eventState}`);
          
          // Tentar mapear callId nativo -> dbCallId usando o número
          if (eventNumber && eventCallId && !callMapRef.current.has(eventCallId)) {
            const dbCallId = campaignNumberToDbCallIdRef.current.get(eventNumber);
            if (dbCallId) {
              callMapRef.current.set(eventCallId, dbCallId);
              console.log(`🔗 [dialerCallStateChanged] Mapeado ${eventCallId} -> ${dbCallId} (${eventNumber})`);
            } else {
              console.log(`⚠️ [dialerCallStateChanged] dbCallId não encontrado para número ${eventNumber}`);
            }
          }
          
          // Atualizar banco de dados diretamente se tiver o dbCallId
          // Tenta primeiro pelo callId, depois pelo número
          let dbCallId = eventCallId ? callMapRef.current.get(eventCallId) : null;
          if (!dbCallId && eventNumber) {
            // Se não encontrou pelo callId, tenta pelo número (para chamadas de campanha)
            dbCallId = campaignNumberToDbCallIdRef.current.get(eventNumber);
            if (dbCallId && eventCallId) {
              // Se encontrou pelo número, mapeia o callId para uso futuro
              callMapRef.current.set(eventCallId, dbCallId);
              console.log(`🔗 [dialerCallStateChanged] Mapeado callId ${eventCallId} -> dbCallId ${dbCallId} via número ${eventNumber}`);
            }
          }
          
          // Se não encontrou dbCallId, não há o que atualizar (chamada não foi criada no banco ou mapeamento falhou)
          if (!dbCallId) {
            console.log(`⚠️ [dialerCallStateChanged] dbCallId não encontrado para callId ${eventCallId} ou número ${eventNumber} - evento ignorado`);
            return;
          }
          
          // Mapear estado nativo para status do banco
          const statusMap: Record<string, string> = {
            'DIALING': 'dialing',
            'RINGING': 'ringing',
            'ACTIVE': 'answered',
            'HOLDING': 'holding',
            'DISCONNECTED': 'ended',
            'BUSY': 'ended',
            'FAILED': 'ended',
            'NO_ANSWER': 'ended',
            'REJECTED': 'ended',
            'UNREACHABLE': 'ended',
            'dialing': 'dialing',
            'ringing': 'ringing',
            'active': 'answered',
            'holding': 'holding',
            'disconnected': 'ended',
            'busy': 'ended',
            'failed': 'ended',
            'no_answer': 'ended',
            'rejected': 'ended',
            'unreachable': 'ended'
          };
          
          const newStatus = statusMap[eventState] || 'ringing';
          console.log(`📞 [dialerCallStateChanged] Status mapeado: ${eventState} -> ${newStatus}`);
          
          // Preparar dados de atualização
          const updateData: any = {
            status: newStatus,
            updated_at: new Date().toISOString()
          };
          
          // Se chamada terminou, calcular duração
          const isEnded = ['DISCONNECTED', 'BUSY', 'FAILED', 'NO_ANSWER', 'REJECTED', 'UNREACHABLE', 'disconnected', 'busy', 'failed', 'no_answer', 'rejected', 'unreachable', 'ended'].includes(eventState);
          if (isEnded) {
            const startTime = startTimesRef.current.get(eventCallId);
            if (startTime) {
              const duration = Math.floor((Date.now() - startTime) / 1000);
              updateData.duration = duration;
              startTimesRef.current.delete(eventCallId);
              callMapRef.current.delete(eventCallId);
              console.log(`📞 [dialerCallStateChanged] Chamada terminada - duração: ${duration}s`);
            }
            
            // CORREÇÃO: Atualizar active_calls_count após chamada terminar
            // OTIMIZAÇÃO: Usar updateActiveCalls que já tem lógica de otimização
            setTimeout(async () => {
              await updateActiveCalls(false); // false = só atualiza se mudou
            }, 500);
          } else if ((eventState === 'ACTIVE' || eventState === 'active') && !startTimesRef.current.has(eventCallId)) {
            startTimesRef.current.set(eventCallId, Date.now());
            console.log(`📞 [dialerCallStateChanged] Tempo de início registrado para ${eventCallId}`);
          }
          
          // Atualizar banco
          const { error } = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', dbCallId);
          
          if (error) {
            console.error(`❌ [dialerCallStateChanged] Erro ao atualizar chamada ${dbCallId} para ${newStatus}:`, JSON.stringify(error, null, 2));
          } else {
            console.log(`✅ [dialerCallStateChanged] Chamada ${dbCallId} atualizada para ${newStatus}${updateData.duration ? ` (duração: ${updateData.duration}s)` : ''}`);
          }
        } catch (err: any) {
          console.error(`❌ [dialerCallStateChanged] Erro ao processar evento:`, JSON.stringify(err, null, 2));
        }
      });
      console.log(`✅ [dialerCallStateChanged] Listener registrado com sucesso! Handle:`, dialerListener);
      
      // Listener já foi marcado como pronto no início do setup (SYNC)
      // Não esperar por await para evitar race conditions
      
      const handles = await Promise.all([
        PbxMobile.addListener('callStateChanged', async (event) => {
          console.log('Event: callStateChanged', event);
          
          // Try to map native callId to database callId if not already mapped
          // This is needed for campaign calls where we create DB records before native calls
          if (!callMapRef.current.has(event.callId) && event.number) {
            const dbCallId = campaignNumberToDbCallIdRef.current.get(event.number);
            if (dbCallId) {
              callMapRef.current.set(event.callId, dbCallId);
              console.log(`🔗 Mapeado callId nativo ${event.callId} -> dbCallId ${dbCallId} para número ${event.number}`);
              // Remove from temporary map once mapped
              campaignNumberToDbCallIdRef.current.delete(event.number);
            }
          }
          
          if (event.state === 'disconnected') removeFromActive(event.callId);
          updateActiveCalls();
        }),
        PbxMobile.addListener('activeCallsChanged', async (event) => {
          console.log('Event: activeCallsChanged', event.calls);
          const currentCount = event.calls.length;
          setActiveCalls(event.calls);
          
          // CORREÇÃO: Usa função consolidada para atualizar banco (evita race conditions)
          await syncActiveCallsCountToDb(currentCount, false);
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
      
      // Incluir o dialerListener no array de handles para cleanup
      handles.push(dialerListener);
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
  // CORREÇÃO: Apenas verificar permissões, não pedir automaticamente
  useEffect(() => {
    if (user) {
      // Apenas verificar se já tem permissões, não pedir automaticamente
      checkDialerRole();
      // Verificar se tem todas as permissões (sem pedir)
      const checkPermissions = async () => {
        try {
          const dialerResult = await PbxMobile.hasRoleDialer()
          setHasDialerRole(dialerResult.hasRole)
          // Se tem dialer role, assumir que tem permissões necessárias
          setHasAllPermissions(dialerResult.hasRole)
          setIsConfigured(dialerResult.hasRole)
        } catch (error) {
          console.log('Erro ao verificar permissões:', error)
        }
      }
      checkPermissions()
    }
  }, [user]);

  useEffect(() => {
    // Update device name when deviceInfo changes
    // Prefer real device name from system, fallback to model
    const preferredName = deviceInfo.realDeviceName || deviceInfo.model;
    setDeviceName(preferredName);
  }, [deviceInfo]);

  // CORREÇÃO CRÍTICA: Subscription global para detectar despareamento do dashboard em tempo real
  // Escuta mudanças de status para TODOS os dispositivos do usuário, não só o deviceId atual
  useEffect(() => {
    if (!user?.id) return;

    // Subscription global para detectar quando o dashboard despareia o dispositivo
    const globalStatusSubscription = supabase
      .channel(`device-status-global-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'devices',
        filter: `user_id=eq.${user.id}` // Escuta TODOS os dispositivos do usuário
      }, (payload) => {
        const newStatus = payload.new?.status;
        const oldStatus = payload.old?.status;
        const updatedDeviceId = payload.new?.id;
        const currentDeviceId = deviceId;
        
        console.log('📡 Mudança de status detectada:', { 
          deviceId: updatedDeviceId, 
          oldStatus, 
          newStatus,
          currentDeviceId 
        });
        
        // Se o dispositivo atual foi marcado como 'unpaired' pelo dashboard
        if (updatedDeviceId === currentDeviceId && newStatus === 'unpaired') {
          console.log('⚠️ Dashboard despareou este dispositivo! Desconectando...');
          handleUnpaired(true); // true = despareamento do dashboard, não precisa atualizar banco
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(globalStatusSubscription);
    };
  }, [user?.id, deviceId]);

  useEffect(() => {
    if (deviceId && isPaired) {
      startHeartbeat();
      
      // CORREÇÃO: Atualizar chamadas ativas periodicamente quando pareado
      // OTIMIZAÇÃO: Intervalo aumentado para 30 segundos (antes era 2s) para reduzir carga no banco
      // As atualizações em tempo real via eventos já garantem sincronização imediata
      const activeCallsInterval = setInterval(() => {
        updateActiveCalls(false); // false = só atualiza se houver mudança
      }, 30000); // Atualiza a cada 30 segundos (verificação periódica de segurança)
      
      // Listen for real-time updates on device status (subscription específica do dispositivo)
      const subscription = supabase
        .channel(`device-status-${deviceId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
          filter: `id=eq.${deviceId}`
        }, (payload) => {
          console.log('Device status updated:', payload.new);
          // Check if device was unpaired from dashboard (verifica 'unpaired' ou 'offline' quando estava online)
          const newStatus = payload.new.status;
          const oldStatus = payload.old?.status;
          if (newStatus === 'unpaired') {
            console.log('⚠️ Status mudou para unpaired, desconectando...');
            handleUnpaired(true); // true = despareamento do dashboard, não precisa atualizar banco
          }
        })
        .subscribe();

      return () => {
        clearInterval(activeCallsInterval);
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

  /**
   * CORREÇÃO: Função consolidada para atualizar o banco com debounce
   * Evita race conditions quando múltiplas atualizações acontecem simultaneamente
   */
  const syncActiveCallsCountToDb = async (count: number, forceSync: boolean = false) => {
    if (!deviceId || !user) return;
    
    const lastCount = lastActiveCallsCountRef.current;
    
    // Só atualiza se o valor mudou OU se foi forçado
    if (!forceSync && lastCount !== null && lastCount === count) {
      return; // Valor não mudou, não precisa atualizar
    }
    
    // Cancela atualização pendente se houver
    if (dbUpdateTimeoutRef.current) {
      clearTimeout(dbUpdateTimeoutRef.current);
    }
    
    // Armazena o valor pendente
    pendingDbUpdateRef.current = count;
    
    // Debounce: aguarda 300ms antes de atualizar (consolida múltiplas atualizações)
    dbUpdateTimeoutRef.current = setTimeout(async () => {
      const countToUpdate = pendingDbUpdateRef.current;
      if (countToUpdate === null) return;
      
      try {
        await supabase
          .from('devices')
          .update({
            active_calls_count: countToUpdate,
            updated_at: new Date().toISOString()
          })
          .eq('id', deviceId)
          .eq('user_id', user.id);
        
        lastActiveCallsCountRef.current = countToUpdate;
        console.log(`📊 [syncActiveCallsCountToDb] Sincronizado active_calls_count: ${countToUpdate}${lastCount !== null && lastCount !== countToUpdate ? ` (anterior: ${lastCount})` : ''}`);
        pendingDbUpdateRef.current = null;
      } catch (error) {
        console.error('❌ [syncActiveCallsCountToDb] Erro ao sincronizar active_calls_count:', error);
      }
    }, forceSync ? 0 : 300); // Se forçado, atualiza imediatamente
  };

  const updateActiveCalls = async (forceSync: boolean = false) => {
    try {
      const result = await PbxMobile.getActiveCalls();
      const currentCount = result.calls.length;
      
      setActiveCalls(result.calls);
      
      // CORREÇÃO: Usa função consolidada para atualizar banco
      await syncActiveCallsCountToDb(currentCount, forceSync);
    } catch (error) {
      console.log('Error getting active calls:', error);
    }
  };

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
      
      // Map native callId to database call id (por callId e por número para fallback)
      callMapRef.current.set(callId, callData.id);
      campaignNumberToDbCallIdRef.current.set(number, callData.id);
      
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
      let dbCallId = callMapRef.current.get(callId);
      
      console.log(`📞 [endCall] Encerrando chamada manualmente: callId nativo=${callId}, dbCallId=${dbCallId}`);
      
      // CORREÇÃO: Se não encontrou o dbCallId no mapa, tentar buscar pelo número da chamada
      if (!dbCallId) {
        try {
          // Buscar a chamada ativa para pegar o número
          const activeCallsResult = await PbxMobile.getActiveCalls();
          const activeCall = activeCallsResult.calls.find((call: any) => call.callId === callId);
          
          if (activeCall && activeCall.number) {
            console.log(`📞 [endCall] Chamada ativa encontrada, número: ${activeCall.number}`);
            
            // Tentar encontrar pelo número no mapa de campanha
            dbCallId = campaignNumberToDbCallIdRef.current.get(activeCall.number);
            
            // Se ainda não encontrou, buscar no banco de dados pela combinação device_id + number + status ativo
            if (!dbCallId && deviceId) {
              const { data: callData, error: callError } = await supabase
                .from('calls')
                .select('id')
                .eq('device_id', deviceId)
                .eq('number', activeCall.number)
                .in('status', ['ringing', 'answered', 'active', 'dialing'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
              
              if (!callError && callData) {
                dbCallId = callData.id;
                // Mapear para uso futuro
                callMapRef.current.set(callId, dbCallId);
                campaignNumberToDbCallIdRef.current.set(activeCall.number, dbCallId);
                console.log(`✅ [endCall] dbCallId encontrado no banco: ${dbCallId}`);
              }
            }
            
            if (dbCallId) {
              console.log(`✅ [endCall] dbCallId encontrado via número: ${dbCallId}`);
              // Mapear para uso futuro
              callMapRef.current.set(callId, dbCallId);
            }
          }
        } catch (error) {
          console.error('❌ [endCall] Erro ao buscar dbCallId:', error);
        }
      }
      
      // End call via native plugin
      await PbxMobile.endCall({ callId });
      
      // CORREÇÃO: Atualizar o banco mesmo que o evento dialerCallStateChanged seja disparado depois
      // Isso garante que o dashboard veja a atualização imediatamente
      
      if (dbCallId) {
        // Atualizar imediatamente o status, mas o evento dialerCallStateChanged vai calcular a duração correta
        const startTime = startTimesRef.current.get(callId);
        const updateData: any = {
          status: 'ended',
          updated_at: new Date().toISOString()
        };
        
        // Se temos o startTime, calcular duração
        if (startTime) {
          const duration = Math.floor((Date.now() - startTime) / 1000);
          updateData.duration = duration;
          startTimesRef.current.delete(callId);
          console.log(`📞 [endCall] Duração calculada: ${duration}s`);
        }
        
        // Atualizar banco imediatamente para o dashboard ver rápido
        const { error: updateError } = await supabase
          .from('calls')
          .update(updateData)
          .eq('id', dbCallId);
        
        if (updateError) {
          console.error(`❌ [endCall] Erro ao atualizar chamada ${dbCallId} para 'ended':`, JSON.stringify(updateError, null, 2));
        } else {
          console.log(`✅ [endCall] Status atualizado no banco imediatamente para chamada ${dbCallId}`);
          
          // Sincronizar active_calls_count também
          // OTIMIZAÇÃO: Usar updateActiveCalls que já tem lógica de otimização
          await updateActiveCalls(false); // false = só atualiza se mudou
        }
        
        // O evento dialerCallStateChanged ainda vai ser disparado, mas o status já está 'ended'
        // então não vai causar problema (idempotente)
      } else {
        console.warn(`⚠️ [endCall] dbCallId não encontrado para callId ${callId} - banco não será atualizado imediatamente, aguardando evento dialerCallStateChanged`);
      }
      
      toast({
        title: "Chamada encerrada",
      });
    } catch (error) {
      console.error('❌ [endCall] Erro ao encerrar chamada:', error);
      toast({
        title: "Erro ao encerrar",
        description: "Não foi possível encerrar a chamada",
        variant: "destructive"
      });
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

  const handleUnpaired = async (fromDashboard: boolean = false) => {
    // CORREÇÃO: Parar heartbeat ANTES de tudo para evitar que setOffline() sobrescreva o status
    const currentDeviceId = deviceId;
    
    // IMPORTANTE: Parar heartbeat PRIMEIRO para evitar que useDeviceStatus chame setOffline()
    if (currentDeviceId) {
      stopHeartbeat();
    }
    
    // Se foi despareado pelo dashboard, não precisa atualizar o banco (já está 'unpaired')
    // Apenas limpar estado local
    if (!fromDashboard && currentDeviceId && user) {
      // Atualizar banco de dados com status 'unpaired' (despareamento manual do smartphone)
      try {
        console.log('🔌 Iniciando despareamento manual - Device ID:', currentDeviceId);
        const { data, error } = await supabase
          .from('devices')
          .update({ 
            status: 'unpaired',
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', currentDeviceId)
          .eq('user_id', user.id)
          .select(); // Retorna dados atualizados para confirmar
        
        if (error) {
          console.error('❌ Erro ao atualizar status do dispositivo:', error);
          toast({
            title: "Erro ao desparear",
            description: "Não foi possível atualizar o status do dispositivo",
            variant: "destructive"
          });
          return; // Não continua se houver erro
        } else {
          console.log('✅ Dispositivo marcado como unpaired no banco:', currentDeviceId, data);
        }
      } catch (error) {
        console.error('❌ Erro ao atualizar status do dispositivo:', error);
        toast({
          title: "Erro ao desparear",
          description: "Erro ao desconectar do dashboard",
          variant: "destructive"
        });
        return; // Não continua se houver erro
      }
    } else if (fromDashboard) {
      console.log('🔌 Despareamento detectado do dashboard, limpando estado local...');
    }
    
    // Por último: Limpar estado local e localStorage (isso fará o useDeviceStatus desmontar, mas já atualizamos o banco)
    // currentDeviceId já foi declarado no início da função
    setDeviceId(null);
    setIsConnected(false);
    setIsPaired(false);
    setIsConfigured(false);
    setSessionCode('');
    
    // CORREÇÃO: Limpar pareamento persistido do localStorage
    if (user) {
      localStorage.removeItem(`pbx_device_id_${user.id}`)
      // Limpar flag de permissões também
      if (currentDeviceId) {
        localStorage.removeItem(`pbx_permissions_requested_${currentDeviceId}`)
      }
      console.log('🗑️ Pareamento e permissões removidos do localStorage')
    }
    
    toast({
      title: "Dispositivo despareado",
      description: fromDashboard 
        ? "O dashboard desconectou este dispositivo" 
        : "O dispositivo foi desconectado do dashboard",
      variant: "default"
    });
  };

  const pairDevice = async (codeOverride?: string) => {
    // CORREÇÃO: Usar código fornecido como parâmetro ou o código do estado
    const codeToUse = codeOverride || sessionCode;
    
    // CORREÇÃO: Validar que codeToUse existe e não está vazio antes de processar
    if (!codeToUse || typeof codeToUse !== 'string') {
      console.error('❌ pairDevice - código inválido ou vazio:', { 
        codeOverride,
        sessionCode,
        codeToUse,
        type: typeof codeToUse 
      });
      toast({
        title: "Erro",
        description: "Código de sessão não encontrado. Escaneie o QR Code ou digite o código manualmente.",
        variant: "destructive"
      });
      return;
    }

    // CORREÇÃO: Limpar código antes de validar (remove espaços extras, quebras de linha, etc)
    const cleanedSessionCode = codeToUse.trim().replace(/\s+/g, '');
    
    console.log('🔍 pairDevice - INÍCIO:', {
      sessionCodeOriginal: sessionCode,
      sessionCodeCleaned: cleanedSessionCode,
      length: cleanedSessionCode.length
    });
    
    // CORREÇÃO: Verificar se cleanedSessionCode não está vazio após limpeza
    if (!cleanedSessionCode || cleanedSessionCode.length === 0) {
      console.error('❌ pairDevice - Código vazio após limpeza');
      toast({
        title: "Erro",
        description: "Código de sessão vazio. Escaneie o QR Code ou digite o código manualmente.",
        variant: "destructive"
      });
      return;
    }
    
    // CORREÇÃO: Extrair código de sessão usando a mesma função do QR code
    // Isso permite digitar tanto URL completa quanto código direto
    const extractedCode = extractSessionCode(cleanedSessionCode);
    
    console.log('🔍 pairDevice - Após extractSessionCode:', {
      extractedCode: extractedCode || '(null)',
      extractedType: typeof extractedCode,
      extractedLength: extractedCode?.length || 0,
      isValid: extractedCode && typeof extractedCode === 'string' && extractedCode.trim().length > 0
    });
    
    // CORREÇÃO: Validação mais rigorosa do código extraído
    if (!extractedCode || typeof extractedCode !== 'string' || extractedCode.trim().length === 0) {
      console.error('❌ Código de sessão inválido após extração:', { 
        original: sessionCode, 
        cleaned: cleanedSessionCode, 
        extracted: extractedCode,
        extractedType: typeof extractedCode,
        length: extractedCode?.length || 0
      });
      toast({
        title: "Erro",
        description: `Código de sessão inválido. Digite o código de 13 dígitos ou escaneie o QR Code novamente.`,
        variant: "destructive"
      });
      return;
    }

    // Normaliza o código extraído
    const cleanSessionCode = extractedCode.trim();
    
    // CORREÇÃO: Validação específica para código de 13 dígitos (timestamp)
    if (cleanSessionCode.length !== 13 || !/^\d{13}$/.test(cleanSessionCode)) {
      console.warn('⚠️ Código não tem exatamente 13 dígitos:', {
        code: cleanSessionCode,
        length: cleanSessionCode.length,
        isNumeric: /^\d+$/.test(cleanSessionCode)
      });
      // Mas continua mesmo assim, pois pode ser um formato válido alternativo
    }
    
    console.log('🔍 pairDevice - Código validado:', {
      cleanSessionCode,
      length: cleanSessionCode.length,
      is13Digits: cleanSessionCode.length === 13
    });
    
    if (!cleanSessionCode || cleanSessionCode.length === 0) {
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

    // CORREÇÃO: Declarar persistentDeviceId fora do try para estar disponível no catch
    let persistentDeviceId: string | null = null;
    
    try {
      // CORREÇÃO: Usar deviceId persistente para evitar problemas na primeira tentativa
      // IMPORTANTE: Salvar ANTES de fazer a requisição para garantir que existe na segunda tentativa
      const storageKey = `pbx_persistent_device_id_${user.id}`;
      persistentDeviceId = localStorage.getItem(storageKey);
      
      if (!persistentDeviceId) {
        // Criar novo UUID e salvar IMEDIATAMENTE antes da requisição
        persistentDeviceId = crypto.randomUUID();
        localStorage.setItem(storageKey, persistentDeviceId);
        console.log('🆕 Novo deviceId persistente criado e salvo ANTES da requisição:', persistentDeviceId);
      } else {
        console.log('♻️ DeviceId persistente reutilizado:', persistentDeviceId);
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

      // CORREÇÃO: Usar token de autenticação do Supabase em vez de token hardcoded
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || '';
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvdm5uZHZpeHF5bWZ2bnhrYmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzA4NzQsImV4cCI6MjA3MjAwNjg3NH0.wBLgUwk_VkwgPhyyh1Dk8dnAEtuTr8zl3fOxuWO1Scs";

      const response = await fetch(`https://jovnndvixqymfvnxkbep.supabase.co/functions/v1/pair-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken || SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY
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

      // CORREÇÃO: Verificar se success === true e se device.id existe (igual branch main)
      if (response.ok && data && data.success === true) {
        if (!data.device || !data.device.id) {
          throw new Error('Resposta do servidor inválida: dispositivo não retornado');
        }
        
        const newDeviceId = data.device.id
        
        // CORREÇÃO CRÍTICA: Atualizar status para 'online' IMEDIATAMENTE após pareamento
        // Isso garante que o dispositivo apareça no dashboard
        if (user && newDeviceId) {
          try {
            const { error: statusError } = await supabase
              .from('devices')
              .update({
                status: 'online',
                last_seen: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', newDeviceId)
              .eq('user_id', user.id)
            
            if (statusError) {
              console.error('❌ Erro ao atualizar status para online após pareamento:', statusError)
            } else {
              console.log('✅ Status atualizado para online após pareamento:', newDeviceId)
            }
          } catch (error) {
            console.error('❌ Erro ao atualizar status para online:', error)
          }
        }
        
        setDeviceId(newDeviceId);
        setIsConnected(true);
        setIsPaired(true);
        
        // CORREÇÃO: Salvar pareamento no localStorage para persistência
        if (user) {
          localStorage.setItem(`pbx_device_id_${user.id}`, newDeviceId)
          console.log('💾 Pareamento salvo no localStorage:', newDeviceId)
          
          // CORREÇÃO: Pedir permissões automaticamente apenas UMA VEZ após parear
          const permissionsRequestedKey = `pbx_permissions_requested_${newDeviceId}`
          const alreadyRequested = localStorage.getItem(permissionsRequestedKey)
          
          // Verificar permissões atuais
          const dialerResult = await PbxMobile.hasRoleDialer()
          setHasDialerRole(dialerResult.hasRole)
          setHasAllPermissions(dialerResult.hasRole)
          setIsConfigured(dialerResult.hasRole)
          
          // Se ainda não pediu e não tem permissões, pedir automaticamente UMA VEZ
          if (!alreadyRequested && !dialerResult.hasRole) {
            console.log('🔐 Pedindo permissões automaticamente pela primeira vez após pareamento...')
            // Salvar flag antes de pedir para evitar múltiplas tentativas
            localStorage.setItem(permissionsRequestedKey, 'true')
            
            try {
              // Pedir todas as permissões
              const permissionResult = await PbxMobile.requestAllPermissions()
              setHasAllPermissions(permissionResult.granted)
              
              if (permissionResult.granted) {
                // Pedir dialer role
                const roleResult = await PbxMobile.requestRoleDialer()
                setHasDialerRole(roleResult.granted)
                
                if (roleResult.granted) {
                  // Registrar phone account
                  await PbxMobile.registerPhoneAccount({ accountLabel: deviceName })
                  setIsConfigured(true)
                  
                  toast({
                    title: "Configurado!",
                    description: "App configurado automaticamente como discador padrão",
                    variant: "default"
                  })
                } else {
                  toast({
                    title: "Pareado!",
                    description: "Conceda a permissão de discador padrão quando solicitado",
                    variant: "default"
                  })
                }
              } else {
                toast({
                  title: "Permissões necessárias",
                  description: "Configure as permissões nas configurações do app",
                  variant: "destructive"
                })
              }
            } catch (error) {
              console.error('Erro ao pedir permissões automaticamente:', error)
              // Se der erro, remover flag para tentar novamente
              localStorage.removeItem(permissionsRequestedKey)
            }
          } else if (dialerResult.hasRole) {
            // Já tem permissões, mostrar toast de sucesso
            toast({
              title: "Sucesso!",
              description: `${deviceInfo.model} pareado e configurado com sucesso`,
              variant: "default"
            });
          } else {
            // Já pediu antes mas não tem, mostrar mensagem
            toast({
              title: "Pareado!",
              description: "Configure o app como discador padrão nas configurações",
              variant: "default"
            });
          }
        }
      } else {
        // CORREÇÃO: Log detalhado do erro para debug
        console.error('❌ Erro no pareamento - Resposta completa:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          data: data,
          error: data?.error,
          sessionCode: cleanSessionCode,
          sessionCodeLength: cleanSessionCode.length,
          deviceId: persistentDeviceId
        });
        
        // Mensagem de erro mais específica
        let errorMessage = data?.error || "Erro desconhecido no pareamento";
        
        // Se for erro 400, provavelmente é código inválido/expirado
        if (response.status === 400) {
          errorMessage = data?.error || "Código de sessão inválido ou expirado. Gere um novo QR Code no dashboard.";
        } else if (response.status === 500) {
          errorMessage = "Erro no servidor. Tente novamente em alguns instantes.";
        }
        
        toast({
          title: "Erro no pareamento",
          description: errorMessage,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      // CORREÇÃO: Log detalhado do erro de rede/exceção
      console.error('❌ Erro ao parear dispositivo - Exception:', {
        error,
        message: error?.message,
        stack: error?.stack,
        sessionCode: cleanSessionCode,
        sessionCodeLength: cleanSessionCode?.length,
        deviceId: persistentDeviceId
      });
      
      toast({
        title: "Erro",
        description: error?.message || "Falha na comunicação com o servidor. Verifique sua conexão e tente novamente.",
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
      
      if (extractedCode && typeof extractedCode === 'string' && extractedCode.trim().length > 0) {
        // Remove espaços e normaliza
        const cleanCode = extractedCode.trim();
        
        // CORREÇÃO: Atualizar estado E chamar pairDevice diretamente com o código
        // Isso evita race condition onde pairDevice é chamado antes do estado ser atualizado
        setSessionCode(cleanCode);
        
        toast({
          title: "Código extraído",
          description: `Código de sessão: ${cleanCode}`,
          variant: "default"
        });
        
        // CORREÇÃO: Chamar pairDevice diretamente com o código extraído
        // Não precisa esperar setTimeout, pois passamos o código como parâmetro
        console.log('🚀 Iniciando pareamento automático com código extraído...');
        await pairDevice(cleanCode);
      } else {
        console.error('❌ Não foi possível extrair código de sessão válido do valor:', {
          scannedValue,
          extractedCode,
          extractedType: typeof extractedCode,
          extractedLength: extractedCode?.length || 0
        });
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

  // Listen for commands from dashboard
  useEffect(() => {
    if (!deviceId || !isConnected) return;

    const subscription = supabase
      .channel('device-commands')
      .on('broadcast', { event: 'command' }, (payload) => {
        console.log('📡 [BROADCAST LISTENER] Comando recebido pelo dispositivo:', {
          device_id_recebido: payload.payload.device_id,
          device_id_esperado: deviceId,
          comando: payload.payload.command,
          dados: payload.payload.data
        });
        if (payload.payload.device_id === deviceId) {
          console.log(`✅ [BROADCAST LISTENER] Device ID correspondeu! Chamando handleCommand...`);
          handleCommand(payload.payload);
        } else {
          console.warn(`❌ [BROADCAST LISTENER] Device ID não correspondeu:`, payload.payload.device_id, 'vs', deviceId);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [deviceId, isConnected]);

  // PROFISSIONAL: Heartbeat bidirecional (ping/pong) - Responder aos pings do dashboard
  useEffect(() => {
    if (!deviceId || !user?.id || !isConnected) return;

    const heartbeatChannel = supabase
      .channel(`heartbeat-${user.id}`)
      .on('broadcast', { event: 'ping' }, async (payload) => {
        const { device_id, user_id, timestamp } = payload.payload;
        
        // Verificar se o ping é para este dispositivo
        if (device_id === deviceId && user_id === user.id) {
          console.log(`📡 Recebido ping do dashboard, enviando pong... (latência: ${Date.now() - timestamp}ms)`);
          
          // Atualizar last_seen no banco (heartbeat)
          try {
            await supabase
              .from('devices')
              .update({
                last_seen: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', deviceId)
              .eq('user_id', user.id);
          } catch (error) {
            console.error('Erro ao atualizar last_seen no heartbeat:', error);
          }
          
          // Responder com pong via broadcast
          try {
            const pongChannel = supabase.channel(`heartbeat-pong-${user.id}`);
            await pongChannel.send({
              type: 'broadcast',
              event: 'pong',
              payload: {
                device_id: deviceId,
                user_id: user.id,
                timestamp: Date.now(),
                original_ping_timestamp: timestamp
              }
            });
            console.log(`✅ Pong enviado ao dashboard`);
          } catch (error) {
            console.error('Erro ao enviar pong:', error);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(heartbeatChannel);
    };
  }, [deviceId, user?.id, isConnected]);

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
        console.log('🎯 [start_campaign] INCOMING COMMAND:', JSON.stringify(command, null, 2));
        console.log('🎯 [start_campaign] command.data:', command.data);
        console.log('🎯 [start_campaign] command.data.list:', command.data?.list);
        console.log('🎯 [start_campaign] command.data.list.numbers:', command.data?.list?.numbers);
        console.log('🎯 [start_campaign] numbers count:', command.data?.list?.numbers?.length || 0);
        
        // Verificar se o listener está pronto antes de iniciar a campanha
        let retryCount = 0;
        const maxRetries = 40; // 40 retries * 250ms = 10 segundos máximo (aumentado por causa de race conditions em alguns dispositivos)
        console.log(`⏳ [start_campaign] Estado inicial do listener: ${dialerListenerReadyRef.current} - aguardando readiness por até ${maxRetries * 250}ms`);
        while (!dialerListenerReadyRef.current && retryCount < maxRetries) {
          if (retryCount === 0) {
            console.warn(`⚠️ [start_campaign] Listener dialerCallStateChanged ainda não está pronto! Aguardando...`);
          }
          console.log(`⏳ [start_campaign] Retry ${retryCount + 1}/${maxRetries} - esperando listener estar pronto... (current=${dialerListenerReadyRef.current})`);
          await new Promise(resolve => setTimeout(resolve, 250));
          retryCount++;
        }
        
        if (!dialerListenerReadyRef.current) {
          console.error(`❌ [start_campaign] TIMEOUT: Listener dialerCallStateChanged não ficou pronto após ${maxRetries * 250}ms! (current=${dialerListenerReadyRef.current})`);
          toast({ 
            title: "Erro na Campanha", 
            description: "Sistema não está pronto. Tente novamente em alguns segundos.", 
            variant: "destructive" 
          });
          break;
        }
        
        console.log(`✅ [start_campaign] Listener dialerCallStateChanged está pronto (retry ${retryCount})`);
        
        if (command.data.list && command.data.list.numbers) {
          try {
            setCampaignName(command.data.listName);
            
            // Clear previous campaign mappings
            campaignNumberToDbCallIdRef.current.clear();
            
            // Create database records for each number BEFORE starting the campaign
            const numbersToCall: string[] = command.data.list.numbers;
            const sessionId = `campaign_${Date.now()}`;
            
            console.log(`📝 Criando ${numbersToCall.length} registros no banco antes de iniciar campanha...`);
            
            // Verificar autenticação antes de inserir
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
              console.error('❌ Erro ao verificar sessão:', sessionError);
              toast({ title: "Erro de Autenticação", description: "Não foi possível verificar a sessão", variant: "destructive" });
              return;
            }
            if (!session || !session.user) {
              console.error('❌ Nenhuma sessão ativa encontrada');
              toast({ title: "Erro de Autenticação", description: "Usuário não autenticado", variant: "destructive" });
              return;
            }
            
            console.log(`✅ Sessão ativa encontrada - User ID: ${session.user.id}`);
            console.log(`✅ User do hook: ${user?.id}`);
            console.log(`✅ Device ID: ${deviceId}`);
            
            if (session.user.id !== user?.id) {
              console.warn(`⚠️ ATENÇÃO: auth.uid() (${session.user.id}) !== user.id (${user?.id})`);
            }
            
            for (const number of numbersToCall) {
              try {
                console.log(`📤 Tentando inserir chamada no banco para ${number}...`);
                const insertData = {
                  user_id: session.user.id, // Usar o ID da sessão para garantir correspondência com auth.uid()
                  device_id: deviceId!,
                  number: number,
                  status: 'queued',
                  campaign_id: command.data.listId,
                  session_id: sessionId,
                  start_time: new Date().toISOString()
                };
                console.log(`📤 Dados para inserção:`, JSON.stringify(insertData, null, 2));
                
                const { data: dbCall, error: dbError } = await supabase
                  .from('calls')
                  .insert(insertData)
                  .select()
                  .single();

                if (dbError) {
                  // Log detalhado do erro - TODOS como strings para evitar [object Object]
                  const errorMsg = String(dbError.message || 'Sem mensagem');
                  const errorDetails = String(dbError.details || 'Sem detalhes');
                  const errorHint = String(dbError.hint || 'Sem hint');
                  const errorCode = String(dbError.code || 'Sem código');
                  
                  console.error(`❌ Erro ao criar registro para ${number}`);
                  console.error(`  Mensagem: ${errorMsg}`);
                  console.error(`  Detalhes: ${errorDetails}`);
                  console.error(`  Hint: ${errorHint}`);
                  console.error(`  Código: ${errorCode}`);
                  
                  // Tentar serializar o erro completo como JSON
                  try {
                    const errorJson = JSON.stringify({
                      message: errorMsg,
                      details: errorDetails,
                      hint: errorHint,
                      code: errorCode,
                      raw: dbError
                    }, null, 2);
                    console.error(`  Erro JSON: ${errorJson}`);
                  } catch (e) {
                    console.error(`  Erro ao serializar: ${String(e)}`);
                  }
                  
                  continue; // Skip this number but continue with others
                }

                if (!dbCall) {
                  console.error(`❌ Registro criado mas sem dados retornados para ${number}`);
                  continue;
                }

                // Store number -> dbCallId mapping for later use
                campaignNumberToDbCallIdRef.current.set(number, dbCall.id);
                console.log(`✅ Registro criado: ${number} -> ${dbCall.id}`);
              } catch (err: any) {
                const errorDetails = {
                  message: err?.message,
                  stack: err?.stack,
                  name: err?.name,
                  cause: err?.cause
                };
                console.error(`❌ Erro ao criar registro para ${number}:`, JSON.stringify(errorDetails, null, 2));
                console.error(`❌ Erro completo:`, JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
              }
            }

            // Now start the native campaign
            console.log(`🚀 [start_campaign] ABOUT TO CALL PbxMobile.startCampaign()`);
            console.log(`🚀 [start_campaign] Parameters:`, {
              numbersCount: numbersToCall.length,
              numbers: numbersToCall.slice(0, 10),  // First 10 for debugging
              deviceId,
              listId: command.data.listId,
              listName: command.data.listName,
              simId: selectedSimId
            });
            
            await PbxMobile.startCampaign({
              numbers: numbersToCall,
              deviceId: deviceId!,
              listId: command.data.listId,
              listName: command.data.listName,
              simId: selectedSimId
            });
            
            console.log(`✅ [start_campaign] PbxMobile.startCampaign() completed successfully`);
            
            setCampaignSummary(null); // Clear previous summary
            toast({ 
              title: "Campanha Iniciada", 
              description: `Iniciando chamadas para ${numbersToCall.length} números. ${campaignNumberToDbCallIdRef.current.size} registros criados no banco.` 
            });
          } catch (error: any) {
            const errorDetails = {
              message: error?.message,
              stack: error?.stack,
              name: error?.name,
              cause: error?.cause
            };
            console.error('❌ Erro ao iniciar campanha:', JSON.stringify(errorDetails, null, 2));
            console.error('❌ Erro completo:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            toast({ title: "Erro na Campanha", description: "Não foi possível iniciar a campanha", variant: "destructive" });
          }
        } else {
          console.error('Dados de campanha inválidos:', command.data);
          toast({ title: "Erro na Campanha", description: "Dados da lista de números são inválidos", variant: "destructive" });
        }
        break;
        
      case 'end_call':
        console.log('📥 Processando comando end_call do dashboard:', command.data);
        // End specific call
        try {
          if (!command.data.callId) {
            console.error('❌ [end_call] callId não fornecido no comando');
            toast({
              title: "Erro ao encerrar",
              description: "ID da chamada não fornecido",
              variant: "destructive"
            });
            break;
          }
          
          const dbCallId = command.data.callId; // ID do banco de dados
          console.log(`📥 [end_call] Buscando callId nativo para dbCallId: ${dbCallId}`);
          
          // CORREÇÃO: O dashboard envia o dbCallId, precisamos encontrar o callId nativo
          // Buscar no mapa reverso (dbCallId -> callId nativo)
          let nativeCallId: string | null = null;
          
          // 1. Tentar encontrar no mapa callMapRef (callId nativo -> dbCallId)
          for (const [nativeId, dbId] of callMapRef.current.entries()) {
            if (dbId === dbCallId) {
              nativeCallId = nativeId;
              console.log(`✅ [end_call] CallId nativo encontrado no mapa: ${nativeCallId}`);
              break;
            }
          }
          
          // 2. Se não encontrou no mapa, buscar nas chamadas ativas pelo número
          if (!nativeCallId) {
            console.log(`⚠️ [end_call] CallId nativo não encontrado no mapa, buscando nas chamadas ativas...`);
            try {
              // Buscar informações da chamada no banco para pegar o número
              const { data: callData, error: callError } = await supabase
                .from('calls')
                .select('number, device_id')
                .eq('id', dbCallId)
                .single();
              
              if (!callError && callData) {
                const callNumber = callData.number;
                console.log(`📥 [end_call] Número da chamada encontrado: ${callNumber}`);
                
                // Buscar nas chamadas ativas pelo número
                const activeCallsResult = await PbxMobile.getActiveCalls();
                const matchingCall = activeCallsResult.calls.find((call: any) => call.number === callNumber);
                
                if (matchingCall) {
                  nativeCallId = matchingCall.callId;
                  // Adicionar ao mapa para uso futuro
                  callMapRef.current.set(nativeCallId, dbCallId);
                  console.log(`✅ [end_call] CallId nativo encontrado nas chamadas ativas: ${nativeCallId}`);
                }
              }
            } catch (error) {
              console.error('❌ [end_call] Erro ao buscar informações da chamada:', error);
            }
          }
          
          if (!nativeCallId) {
            console.error(`❌ [end_call] Não foi possível encontrar callId nativo para dbCallId: ${dbCallId}`);
            toast({
              title: "Erro ao encerrar",
              description: "Chamada não encontrada no dispositivo. Ela pode já ter sido encerrada.",
              variant: "destructive"
            });
            // Ainda assim, atualizar o status no banco para 'ended' caso não esteja
            try {
              await supabase
                .from('calls')
                .update({ 
                  status: 'ended',
                  updated_at: new Date().toISOString()
                })
                .eq('id', dbCallId);
              console.log(`✅ [end_call] Status atualizado para 'ended' no banco mesmo sem encontrar chamada ativa`);
            } catch (dbError) {
              console.error('❌ [end_call] Erro ao atualizar status no banco:', dbError);
            }
            break;
          }
          
          console.log(`📞 [end_call] Encerrando chamada com callId nativo: ${nativeCallId}`);
          await PbxMobile.endCall({ callId: nativeCallId });
          
          // Atualizar banco de dados
          const startTime = startTimesRef.current.get(nativeCallId);
          const updateData: any = {
            status: 'ended',
            updated_at: new Date().toISOString()
          };
          
          if (startTime) {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            updateData.duration = duration;
            startTimesRef.current.delete(nativeCallId);
            console.log(`📞 [end_call] Duração calculada: ${duration}s`);
          }
          
          await supabase
            .from('calls')
            .update(updateData)
            .eq('id', dbCallId);
          
          // Remover do mapa
          callMapRef.current.delete(nativeCallId);
          
          // Atualizar contagem de chamadas ativas
          // OTIMIZAÇÃO: Usar updateActiveCalls que já tem lógica de otimização
          setTimeout(async () => {
            await updateActiveCalls(false); // false = só atualiza se mudou
          }, 500);
          
          console.log(`✅ [end_call] Chamada encerrada com sucesso`);
          toast({
            title: "Chamada encerrada",
            description: "Chamada encerrada pelo dashboard",
            variant: "default"
          });
        } catch (error) {
          console.error('❌ [end_call] Erro ao encerrar chamada:', error);
          toast({
            title: "Erro ao encerrar",
            description: error instanceof Error ? error.message : "Não foi possível encerrar a chamada",
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
        
      case 'stop_campaign':
        console.log('📥 Processando comando stop_campaign do dashboard');
        try {
          // Usar a mesma lógica do handleStopCampaign para garantir consistência
          await handleStopCampaign();
        } catch (error) {
          console.error('❌ [stop_campaign] Erro ao encerrar campanha:', error);
          toast({
            title: "Erro ao encerrar campanha",
            description: error instanceof Error ? error.message : "Não foi possível encerrar a campanha",
            variant: "destructive"
          });
        }
        break;
        
      case 'unpair':
        console.log('Processando comando unpair do dashboard');
        // Desparear dispositivo quando receber comando do dashboard
        await handleUnpaired();
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
  const handleStopCampaign = async () => {
    try {
      // 1. Parar campanha no native
      await PbxMobile.stopCampaign();
      
      // 2. Aguardar um pouco para as chamadas serem desconectadas
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 3. Buscar TODAS as chamadas ativas do dispositivo no banco e atualizar para 'ended'
      if (!deviceId) {
        console.warn('⚠️ [handleStopCampaign] deviceId não disponível, não é possível atualizar chamadas no banco');
        return;
      }
      
      console.log(`🛑 [handleStopCampaign] Buscando todas as chamadas ativas do dispositivo ${deviceId}...`);
      
      // Buscar todas as chamadas ativas do dispositivo que não estão como 'ended'
      const { data: activeCalls, error: fetchError } = await supabase
        .from('calls')
        .select('id, start_time, status')
        .eq('device_id', deviceId)
        .in('status', ['queued', 'dialing', 'ringing', 'answered']);
      
      if (fetchError) {
        console.error('❌ [handleStopCampaign] Erro ao buscar chamadas ativas:', fetchError);
      } else if (activeCalls && activeCalls.length > 0) {
        console.log(`📞 [handleStopCampaign] Encontradas ${activeCalls.length} chamadas ativas para atualizar`);
        
        // Atualizar cada chamada para 'ended' com duração calculada
        const updates = activeCalls.map(async (call) => {
          const updateData: any = {
            status: 'ended',
            updated_at: new Date().toISOString()
          };
          
          // Calcular duração se tiver start_time
          if (call.start_time) {
            const startTime = new Date(call.start_time).getTime();
            const duration = Math.floor((Date.now() - startTime) / 1000);
            updateData.duration = duration;
          }
          
          const { error: updateError } = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', call.id);
          
          if (updateError) {
            console.error(`❌ [handleStopCampaign] Erro ao atualizar chamada ${call.id}:`, updateError);
          } else {
            console.log(`✅ [handleStopCampaign] Chamada ${call.id} atualizada para 'ended' (status anterior: ${call.status})`);
          }
        });
        
        await Promise.all(updates);
        
        // Atualizar active_calls_count do dispositivo
        await updateActiveCalls(true); // force = true para garantir atualização
        
        console.log(`✅ [handleStopCampaign] Todas as ${activeCalls.length} chamadas foram atualizadas para 'ended'`);
      } else {
        console.log(`ℹ️ [handleStopCampaign] Nenhuma chamada ativa encontrada para atualizar`);
      }
      
      // Limpar mapeamentos da campanha
      campaignNumberToDbCallIdRef.current.clear();
      callMapRef.current.clear();
      
      toast({
        title: "Campanha encerrada",
        description: activeCalls && activeCalls.length > 0 
          ? `${activeCalls.length} chamada(s) foram atualizadas para encerradas`
          : "Campanha foi encerrada",
        variant: "default"
      });
    } catch (error) {
      console.error('❌ [handleStopCampaign] Erro ao encerrar campanha:', error);
      toast({
        title: "Erro ao encerrar campanha",
        description: error instanceof Error ? error.message : "Não foi possível encerrar a campanha",
        variant: "destructive"
      });
    }
  };

  if (isStandalone) {
    // CORREÇÃO: Mostrar discador apenas se estiver pareado E (configurado OU houver chamadas/campanha)
    // NUNCA mostrar discador se não estiver pareado (sempre mostrar primeira tela)
    const shouldShowDialer = isPaired && (
      (isConfigured && hasDialerRole) || 
      activeCalls.length > 0 || 
      campaignProgress !== null || 
      pendingCall !== null
    );
    
    if (shouldShowDialer) {
      const dialerProps = {
        deviceName,
        selectedSim: {
          id: selectedSim.id,
          name: selectedSim.displayName,
          operator: selectedSim.carrierName,
          type: selectedSim.type
        },
        activeCalls,
        onMakeCall: makeCall,
        onEndCall: endCall,
        onMergeActiveCalls: mergeActiveCalls,
        deviceModel: deviceInfo.model,
        campaignProgress,
        campaignName,
        onPauseCampaign: handlePauseCampaign,
        onResumeCampaign: handleResumeCampaign,
        onStopCampaign: handleStopCampaign
      };

      return (
        <div className="min-h-screen bg-background">
          {/* Seletor de visualização - fixo no topo */}
          <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b p-3 shadow-sm">
            <div className="max-w-md mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Label htmlFor="view-toggle" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  {useModernView ? (
                    <>
                      <LayoutGrid className="w-4 h-4" />
                      <span>Visualização Moderna</span>
                    </>
                  ) : (
                    <>
                      <LayoutList className="w-4 h-4" />
                      <span>Visualização Corporativa</span>
                    </>
                  )}
                </Label>
              </div>
              <Switch
                id="view-toggle"
                checked={useModernView}
                onCheckedChange={setUseModernView}
              />
            </div>
          </div>

          {/* Renderiza a view selecionada */}
          {useModernView ? (
            <ModernDialer {...dialerProps} />
          ) : (
            <CorporateDialer {...dialerProps} />
          )}
        </div>
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
                  <Button onClick={() => pairDevice()} className="w-full" disabled={!sessionCode.trim()}>
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