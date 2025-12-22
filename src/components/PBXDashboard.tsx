import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneCall, Users, Server, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { StatsBar } from './StatsBar';
import { QRCodeSection } from './QRCodeSection';
import { DevicesTab } from './DevicesTab';
import { CallsTab } from './CallsTab';
import { ListsTab } from './ListsTab';
import { useAuth } from '@/hooks/useAuth';
import { usePBXData, Device } from '@/hooks/usePBXData';
import { useToast } from '@/hooks/use-toast';
import { NewCallDialog } from './dialogs/NewCallDialog';
import { ConferenceDialog } from './dialogs/ConferenceDialog';
import { useDeviceValidation } from '@/hooks/useDeviceValidation';
import { useDeviceHeartbeat } from '@/hooks/useDeviceHeartbeat';
import { supabase } from '@/integrations/supabase/client';

const PBXDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const cleanupDoneRef = useRef<Set<string>>(new Set());

  const {
    devices,
    calls,
    lists,
    stats,
    loading,
    addDevice,
    updateDeviceStatus,
    removeDevice,
    addCall,
    updateCallStatus,
    deleteCall,
    deleteAllEndedCalls,
    addNumberList,
    updateNumberList,
    toggleListStatus,
    deleteNumberList,
    fetchOnlineDevices,
    fetchActiveCalls,
    fetchActiveLists,
    refetch
  } = usePBXData();

  // Initialize device validation with correct interface
  useDeviceValidation(devices, (deviceId: string, updates: Partial<Device>) => {
    updateDeviceStatus(deviceId, updates);
  });

  // PROFISSIONAL: Heartbeat bidirecional (ping/pong) - Verificação ativa de dispositivos
  console.log('🎯 [PBXDashboard] Chamando useDeviceHeartbeat com', devices.length, 'dispositivos')
  useDeviceHeartbeat({
    devices,
    onDeviceInactive: async (deviceId) => {
      console.log(`⚠️ Dispositivo ${deviceId} inativo (sem resposta a ping/pong)`)
      // Marcar como offline diretamente no banco
      try {
        const { error } = await supabase
          .from('devices')
          .update({
            status: 'offline',
            updated_at: new Date().toISOString()
          })
          .eq('id', deviceId)

        if (error) throw error
        console.log(`✅ Dispositivo ${deviceId} marcado como offline`)

        // Recarregar dispositivos para refletir mudanças
        await refetch()
      } catch (error) {
        console.error('Erro ao marcar dispositivo inativo:', error)
        // Fallback: marcar usando a função local
        await updateDeviceStatus(deviceId, { status: 'offline' })
      }
    }
  });

  const [wsConnected, setWsConnected] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionLink, setSessionLink] = useState<string>('');
  const [showNewCallDialog, setShowNewCallDialog] = useState(false);
  const [showConferenceDialog, setShowConferenceDialog] = useState(false);
  const [activeCampaignForAll, setActiveCampaignForAll] = useState(false);

  const generateQRCode = async () => {
    if (!user) return;

    const sessionId = Date.now().toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    try {
      // Salvar sessão no banco de dados
      const { error } = await supabase
        .from('qr_sessions')
        .insert({
          session_code: sessionId,
          user_id: user.id,
          expires_at: expiresAt.toISOString(),
          used: false
        });

      if (error) {
        console.error('Erro ao criar sessão QR:', error);
        toast({
          title: "Erro ao gerar QR Code",
          description: "Não foi possível criar a sessão de pareamento",
          variant: "destructive"
        });
        return;
      }

      const baseUrl = window.location.origin;
      const newQRCode = `${baseUrl}/mobile?session=${sessionId}&user=${user.id}&expires=${expiresAt.getTime()}`;
      const newSessionLink = `${baseUrl}/mobile?session=${sessionId}`;

      console.log('QR Code gerado e salvo:', newQRCode);
      setQrCode(newQRCode);
      setSessionLink(newSessionLink);

      toast({
        title: "QR Code Gerado",
        description: "Escaneie o código com seu dispositivo móvel",
      });

      // Auto-clear QR after 10 minutes
      setTimeout(() => {
        setQrCode(null);
        setSessionLink('');
      }, 10 * 60 * 1000);
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
      toast({
        title: "Erro ao gerar QR Code",
        description: "Ocorreu um erro inesperado",
        variant: "destructive"
      });
    }
  };

  const refreshQRCode = () => {
    generateQRCode();
  };

  // Send command to device via Supabase broadcast
  const sendCommandToDevice = async (deviceId: string, command: string, data: any) => {
    try {
      const channel = supabase.channel('device-commands');

      await channel.send({
        type: 'broadcast',
        event: 'command',
        payload: {
          device_id: deviceId,
          command,
          data,
          timestamp: Date.now()
        }
      });

      console.log(`Command sent to device ${deviceId}:`, command, data);
    } catch (error) {
      console.error('Error sending command to device:', error);
      toast({
        title: "Erro de Comunicação",
        description: "Não foi possível enviar comando para o dispositivo",
        variant: "destructive"
      });
    }
  };

  const handleDeviceAction = async (deviceId: string, action: string) => {
    // Handle bulk action
    if (deviceId === 'all' && action === 'refresh') {
      toast({ title: "Atualizando dados do banco..." });
      // CORREÇÃO: Recarregar dados do banco usando índices compostos, não forçar status
      await refetch();
      toast({ title: "Dados atualizados do banco" });
      return;
    }

    switch (action) {
      case 'refresh':
        // CORREÇÃO: Recarregar dados do banco usando índices, mostrar estado REAL do dispositivo
        toast({ title: "Atualizando dados do banco..." });
        await refetch(); // Recarrega todos os dados usando fetchDevices() que usa índices
        toast({ title: "Dados atualizados do banco" });
        break;
      case 'unpair':
        // Marcar como unpaired para que o app mobile detecte a desconexão
        await updateDeviceStatus(deviceId, { status: 'unpaired' });
        // Também enviar comando via broadcast para garantir
        await sendCommandToDevice(deviceId, 'unpair', {});
        break;
      case 'delete':
        await removeDevice(deviceId);
        break;
      default:
        console.log(`Unknown action: ${action} for device: ${deviceId}`);
    }
  };

  const handleCallAction = async (callId: string, action: string, data?: any) => {
    // Handle bulk actions first
    if (action === 'bulk') {
      switch (callId) {
        case 'hide-all':
          // Hide all ended calls that are not already hidden
          const endedCallsToHide = calls.filter(c => c.status === 'ended' && !c.hidden);
          console.log(`Ocultando ${endedCallsToHide.length} chamadas`);

          for (const endedCall of endedCallsToHide) {
            await updateCallStatus(endedCall.id, undefined, undefined, { hidden: true });
          }

          toast({
            title: "Histórico ocultado",
            description: `${endedCallsToHide.length} chamadas foram ocultadas`
          });
          return;

        case 'delete-all':
          // CORREÇÃO: Usa função de exclusão em massa mais eficiente
          await deleteAllEndedCalls();
          return;

        case 'create-list-from-successful':
          // Criar nova lista com os números das chamadas bem-sucedidas
          if (data?.numbers && data.numbers.length > 0) {
            const listName = `Chamadas Bem-Sucedidas ${new Date().toLocaleDateString('pt-BR')}`;
            await addNumberList(listName, data.numbers);
            toast({
              title: "Lista criada!",
              description: `Lista "${listName}" criada com ${data.numbers.length} números`
            });
          }
          return;

        case 'delete-successful':
          // Excluir chamadas bem-sucedidas específicas
          if (data?.callIds && data.callIds.length > 0) {
            for (const id of data.callIds) {
              await deleteCall(id);
            }
            toast({
              title: "Histórico excluído",
              description: `${data.callIds.length} chamadas bem-sucedidas foram removidas`
            });
          }
          return;
      }
    }

    // Handle "End All" action
    if (callId === 'all' && action === 'end') {
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000); // 5 minutos

      // Filtra apenas chamadas realmente ativas (não encerradas E criadas recentemente)
      // Chamadas muito antigas provavelmente já foram encerradas mas não atualizaram o status
      const activeCalls = calls.filter(c => {
        if (c.status === 'ended') return false;

        const callStartTime = new Date(c.start_time).getTime();
        const callAge = now - callStartTime;

        // Se a chamada está "ringing" há mais de 5 minutos, provavelmente já foi encerrada
        if (c.status === 'ringing' && callAge > fiveMinutesAgo) {
          return false;
        }

        // Se a chamada está "answered" há mais de 2 horas, provavelmente já foi encerrada
        if (c.status === 'answered' && callAge > (2 * 60 * 60 * 1000)) {
          return false;
        }

        return true;
      });

      console.log(`Encerrando ${activeCalls.length} chamadas ativas (filtradas de ${calls.filter(c => c.status !== 'ended').length} total)`);

      if (activeCalls.length === 0) {
        // Se havia chamadas mas foram filtradas, atualiza o status delas para 'ended'
        const staleCalls = calls.filter(c => {
          if (c.status === 'ended') return false;
          const callStartTime = new Date(c.start_time).getTime();
          const callAge = now - callStartTime;
          return (c.status === 'ringing' && callAge > fiveMinutesAgo) ||
            (c.status === 'answered' && callAge > (2 * 60 * 60 * 1000));
        });

        if (staleCalls.length > 0) {
          // Atualiza chamadas antigas para 'ended' sem tentar encerrar no dispositivo
          for (const staleCall of staleCalls) {
            const duration = Math.floor((now - new Date(staleCall.start_time).getTime()) / 1000);
            await updateCallStatus(staleCall.id, 'ended', duration);
          }

          toast({
            title: "Chamadas antigas atualizadas",
            description: `${staleCalls.length} chamada(s) antiga(s) foram marcadas como encerradas`
          });
        } else {
          toast({
            title: "Nenhuma chamada ativa",
            description: "Não há chamadas para encerrar",
            variant: "default"
          });
        }
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const activeCall of activeCalls) {
        try {
          const callStartTime = new Date(activeCall.start_time).getTime();
          const callAge = now - callStartTime;

          // Pula chamadas muito antigas (já devem ter sido encerradas)
          if ((activeCall.status === 'ringing' && callAge > fiveMinutesAgo) ||
            (activeCall.status === 'answered' && callAge > (2 * 60 * 60 * 1000))) {
            skippedCount++;
            // Marca como encerrada sem tentar encerrar no dispositivo
            const duration = Math.floor(callAge / 1000);
            await updateCallStatus(activeCall.id, 'ended', duration);
            continue;
          }

          const duration = Math.floor(callAge / 1000);
          await updateCallStatus(activeCall.id, 'ended', duration);

          // Send command to device to end call
          if (activeCall.device_id) {
            await sendCommandToDevice(activeCall.device_id, 'end_call', { callId: activeCall.id });
          }

          successCount++;
        } catch (error) {
          console.error(`Erro ao encerrar chamada ${activeCall.id}:`, error);
          errorCount++;
        }
      }

      let message = '';
      if (successCount > 0) {
        message = `${successCount} chamada(s) encerrada(s)`;
      }
      if (skippedCount > 0) {
        message += message ? `, ${skippedCount} atualizada(s) como encerrada(s)` : `${skippedCount} chamada(s) antiga(s) atualizada(s)`;
      }
      if (errorCount > 0) {
        message += message ? `, ${errorCount} erro(s)` : `${errorCount} erro(s)`;
      }

      toast({
        title: successCount > 0 ? "Chamadas processadas" : "Chamadas atualizadas",
        description: message || "Nenhuma chamada processada",
        variant: errorCount > 0 ? "destructive" : "default"
      });
      return;
    }

    const call = calls.find(c => c.id === callId);

    switch (action) {
      case 'new':
        setShowNewCallDialog(true);
        break;
      case 'conference':
        setShowConferenceDialog(true);
        break;
      case 'hide':
        await updateCallStatus(callId, undefined, undefined, { hidden: true });
        toast({ title: "Chamada ocultada do histórico" });
        break;
      case 'unhide':
        await updateCallStatus(callId, undefined, undefined, { hidden: false });
        toast({ title: "Chamada restaurada no histórico" });
        break;
      case 'delete':
        await deleteCall(callId);
        toast({ title: "Chamada excluída permanentemente" });
        break;
      default:
        if (!call) return;

        switch (action) {
          case 'answer':
            await updateCallStatus(callId, 'answered');
            // Send command to device if call has device_id
            if (call.device_id) {
              await sendCommandToDevice(call.device_id, 'answer_call', { callId });
            }
            break;
          case 'end':
            const duration = Math.floor((Date.now() - new Date(call.start_time).getTime()) / 1000);
            await updateCallStatus(callId, 'ended', duration);
            // Send command to device to end call
            if (call.device_id) {
              await sendCommandToDevice(call.device_id, 'end_call', { callId });
            }
            toast({
              title: "Chamada encerrada",
              description: "A chamada foi encerrada do dashboard"
            });
            break;
          case 'all':
            // End all active calls - OTIMIZADO: usa fetchActiveCalls
            const activeCallsOptimized = await fetchActiveCalls();
            for (const activeCall of activeCallsOptimized) {
              const callDuration = Math.floor((Date.now() - new Date(activeCall.start_time).getTime()) / 1000);
              await updateCallStatus(activeCall.id, 'ended', callDuration);
              // Send command to each device
              if (activeCall.device_id) {
                await sendCommandToDevice(activeCall.device_id, 'end_call', { callId: activeCall.id });
              }
            }
            toast({
              title: "Todas as chamadas encerradas",
              description: `${activeCallsOptimized.length} chamadas foram encerradas`
            });
            break;
          case 'mute':
            // Send mute command to device
            if (call.device_id) {
              await sendCommandToDevice(call.device_id, 'mute_call', { callId });
            }
            toast({ title: "Chamada silenciada" });
            break;
          case 'transfer':
            // Send transfer command to device
            if (call.device_id) {
              await sendCommandToDevice(call.device_id, 'transfer_call', { callId });
            }
            toast({ title: "Transferindo chamada..." });
            break;
        }
    }
  };

  // New call and conference handlers
  const handleMakeCall = async (number: string, deviceId?: string) => {
    await addCall(number, deviceId);
    toast({
      title: "Chamada iniciada",
      description: `Ligando para ${number}`
    });
  };

  const handleStartCampaign = async (listId: string, deviceIds: string[], shuffle: boolean) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    let numbers = [...list.numbers];
    if (shuffle) {
      // Shuffle array
      for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
      }
    }

    // Distribute calls across devices
    for (let i = 0; i < numbers.length; i++) {
      const deviceId = deviceIds[i % deviceIds.length];
      await addCall(numbers[i], deviceId);
    }

    // Se iniciou campanha em múltiplos dispositivos, ativa o estado para mostrar botão de encerrar
    if (deviceIds.length >= 2) {
      setActiveCampaignForAll(true);
    }

    toast({
      title: "Campanha iniciada",
      description: `${numbers.length} chamadas distribuídas entre ${deviceIds.length} dispositivos`
    });
  };

  const handleDistributeCalls = async (deviceIds: string[]) => {
    toast({
      title: "Distribuição configurada",
      description: `Novas chamadas serão distribuídas entre ${deviceIds.length} dispositivos`
    });
  };

  // NOVO: Encerrar todas as chamadas de um dispositivo específico
  const handleStopCampaign = async (deviceId: string) => {
    const now = Date.now();

    // Encontra todas as chamadas ativas deste dispositivo
    const deviceCalls = calls.filter(c =>
      c.device_id === deviceId &&
      c.status !== 'ended'
    );

    if (deviceCalls.length === 0) {
      toast({
        title: "Campanha encerrada",
        description: "Nenhuma chamada ativa encontrada para este dispositivo"
      });
      return;
    }

    // Marca todas as chamadas como encerradas
    // CORREÇÃO: Só atribui duração real para chamadas que foram ATENDIDAS
    // Chamadas que estavam apenas discando/tocando recebem duração 0
    for (const call of deviceCalls) {
      let duration = 0;

      // Só calcula duração se a chamada foi realmente atendida
      if (call.status === 'answered') {
        duration = Math.floor((now - new Date(call.start_time).getTime()) / 1000);
      }
      // Chamadas em 'dialing', 'ringing', 'queued' etc recebem duração 0

      await updateCallStatus(call.id, 'ended', duration);
    }

    toast({
      title: "Campanha encerrada",
      description: `${deviceCalls.length} chamada(s) foram encerradas`
    });
  };

  // NOVO: Encerrar todas as chamadas de TODOS os dispositivos online
  const handleStopCampaignAll = async () => {
    const now = Date.now();

    // Pegar todos os dispositivos online
    const onlineDeviceIds = devices
      .filter(d => d.status === 'online')
      .map(d => d.id);

    if (onlineDeviceIds.length === 0) {
      toast({
        title: "Nenhum dispositivo online",
        description: "Não há dispositivos online para encerrar campanhas",
        variant: "default"
      });
      setActiveCampaignForAll(false);
      return;
    }

    // Encontra todas as chamadas ativas de TODOS os dispositivos online
    const allActiveCalls = calls.filter(c =>
      onlineDeviceIds.includes(c.device_id || '') &&
      c.status !== 'ended'
    );

    if (allActiveCalls.length === 0) {
      toast({
        title: "Campanha encerrada",
        description: "Nenhuma chamada ativa encontrada"
      });
      setActiveCampaignForAll(false);
      return;
    }

    // Enviar comando stop_campaign para cada dispositivo
    for (const deviceId of onlineDeviceIds) {
      await sendCommandToDevice(deviceId, 'stop_campaign', {});
    }

    // Marca todas as chamadas como encerradas
    for (const call of allActiveCalls) {
      let duration = 0;

      // Só calcula duração se a chamada foi realmente atendida
      if (call.status === 'answered') {
        duration = Math.floor((now - new Date(call.start_time).getTime()) / 1000);
      }

      await updateCallStatus(call.id, 'ended', duration);
    }

    // Reseta o estado
    setActiveCampaignForAll(false);

    toast({
      title: "Campanhas encerradas",
      description: `${allActiveCalls.length} chamada(s) encerrada(s) em ${onlineDeviceIds.length} dispositivo(s)`
    });
  };

  const handleListAction = async (listId: string, action: string, data?: any) => {
    switch (action) {
      case 'create':
        if (data?.name && data?.numbers) {
          await addNumberList(data.name, data.numbers, data.ddiPrefix);
        }
        break;
      case 'toggle':
      case 'activate':
      case 'deactivate':
        await toggleListStatus(listId);
        break;
      case 'call':
        // Se deviceIds foi fornecido, usar sistema de campanha completo
        if (data?.deviceIds && Array.isArray(data.deviceIds)) {
          await handleStartCampaign(
            listId,
            data.deviceIds,
            data.shuffle !== undefined ? data.shuffle : true
          );
          return;
        }

        // Fallback: criar chamadas sem device_id (comportamento antigo)
        const list = lists.find(l => l.id === listId);
        if (!list) return;

        const ddiToUse = data?.ddiPrefix || list.ddi_prefix;

        if (ddiToUse) {
          toast({
            title: "Iniciando campanha",
            description: `Campanha iniciada para ${list.numbers.length} números com DDI ${ddiToUse}`
          });

          // Create calls for each number in the list (sem device_id)
          for (const number of list.numbers) {
            try {
              await addCall(`${ddiToUse}${number}`);
            } catch (error) {
              console.error('Error creating call:', error);
            }
          }
        } else {
          toast({
            title: "Erro",
            description: "Prefixo DDI não configurado para esta lista",
            variant: "destructive"
          });
        }
        break;
      case 'update':
        if (data) {
          // CORREÇÃO: Aguarda a atualização ser concluída
          // O toast já é exibido pela função updateNumberList
          await updateNumberList(listId, data.name, data.numbers, data.ddiPrefix);
        }
        break;
      case 'delete':
        await deleteNumberList(listId);
        break;
    }
  };

  // Convert database format to component format
  // SIMPLIFICADO: Apenas filtra 'unpaired', mostra todos os demais (online e offline)
  // A detecção de inatividade é feita pelo useDeviceHeartbeat.ts

  const formattedDevices = devices
    .filter(device => {
      // Remove apenas dispositivos 'unpaired'
      if (device.status === 'unpaired') {
        console.log(`🗑️ Removendo dispositivo 'unpaired': ${device.name} (${device.id})`)
        return false
      }
      return true
    })
    .map(device => ({
      id: device.id,
      name: device.name,
      status: device.status,
      pairedAt: device.paired_at,
      lastSeen: device.last_seen || undefined
    }));

  // REMOVIDO: Lógica de detecção de dispositivos inativos
  // A detecção de offline é feita EXCLUSIVAMENTE pelo useDeviceHeartbeat.ts
  // para evitar comportamento errático de duas lógicas competindo

  // Clean up stale calls (calls that are probably already ended but status wasn't updated)
  // CORREÇÃO: Agora mais agressivo - qualquer chamada não-ended com mais de 10 minutos é encerrada
  useEffect(() => {
    if (!calls.length || loading) return;

    const cleanupInterval = setInterval(async () => {
      const now = Date.now();
      const tenMinutesInMs = 10 * 60 * 1000; // 10 minutos

      const staleCalls = calls.filter(c => {
        if (c.status === 'ended') return false;
        if (cleanupDoneRef.current.has(c.id)) return false; // Já foi processada

        const callStartTime = new Date(c.start_time).getTime();
        const callAge = now - callStartTime;

        // CORREÇÃO: Qualquer chamada não-ended com mais de 10 minutos é considerada órfã
        // Isso inclui ringing, answered, dialing, queued, etc.
        if (callAge > tenMinutesInMs) {
          console.log(`🧹 Chamada órfã detectada: ${c.number} (status: ${c.status}, idade: ${Math.floor(callAge / 60000)} min)`);
          return true;
        }

        return false;
      });

      // Atualiza chamadas antigas em lote
      if (staleCalls.length > 0) {
        console.log(`🧹 Limpando ${staleCalls.length} chamadas órfãs...`);

        for (const staleCall of staleCalls) {
          cleanupDoneRef.current.add(staleCall.id);
          const duration = Math.floor((now - new Date(staleCall.start_time).getTime()) / 1000);
          await updateCallStatus(staleCall.id, 'ended', duration);
        }

        toast({
          title: "Chamadas órfãs limpas",
          description: `${staleCalls.length} chamada(s) antiga(s) foram marcadas como encerradas`
        });
      }
    }, 15000); // Executa a cada 15 segundos

    return () => clearInterval(cleanupInterval);
  }, [calls.length, loading, updateCallStatus, toast]);

  const formattedCalls = calls.map(call => {
    const device = devices.find(d => d.id === call.device_id);
    return {
      id: call.id,
      number: call.number,
      status: call.status,
      startTime: call.start_time,
      duration: call.duration || undefined,
      deviceId: call.device_id || undefined,
      deviceName: device?.name || 'Dispositivo Desconhecido',
      hidden: call.hidden || false
    };
  });

  const formattedLists = lists.map(list => ({
    id: list.id,
    name: list.name,
    numbers: list.numbers,
    createdAt: list.created_at,
    isActive: list.is_active,
    ddiPrefix: list.ddi_prefix
  }));

  return (
    <div className="min-h-screen bg-background">
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="space-y-4 w-full max-w-md">
            <div className="text-center">
              <Phone className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
              <h2 className="text-lg font-semibold">Carregando PBX Dashboard</h2>
              <p className="text-muted-foreground">Sincronizando dados...</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-3 md:px-6 py-2 md:py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 md:space-x-3">
                  <div className="p-1.5 md:p-2 bg-primary/10 rounded-lg">
                    <Phone className="h-4 w-4 md:h-6 md:w-6 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-base md:text-xl font-bold text-foreground">PBX Mobile</h1>
                    <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">Sistema de Controle</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 md:space-x-4">
                  <div className="hidden sm:flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                    <span className="text-xs md:text-sm text-muted-foreground">
                      {wsConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>

                  <Badge variant={stats.serverStatus === 'online' ? 'default' : 'destructive'} className="text-xs">
                    <Server className="w-3 h-3 mr-1" />
                    {stats.serverStatus === 'online' ? 'Online' : 'Offline'}
                  </Badge>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs md:text-sm text-muted-foreground hidden md:inline">{user?.email}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={signOut}
                      className="text-muted-foreground hover:text-foreground h-8 w-8 md:h-auto md:w-auto p-1 md:p-2"
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Stats Bar */}
          <StatsBar stats={stats} />

          {/* Main Content */}
          <main className="container mx-auto px-3 md:px-6 py-4 md:py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">

              {/* QR Code Section */}
              <div className="lg:col-span-1">
                <QRCodeSection
                  qrCode={qrCode}
                  sessionLink={sessionLink}
                  onGenerateQR={generateQRCode}
                  onRefreshQR={refreshQRCode}
                />
              </div>

              {/* Tabs Section */}
              <div className="lg:col-span-2">
                <Card className="bg-card/50 backdrop-blur-sm border-border shadow-lg">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold">Gerenciamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="devices" className="w-full">
                      <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="devices" className="flex items-center space-x-2">
                          <Phone className="w-4 h-4" />
                          <span>Dispositivos</span>
                        </TabsTrigger>
                        <TabsTrigger value="calls" className="flex items-center space-x-2">
                          <PhoneCall className="w-4 h-4" />
                          <span>Chamadas</span>
                        </TabsTrigger>
                        <TabsTrigger value="lists" className="flex items-center space-x-2">
                          <Users className="w-4 h-4" />
                          <span>Listas</span>
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="devices" className="mt-0">
                        <DevicesTab
                          devices={formattedDevices}
                          lists={formattedLists}
                          onDeviceAction={handleDeviceAction}
                          onGenerateQR={refreshQRCode}
                          onStartCampaignAll={(listId, deviceIds) => handleStartCampaign(listId, deviceIds, true)}
                          onStopCampaign={handleStopCampaign}
                          onStopCampaignAll={handleStopCampaignAll}
                          activeCampaignForAll={activeCampaignForAll}
                        />
                      </TabsContent>

                      <TabsContent value="calls" className="mt-0">
                        <CallsTab calls={formattedCalls} onCallAction={handleCallAction} />
                      </TabsContent>

                      <TabsContent value="lists" className="mt-0">
                        <ListsTab lists={formattedLists} devices={formattedDevices} onListAction={handleListAction} />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            </div>
          </main>

          {/* Dialogs */}
          <NewCallDialog
            open={showNewCallDialog}
            onOpenChange={setShowNewCallDialog}
            lists={formattedLists}
            devices={formattedDevices}
            onMakeCall={handleMakeCall}
            onStartCampaign={handleStartCampaign}
          />

          <ConferenceDialog
            open={showConferenceDialog}
            onOpenChange={setShowConferenceDialog}
            devices={formattedDevices.map(device => {
              const originalDevice = devices.find(d => d.id === device.id);
              return {
                ...device,
                active_calls_count: originalDevice?.active_calls_count || 0,
                internet_status: originalDevice?.internet_status,
                signal_status: originalDevice?.signal_status,
                line_blocked: originalDevice?.line_blocked
              };
            })}
            onDistributeCalls={handleDistributeCalls}
          />
        </>
      )}
    </div>
  );
};

export default PBXDashboard;