import React, { useState } from 'react';
import { Phone, Shuffle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';

interface NumberList {
  id: string;
  name: string;
  numbers: string[];
  isActive: boolean;
  ddiPrefix?: string;
}

interface Device {
  id: string;
  name: string;
  status: string;
  active_calls_count?: number;
}

interface NewCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: NumberList[];
  devices: Device[];
  onMakeCall: (number: string, deviceId?: string) => void;
  onStartCampaign: (listId: string, deviceIds: string[], shuffle: boolean) => void;
}

export const NewCallDialog: React.FC<NewCallDialogProps> = ({
  open,
  onOpenChange,
  lists,
  devices,
  onMakeCall,
  onStartCampaign
}) => {
  const isMobile = useIsMobile();
  const [manualNumber, setManualNumber] = useState('');
  const [selectedList, setSelectedList] = useState<string>('');
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [shuffleNumbers, setShuffleNumbers] = useState(true);
  const [activeTab, setActiveTab] = useState('manual');

  const activeLists = lists.filter(list => list.isActive);
  const availableDevices = devices.filter(device => device.status === 'online');

  const handleManualCall = () => {
    if (!manualNumber.trim()) return;
    onMakeCall(manualNumber, selectedDevice || undefined);
    setManualNumber('');
    onOpenChange(false);
  };

  const handleCampaignStart = () => {
    if (!selectedList || selectedDevices.length === 0) return;
    onStartCampaign(selectedList, selectedDevices, shuffleNumbers);
    setSelectedList('');
    setSelectedDevices([]);
    onOpenChange(false);
  };

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const getDeviceCallsStatus = (device: Device) => {
    const calls = device.active_calls_count || 0;
    if (calls >= 6) return { color: 'bg-danger/20 text-danger-foreground', text: `${calls}/6 - Ocupado` };
    if (calls >= 4) return { color: 'bg-warning/20 text-warning-foreground', text: `${calls}/6 - Quase cheio` };
    return { color: 'bg-success/20 text-success-foreground', text: `${calls}/6 - Disponível` };
  };

  const dialogContent = (
    <>
      <div className="hidden md:block">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Phone className="w-5 h-5" />
            <span>Nova Chamada</span>
          </DialogTitle>
        </DialogHeader>
      </div>
      <div className="md:hidden">
        <DrawerHeader>
          <DrawerTitle className="flex items-center space-x-2">
            <Phone className="w-5 h-5" />
            <span>Nova Chamada</span>
          </DrawerTitle>
        </DrawerHeader>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Número Manual</TabsTrigger>
            <TabsTrigger value="campaign">Campanha</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Número de Telefone</Label>
              <Input
                id="phone"
                placeholder="Digite o número (ex: +5511999999999)"
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="device">Dispositivo (Opcional)</Label>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar dispositivo específico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Qualquer dispositivo disponível</SelectItem>
                  {availableDevices.map((device) => {
                    const status = getDeviceCallsStatus(device);
                    return (
                      <SelectItem 
                        key={device.id} 
                        value={device.id}
                        disabled={device.active_calls_count && device.active_calls_count >= 6}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{device.name}</span>
                          <Badge variant="outline" className={status.color}>
                            {status.text}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleManualCall} 
              disabled={!manualNumber.trim()}
              className="w-full"
            >
              <Phone className="w-4 h-4 mr-2" />
              Iniciar Chamada
            </Button>
          </TabsContent>

          <TabsContent value="campaign" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="list">Lista de Números</Label>
              <Select value={selectedList} onValueChange={setSelectedList}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar lista" />
                </SelectTrigger>
                <SelectContent>
                  {activeLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{list.name}</span>
                        <Badge variant="outline">
                          {list.numbers.length} números
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Dispositivos para Campanha</Label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                {availableDevices.map((device) => {
                  const status = getDeviceCallsStatus(device);
                  const isSelected = selectedDevices.includes(device.id);
                  const isDisabled = device.active_calls_count && device.active_calls_count >= 6;

                  return (
                    <div
                      key={device.id}
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelected 
                          ? 'border-primary bg-primary/5' 
                          : isDisabled 
                          ? 'border-danger/30 bg-danger/5 cursor-not-allowed' 
                          : 'border-border hover:bg-muted/20'
                      }`}
                      onClick={() => !isDisabled && toggleDevice(device.id)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-4 h-4 rounded border-2 ${
                          isSelected 
                            ? 'bg-primary border-primary' 
                            : 'border-muted-foreground'
                        }`} />
                        <span className={isDisabled ? 'text-muted-foreground' : 'text-foreground'}>
                          {device.name}
                        </span>
                      </div>
                      <Badge variant="outline" className={status.color}>
                        {status.text}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  id="shuffle"
                  checked={shuffleNumbers}
                  onCheckedChange={setShuffleNumbers}
                />
                <Label htmlFor="shuffle" className="flex items-center space-x-2">
                  <Shuffle className="w-4 h-4" />
                  <span>Embaralhar números</span>
                </Label>
              </div>
            </div>

            <Button 
              onClick={handleCampaignStart} 
              disabled={!selectedList || selectedDevices.length === 0}
              className="w-full"
            >
              <Phone className="w-4 h-4 mr-2" />
              Iniciar Campanha ({selectedDevices.length} dispositivos)
            </Button>
          </TabsContent>
        </Tabs>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] px-4 pb-8">
          {dialogContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
};