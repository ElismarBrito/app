import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Phone, 
  PhoneOff, 
  Delete,
  Users,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CallInfo } from '@/plugins/pbx-mobile';

interface CorporateDialerProps {
  deviceName: string;
  selectedSim: {
    id: string;
    name: string;
    operator: string;
    type: 'physical' | 'esim';
  };
  activeCalls: CallInfo[];
  onMakeCall: (number: string) => void;
  onEndCall: (callId: string) => void;
  onMergeActiveCalls: () => void;
  deviceModel: string;
  campaignStatus?: {
    isActive: boolean;
    currentNumber?: string;
    totalNumbers?: number;
    completedCalls?: number;
  };
}

export const CorporateDialer = ({
  deviceName,
  selectedSim,
  activeCalls,
  onMakeCall,
  onEndCall,
  onMergeActiveCalls,
  deviceModel,
  campaignStatus
}: CorporateDialerProps) => {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');

  const dialpadNumbers = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#']
  ];

  const handleNumberPress = (number: string) => {
    setPhoneNumber(prev => prev + number);
  };

  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleCall = () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Número necessário",
        description: "Digite um número para fazer a chamada",
        variant: "destructive"
      });
      return;
    }

    onMakeCall(phoneNumber);
    setPhoneNumber('');
  };

  const handleEndAllCalls = () => {
    activeCalls.forEach(call => onEndCall(call.callId));
  };

  const hasActiveCalls = activeCalls.length > 0;
  const isInCampaign = campaignStatus?.isActive;


  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-primary-foreground p-4">
      <div className="max-w-md mx-auto space-y-4">
        
        {/* Header simplificado */}
        <Card className="bg-white/10 backdrop-blur-sm border-white/20">
          <CardContent className="p-4">
            <div className="text-center space-y-2">
              <Badge variant="default" className="bg-green-500/20 text-white border-green-500/30">
                Conectado
              </Badge>
              <p className="text-white/80 text-sm font-medium">{deviceName}</p>
              <div className="flex items-center justify-center gap-2 text-white/70 text-xs">
                <span className="flex items-center gap-1">
                  {selectedSim.type === 'physical' ? '📱' : '📶'} {selectedSim.name}
                </span>
                <span>•</span>
                <span>{selectedSim.operator}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status da Campanha */}
        {isInCampaign && (
          <Card className="bg-orange-500/10 backdrop-blur-sm border-orange-500/30">
            <CardContent className="p-4">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-white">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Campanha Ativa</span>
                </div>
                {campaignStatus?.currentNumber && (
                  <div className="text-white/80 text-sm">
                    <p>Ligando para: <span className="font-medium">{campaignStatus.currentNumber}</span></p>
                  </div>
                )}
                {campaignStatus?.totalNumbers && (
                  <div className="text-white/70 text-xs">
                    {campaignStatus.completedCalls || 0} de {campaignStatus.totalNumbers} chamadas
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chamadas ativas */}
        {activeCalls.length > 0 && (
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Chamadas Ativas ({activeCalls.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeCalls.map(call => (
                <div key={call.callId} className="flex items-center justify-between bg-white/5 rounded p-2">
                  <div className="text-white text-sm">
                    <p className="font-medium">{call.number}</p>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        call.state === 'active' ? 'bg-green-400' : 
                        call.state === 'dialing' ? 'bg-yellow-400' : 
                        call.state === 'ringing' ? 'bg-blue-400' : 'bg-gray-400'
                      }`} />
                      <p className="text-xs text-white/70 capitalize">
                        {call.state === 'dialing' ? 'Discando...' :
                         call.state === 'active' ? 'Conectada' :
                         call.state === 'ringing' ? 'Tocando' :
                         call.state === 'held' ? 'Em espera' : call.state}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onEndCall(call.callId)}
                    className="bg-red-500/20 border-red-500/30 hover:bg-red-500/30"
                  >
                    <PhoneOff className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {activeCalls.length > 1 && (
                <Button
                  onClick={onMergeActiveCalls}
                  className="w-full bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30 text-white"
                  size="sm"
                >
                  <Users className="w-3 h-3 mr-1" />
                  Conferência
                </Button>
              )}
              {activeCalls.length > 0 && (
                <Button
                  onClick={handleEndAllCalls}
                  className="w-full bg-red-500/20 border-red-500/30 hover:bg-red-500/30 text-white"
                  size="sm"
                >
                  <PhoneOff className="w-3 h-3 mr-1" />
                  Encerrar Todas
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Campo de entrada do número */}
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="text-center space-y-4">
              <div className="text-muted-foreground text-sm">Enter number</div>
              
              <div className="relative">
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Digite o número"
                  className="text-center text-lg h-12 bg-transparent border-muted-foreground/20"
                  type="tel"
                />
                {phoneNumber && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackspace}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <Delete className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Teclado numérico */}
              <div className="grid grid-cols-3 gap-3">
                {dialpadNumbers.flat().map((number) => (
                  <Button
                    key={number}
                    variant="outline"
                    size="lg"
                    onClick={() => handleNumberPress(number)}
                    className="h-14 text-xl font-semibold bg-white/50 hover:bg-white/70 border-muted-foreground/20 text-gray-900 hover:text-gray-900"
                  >
                    {number}
                  </Button>
                ))}
              </div>

              {/* Botões de ação */}
              <div className="flex justify-center gap-6 pt-4">
                {hasActiveCalls || isInCampaign ? (
                  <Button
                    onClick={handleEndAllCalls}
                    className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 shadow-lg"
                  >
                    <PhoneOff className="w-8 h-8" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleCall}
                    className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 shadow-lg"
                    disabled={!phoneNumber.trim()}
                  >
                    <Phone className="w-8 h-8" />
                  </Button>
                )}
              </div>

              {/* Opções rápidas */}
              {activeCalls.length > 1 && (
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onMergeActiveCalls}
                    className="flex-1 bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30 text-blue-700"
                  >
                    Conferência
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>


        {/* Footer com informações do dispositivo */}
        <div className="text-center text-white/60 text-xs space-y-1">
          <p>{deviceModel}</p>
          <p>Aguardando comandos do dashboard...</p>
        </div>
      </div>
    </div>
  );
};