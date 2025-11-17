import React, { useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';

const PBXDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  
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
    addNumberList,
    updateNumberList,
    toggleListStatus,
    deleteNumberList,
    refetch
  } = usePBXData();

  // Initialize device validation with correct interface
  useDeviceValidation(devices, (deviceId: string, updates: Partial<Device>) => {
    updateDeviceStatus(deviceId, updates);
  });

  const [wsConnected, setWsConnected] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionLink, setSessionLink] = useState<string>('');
  const [showNewCallDialog, setShowNewCallDialog] = useState(false);
  const [showConferenceDialog, setShowConferenceDialog] = useState(false);

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

  // Send command to device via optimized communication service
  const sendCommandToDevice = async (deviceId: string, command: string, data: any) => {
    try {
      // Importa o serviço de comunicação dinamicamente
      const { deviceCommunicationService } = await import('@/lib/device-communication');
      
      const result = await deviceCommunicationService.sendCommand(
        deviceId,
        command,
        data,
        {
          timeout: 5000, // 5 segundos de timeout
          retries: 3 // 3 tentativas
        }
      );

      if (result.success) {
        console.log(`✅ Comando ${result.commandId} enviado com sucesso para dispositivo ${deviceId}`);
      } else {
        console.error(`❌ Erro ao enviar comando ${result.commandId}:`, result.error);
        toast({
          title: "Erro de Comunicação",
          description: result.error || "Não foi possível enviar comando para o dispositivo",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error sending command to device:', error);
      toast({
        title: "Erro de Comunicação",
        description: error.message || "Não foi possível enviar comando para o dispositivo",
        variant: "destructive"
      });
    }
  };

  const handleDeviceAction = async (deviceId: string, action: string) => {
    // Handle bulk action
    if (deviceId === 'all' && action === 'refresh') {
      toast({ title: "Atualizando todos os dispositivos..." });
      for (const device of devices) {
        await updateDeviceStatus(device.id, { status: 'online', last_seen: new Date().toISOString() });
      }
      toast({ title: "Dispositivos atualizados" });
      return;
    }

    switch (action) {
      case 'refresh':
        await updateDeviceStatus(deviceId, { status: 'online', last_seen: new Date().toISOString() });
        break;
      case 'unpair':
        await updateDeviceStatus(deviceId, { status: 'offline' });
        break;
      case 'delete':
        await removeDevice(deviceId);
        break;
      default:
        console.log(`Unknown action: ${action} for device: ${deviceId}`);
    }
  };

  const handleCallAction = async (callId: string, action: string) => {
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
          // Delete all ended calls (visible and hidden)
          const allEndedCalls = calls.filter(c => c.status === 'ended');
          console.log(`Excluindo ${allEndedCalls.length} chamadas`);
          
          for (const endedCall of allEndedCalls) {
            await deleteCall(endedCall.id);
          }
          
          toast({ 
            title: "Histórico apagado", 
            description: `${allEndedCalls.length} chamadas foram excluídas permanentemente` 
          });
          return;
      }
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
            // End all active calls
            const activeCalls = calls.filter(c => c.status !== 'ended');
            for (const activeCall of activeCalls) {
              const callDuration = Math.floor((Date.now() - new Date(activeCall.start_time).getTime()) / 1000);
              await updateCallStatus(activeCall.id, 'ended', callDuration);
              // Send command to each device
              if (activeCall.device_id) {
                await sendCommandToDevice(activeCall.device_id, 'end_call', { callId: activeCall.id });
              }
            }
            toast({
              title: "Todas as chamadas encerradas",
              description: `${activeCalls.length} chamadas foram encerradas`
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
          await updateNumberList(listId, data.name, data.numbers, data.ddiPrefix);
        }
        break;
      case 'delete':
        await deleteNumberList(listId);
        break;
    }
  };

  // Convert database format to component format
  const formattedDevices = devices.map(device => ({
    id: device.id,
    name: device.name,
    status: device.status,
    pairedAt: device.paired_at,
    lastSeen: device.last_seen || undefined
  }));

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
                        />
                      </TabsContent>
                      
                      <TabsContent value="calls" className="mt-0">
                        <CallsTab calls={formattedCalls} onCallAction={handleCallAction} />
                      </TabsContent>
                      
                      <TabsContent value="lists" className="mt-0">
                        <ListsTab lists={formattedLists} onListAction={handleListAction} />
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