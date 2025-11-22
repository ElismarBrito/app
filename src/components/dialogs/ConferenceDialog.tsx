import React, { useState } from 'react';
import { Users, Phone, Wifi, WifiOff, Signal, SignalHigh, SignalLow, AlertTriangle } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';

interface Device {
  id: string;
  name: string;
  status: string;
  active_calls_count?: number;
  internet_status?: string;
  signal_status?: string;
  line_blocked?: boolean;
}

interface ConferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
  onDistributeCalls: (deviceIds: string[]) => void;
}

export const ConferenceDialog: React.FC<ConferenceDialogProps> = ({
  open,
  onOpenChange,
  devices,
  onDistributeCalls
}) => {
  const isMobile = useIsMobile();
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const getDeviceStatus = (device: Device) => {
    const calls = device.active_calls_count || 0;
    if (calls >= 6) return { color: 'bg-danger/20 text-danger-foreground border-danger/30', text: 'Ocupado', available: false };
    if (calls >= 4) return { color: 'bg-warning/20 text-warning-foreground border-warning/30', text: 'Quase Cheio', available: true };
    return { color: 'bg-success/20 text-success-foreground border-success/30', text: 'Disponível', available: true };
  };

  const getInternetIcon = (status?: string) => {
    switch (status) {
      case 'good': return <Wifi className="w-4 h-4 text-success" />;
      case 'poor': return <WifiOff className="w-4 h-4 text-warning" />;
      case 'offline': return <WifiOff className="w-4 h-4 text-danger" />;
      default: return <Wifi className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getSignalIcon = (status?: string) => {
    switch (status) {
      case 'excellent': return <SignalHigh className="w-4 h-4 text-success" />;
      case 'good': return <Signal className="w-4 h-4 text-success" />;
      case 'poor': return <SignalLow className="w-4 h-4 text-warning" />;
      case 'no_signal': return <SignalLow className="w-4 h-4 text-danger" />;
      default: return <Signal className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // OTIMIZADO: Filtra no cliente mas está preparado para usar fetchOnlineDevices
  // TODO: Refatorar para usar fetchOnlineDevices() do usePBXData
  const availableDevices = devices.filter(device => device.status === 'online');
  const offlineDevices = devices.filter(device => device.status === 'offline');
  const devicesSummary = {
    total: devices.length,
    online: availableDevices.length,
    available: availableDevices.filter(d => (d.active_calls_count || 0) < 6).length,
    full: availableDevices.filter(d => (d.active_calls_count || 0) >= 6).length,
    problems: availableDevices.filter(d => 
      d.internet_status === 'poor' || 
      d.internet_status === 'offline' || 
      d.signal_status === 'poor' || 
      d.signal_status === 'no_signal' || 
      d.line_blocked
    ).length
  };

  const handleDistribute = () => {
    if (selectedDevices.length === 0) return;
    onDistributeCalls(selectedDevices);
    setSelectedDevices([]);
    onOpenChange(false);
  };

  const dialogContent = (
    <>
      <div className="hidden md:block">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>Conferência - Gerenciar Dispositivos</span>
          </DialogTitle>
        </DialogHeader>
      </div>
      <div className="md:hidden">
        <DrawerHeader>
          <DrawerTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>Gerenciar Dispositivos</span>
          </DrawerTitle>
        </DrawerHeader>
      </div>

      {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{devicesSummary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-success">{devicesSummary.online}</div>
              <div className="text-xs text-muted-foreground">Online</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-primary">{devicesSummary.available}</div>
              <div className="text-xs text-muted-foreground">Disponível</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-warning">{devicesSummary.full}</div>
              <div className="text-xs text-muted-foreground">Ocupado</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-danger">{devicesSummary.problems}</div>
              <div className="text-xs text-muted-foreground">Problemas</div>
            </CardContent>
          </Card>
        </div>

        {/* Online Devices */}
        {availableDevices.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Dispositivos Online ({availableDevices.length})
              </h3>
              <div className="text-sm text-muted-foreground">
                {selectedDevices.length} selecionados
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {availableDevices.map((device) => {
                const status = getDeviceStatus(device);
                const isSelected = selectedDevices.includes(device.id);
                const hasProblems = device.internet_status === 'poor' || 
                                  device.internet_status === 'offline' || 
                                  device.signal_status === 'poor' || 
                                  device.signal_status === 'no_signal' || 
                                  device.line_blocked;

                return (
                  <Card
                    key={device.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:bg-muted/20'
                    }`}
                    onClick={() => status.available && toggleDevice(device.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`w-4 h-4 rounded border-2 ${
                            isSelected 
                              ? 'bg-primary border-primary' 
                              : 'border-muted-foreground'
                          }`} />
                          <div>
                            <h4 className="font-medium text-foreground">{device.name}</h4>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline" className={status.color}>
                                {device.active_calls_count || 0}/6 - {status.text}
                              </Badge>
                              {hasProblems && (
                                <AlertTriangle className="w-4 h-4 text-warning" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center space-x-2">
                          {getInternetIcon(device.internet_status)}
                          <span className="text-muted-foreground">Internet</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getSignalIcon(device.signal_status)}
                          <span className="text-muted-foreground">Sinal</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={`w-4 h-4 rounded-full ${
                            device.line_blocked ? 'bg-danger' : 'bg-success'
                          }`} />
                          <span className="text-muted-foreground">
                            {device.line_blocked ? 'Bloqueada' : 'Liberada'}
                          </span>
                        </div>
                      </div>

                      {hasProblems && (
                        <div className="mt-3 p-2 bg-warning/10 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="w-4 h-4 text-warning" />
                            <span className="text-sm text-warning-foreground">
                              Dispositivo com problemas detectados
                            </span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Offline Devices */}
        {offlineDevices.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-muted-foreground">
                Dispositivos Offline ({offlineDevices.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {offlineDevices.map((device) => (
                  <Card key={device.id} className="opacity-60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-muted-foreground">{device.name}</h4>
                          <Badge variant="outline" className="bg-muted/20 text-muted-foreground border-muted">
                            Desconectado
                          </Badge>
                        </div>
                        <WifiOff className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

      {/* Actions */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pt-4 border-t border-border">
        <div className="text-sm text-muted-foreground">
          Selecione os dispositivos para distribuir novas ligações
        </div>
        <Button 
          onClick={handleDistribute}
          disabled={selectedDevices.length === 0}
          className="w-full md:w-auto"
        >
          <Phone className="w-4 h-4 mr-2" />
          Distribuir Ligações ({selectedDevices.length})
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] px-4 pb-8 overflow-y-auto">
          {dialogContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
};