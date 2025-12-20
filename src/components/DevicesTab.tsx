import React, { useState } from 'react';
import { Smartphone, Wifi, WifiOff, MoreVertical, Trash2, RefreshCw, Phone, PhoneCall, List, QrCode, Square, Users2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface NumberList {
  id: string;
  name: string;
  numbers: string[];
  isActive: boolean;
  ddiPrefix?: string | null; // CORREÇÃO: Renomeado para camelCase (compatível com PBXDashboard)
}

interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'unpaired';
  pairedAt: string;
  lastSeen?: string;
}

interface DevicesTabProps {
  devices: Device[];
  lists: NumberList[];
  onDeviceAction: (deviceId: string, action: string) => void;
  onGenerateQR?: () => void;
  onStartCampaignAll?: (listId: string, deviceIds: string[]) => void;
  onStopCampaign?: (deviceId: string) => void;
  onStopCampaignAll?: () => void;
  activeCampaignForAll?: boolean;
}

export const DevicesTab: React.FC<DevicesTabProps> = ({
  devices,
  lists,
  onDeviceAction,
  onGenerateQR,
  onStartCampaignAll,
  onStopCampaign,
  onStopCampaignAll,
  activeCampaignForAll
}) => {
  const [callNumber, setCallNumber] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [isCallDialogOpen, setIsCallDialogOpen] = useState(false);
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [isCampaignAllDialogOpen, setIsCampaignAllDialogOpen] = useState(false);
  const [selectedListForAll, setSelectedListForAll] = useState<string | null>(null);

  // Dispositivos online
  const onlineDevices = devices.filter(d => d.status === 'online');

  const sendCommandToDevice = async (deviceId: string, command: any) => {
    try {
      await supabase
        .channel('device-commands')
        .send({
          type: 'broadcast',
          event: 'command',
          payload: {
            device_id: deviceId,
            ...command
          }
        });
    } catch (error) {
      console.error('Error sending command to device:', error);
    }
  };

  const handleMakeCall = async () => {
    if (!callNumber.trim() || !selectedDevice) return;

    await sendCommandToDevice(selectedDevice, {
      command: 'make_call',
      data: {
        number: callNumber
      }
    });

    setCallNumber('');
    setIsCallDialogOpen(false);
  };

  const handleStartCampaign = async () => {
    if (!selectedDevice || !selectedList) return;

    const list = lists.find(l => l.id === selectedList);
    if (!list) return;

    // CORREÇÃO: Aplica DDI prefix aos números se configurado
    const numbersWithDDI = list.ddiPrefix
      ? list.numbers.map(num => `${list.ddiPrefix}${num}`)
      : list.numbers;

    console.log(`📱 Iniciando campanha: DDI=${list.ddiPrefix || 'nenhum'}, ${numbersWithDDI.length} números`);
    console.log(`📱 Exemplo: ${list.numbers[0]} -> ${numbersWithDDI[0]}`);

    await sendCommandToDevice(selectedDevice, {
      command: 'start_campaign',
      data: {
        listId: selectedList,
        listName: list.name,
        list: {
          numbers: numbersWithDDI // CORREÇÃO: Envia números JÁ COM DDI
        }
      }
    });

    setSelectedList(null);
    setIsCampaignDialogOpen(false);
  };

  // NOVO: Iniciar campanha em TODOS os dispositivos online
  const handleStartCampaignAll = () => {
    if (!selectedListForAll || onlineDevices.length === 0) return;

    const deviceIds = onlineDevices.map(d => d.id);

    if (onStartCampaignAll) {
      onStartCampaignAll(selectedListForAll, deviceIds);
    }

    setSelectedListForAll(null);
    setIsCampaignAllDialogOpen(false);
  };

  const activeLists = lists.filter(list => list.isActive);

  if (devices.length === 0) {
    return (
      <div className="text-center py-12">
        <Smartphone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Nenhum dispositivo pareado</h3>
        <p className="text-muted-foreground mb-6">
          Gere um QR Code para parear seu primeiro dispositivo móvel
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">
          Dispositivos Pareados ({devices.length})
        </h3>
        <div className="flex items-center space-x-2">
          {/* Botão Iniciar/Encerrar Campanha em Todos - só aparece se há 2+ dispositivos online e listas ativas */}
          {onlineDevices.length >= 2 && activeLists.length > 0 && (
            activeCampaignForAll ? (
              // Botão de Encerrar Campanha (quando campanha está ativa)
              <Button
                variant="default"
                size="sm"
                onClick={() => onStopCampaignAll?.()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Square className="w-4 h-4 mr-2" />
                Encerrar Campanha ({onlineDevices.length})
              </Button>
            ) : (
              // Botão de Iniciar Campanha (quando não há campanha ativa)
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsCampaignAllDialogOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Users2 className="w-4 h-4 mr-2" />
                Iniciar em Todos ({onlineDevices.length})
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeviceAction('all', 'refresh')}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {devices.map((device) => (
          <div
            key={device.id}
            className="flex items-center justify-between p-4 border border-border rounded-lg bg-card/30 hover:bg-card/50 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className={`p-2 rounded-lg ${device.status === 'online'
                ? 'bg-success/10'
                : 'bg-muted/20'
                }`}>
                <Smartphone className={`w-5 h-5 ${device.status === 'online'
                  ? 'text-success'
                  : 'text-muted-foreground'
                  }`} />
              </div>

              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="font-medium text-foreground">{device.name}</h4>
                  <Badge
                    variant={device.status === 'online' ? 'default' : 'secondary'}
                    className={device.status === 'online'
                      ? 'bg-success/20 text-success-foreground border-success/30'
                      : undefined
                    }
                  >
                    <div className="flex items-center space-x-1">
                      {device.status === 'online' ? (
                        <Wifi className="w-3 h-3" />
                      ) : (
                        <WifiOff className="w-3 h-3" />
                      )}
                      <span className="capitalize">{device.status}</span>
                    </div>
                  </Badge>
                </div>

                <div className="flex flex-col space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Pareado {formatDistanceToNow(new Date(device.pairedAt), {
                      addSuffix: true
                    })}
                  </p>

                  {device.lastSeen && device.status === 'offline' && (
                    <p className="text-xs text-muted-foreground">
                      Visto pela última vez {formatDistanceToNow(new Date(device.lastSeen), {
                        addSuffix: true
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {device.status === 'online' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedDevice(device.id);
                        setIsCallDialogOpen(true);
                      }}
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Fazer Chamada
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedDevice(device.id);
                        setIsCampaignDialogOpen(true);
                      }}
                      disabled={activeLists.length === 0}
                    >
                      <PhoneCall className="w-4 h-4 mr-2" />
                      Iniciar Campanha
                      {activeLists.length === 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">(sem listas ativas)</span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        // Envia comando para o dispositivo parar
                        sendCommandToDevice(device.id, {
                          command: 'stop_campaign'
                        });
                        // Também encerra as chamadas no banco de dados
                        if (onStopCampaign) {
                          onStopCampaign(device.id);
                        }
                      }}
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Encerrar Campanha
                    </DropdownMenuItem>
                  </>
                )}

                {device.status === 'offline' && (
                  <DropdownMenuItem
                    onClick={() => onGenerateQR && onGenerateQR()}
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Gerar QR para Reativar
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => onDeviceAction(device.id, 'refresh')}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar Status
                </DropdownMenuItem>

                {device.status === 'offline' ? (
                  <DropdownMenuItem
                    onClick={() => onDeviceAction(device.id, 'delete')}
                    className="text-danger"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Permanentemente
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onDeviceAction(device.id, 'unpair')}
                    className="text-danger"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Desparear
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <div className="bg-muted/20 rounded-lg p-4">
          <h4 className="text-sm font-medium text-foreground mb-2">💡 Dicas</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Dispositivos online podem receber e fazer chamadas</li>
            <li>• Mantenha o app PBX Mobile sempre ativo no celular</li>
            <li>• Verifique a conexão Wi-Fi ou dados móveis</li>
          </ul>
        </div>
      </div>

      {/* Call Dialog */}
      <Dialog open={isCallDialogOpen} onOpenChange={setIsCallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fazer Chamada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="callNumber">Número de Telefone</Label>
              <Input
                id="callNumber"
                placeholder="Ex: (11) 99999-9999"
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsCallDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleMakeCall} disabled={!callNumber.trim()}>
                <Phone className="w-4 h-4 mr-2" />
                Ligar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Campaign Dialog */}
      <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar Campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Selecionar Lista Ativa</Label>
              <div className="space-y-2 mt-2">
                {activeLists.map((list) => (
                  <div
                    key={list.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedList === list.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                      }`}
                    onClick={() => setSelectedList(list.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{list.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {list.numbers.length} números
                        </p>
                      </div>
                      <List className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
                {activeLists.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma lista ativa disponível
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => {
                setIsCampaignDialogOpen(false);
                setSelectedList(null);
              }}>
                Cancelar
              </Button>
              <Button
                onClick={handleStartCampaign}
                disabled={!selectedList}
              >
                <PhoneCall className="w-4 h-4 mr-2" />
                Iniciar Campanha
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Campaign All Devices Dialog */}
      <Dialog open={isCampaignAllDialogOpen} onOpenChange={setIsCampaignAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Users2 className="w-5 h-5 text-green-600" />
              <span>Iniciar Campanha em Todos os Dispositivos</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>{onlineDevices.length} dispositivos online</strong> receberão as chamadas distribuídas automaticamente.
              </p>
            </div>

            <div>
              <Label>Selecionar Lista para Discagem</Label>
              <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                {activeLists.map((list) => (
                  <div
                    key={list.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedListForAll === list.id
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-border hover:bg-muted/50'
                      }`}
                    onClick={() => setSelectedListForAll(list.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{list.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {list.numbers.length} números
                          {list.ddiPrefix && ` • DDI: ${list.ddiPrefix}`}
                        </p>
                      </div>
                      <List className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
                {activeLists.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma lista ativa disponível. Crie uma lista na aba "Listas".
                  </p>
                )}
              </div>
            </div>

            {selectedListForAll && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Os <strong>{lists.find(l => l.id === selectedListForAll)?.numbers.length || 0} números</strong> serão
                  distribuídos entre os <strong>{onlineDevices.length} dispositivos</strong> automaticamente.
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => {
                setIsCampaignAllDialogOpen(false);
                setSelectedListForAll(null);
              }}>
                Cancelar
              </Button>
              <Button
                onClick={handleStartCampaignAll}
                disabled={!selectedListForAll}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Play className="w-4 h-4 mr-2" />
                Iniciar em {onlineDevices.length} Dispositivos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};