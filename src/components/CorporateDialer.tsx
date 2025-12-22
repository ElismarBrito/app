import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Phone,
  PhoneOff,
  Delete,
  Users,
  Clock,
  Play,
  Pause,
  Square
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CallInfo, CampaignProgress } from '@/plugins/pbx-mobile';

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
  campaignProgress: CampaignProgress | null;
  campaignName: string;
  onPauseCampaign: () => void;
  onResumeCampaign: () => void;
  onStopCampaign: () => void;
}

export const CorporateDialer = ({
  deviceName,
  selectedSim,
  activeCalls,
  onMakeCall,
  onEndCall,
  onMergeActiveCalls,
  deviceModel,
  campaignProgress,
  campaignName,
  onPauseCampaign,
  onResumeCampaign,
  onStopCampaign
}: CorporateDialerProps) => {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isCampaignPaused, setIsCampaignPaused] = useState(false);

  // Monitora mudanças em activeCalls para garantir renderização
  useEffect(() => {
    if (activeCalls.length > 0) {
      console.log('📱 CorporateDialer - Chamadas ativas:', activeCalls.length);
    }
  }, [activeCalls]);

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
    console.log('📴 [CorporateDialer] handleEndAllCalls chamado. campaignProgress =', campaignProgress ? 'ATIVO' : 'null');

    // CORREÇÃO CRÍTICA: SEMPRE parar a campanha quando este botão é clicado
    // Não depende mais do estado de campaignProgress, pois pode estar dessincronizado
    // O stopCampaign no nativo é seguro de chamar mesmo sem campanha ativa
    console.log('🛑 [CorporateDialer] Chamando onStopCampaign() para garantir parada completa');
    onStopCampaign();

    // Também encerrar chamadas individualmente como fallback
    if (activeCalls.length > 0) {
      console.log('📞 [CorporateDialer] Encerrando chamadas individualmente como fallback');
      activeCalls.forEach(call => onEndCall(call.callId));
    }
  };

  const handlePause = () => {
    onPauseCampaign();
    setIsCampaignPaused(true);
  };

  const handleResume = () => {
    onResumeCampaign();
    setIsCampaignPaused(false);
  };

  const hasActiveCalls = activeCalls.length > 0;
  const isInCampaign = !!campaignProgress;


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
        {isInCampaign && campaignProgress && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Play className="h-5 w-5" />
                Campanha em Andamento
              </CardTitle>
              <CardDescription>Discador automático ativo para a lista: <strong>{campaignName}</strong></CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-muted-foreground">Progresso</span>
                  <span className="text-sm font-bold">{campaignProgress.completedNumbers} / {campaignProgress.totalNumbers}</span>
                </div>
                <Progress value={campaignProgress.progressPercentage} className="w-full" />
              </div>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-2 border rounded-lg">
                  <p className="text-2xl font-bold">{campaignProgress.activeCallsCount}</p>
                  <p className="text-xs text-muted-foreground">Chamadas Ativas</p>
                </div>
                <div className="p-2 border rounded-lg">
                  <p className="text-2xl font-bold">{campaignProgress.totalNumbers}</p>
                  <p className="text-xs text-muted-foreground">Números na Lista</p>
                </div>
              </div>

              {/* CORREÇÃO: Mostra cada ligação em tempo real com estado detalhado */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">Ligações em Andamento:</p>
                {activeCalls.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {/* CORREÇÃO: Ordena por startTime (mais recente primeiro) para aparecer na ordem correta */}
                    {activeCalls
                      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                      .map(call => (
                        <div key={call.callId} className="flex items-center justify-between p-2 bg-muted/50 rounded border">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{call.number}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`w-2 h-2 rounded-full ${call.state === 'active' ? 'bg-green-500 animate-pulse' :
                                call.state === 'dialing' ? 'bg-yellow-500 animate-pulse' :
                                  call.state === 'ringing' ? 'bg-blue-500 animate-pulse' :
                                    'bg-gray-400'
                                }`} />
                              <p className="text-xs text-muted-foreground capitalize">
                                {call.state === 'dialing' ? 'Discando...' :
                                  call.state === 'active' ? 'Conectada' :
                                    call.state === 'ringing' ? 'Tocando' :
                                      call.state === 'held' ? 'Em espera' : call.state}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEndCall(call.callId)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <PhoneOff className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                  </div>
                ) : campaignProgress.dialingNumbers && campaignProgress.dialingNumbers.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {campaignProgress.dialingNumbers.map(num => (
                      <Badge key={num} variant="secondary" className="animate-pulse">{num}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Aguardando próxima ligação...</p>
                )}
              </div>

              <div className="flex gap-2 justify-center">
                {isCampaignPaused ? (
                  <Button onClick={handleResume} size="lg" className="flex-1 bg-green-600 hover:bg-green-700">
                    <Play className="h-5 w-5 mr-2" />
                    Retomar
                  </Button>
                ) : (
                  <Button onClick={handlePause} size="lg" variant="secondary" className="flex-1">
                    <Pause className="h-5 w-5 mr-2" />
                    Pausar
                  </Button>
                )}
                <Button onClick={onStopCampaign} size="lg" variant="destructive" className="flex-1">
                  <Square className="h-5 w-5 mr-2" />
                  Parar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chamadas ativas - Mostra sempre que há chamadas, mesmo durante campanha */}
        {activeCalls.length > 0 && (
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Chamadas Ativas ({activeCalls.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeCalls
                .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                .map(call => (
                  <div key={call.callId} className="flex items-center justify-between bg-white/5 rounded p-2">
                    <div className="text-white text-sm">
                      <p className="font-medium">{call.number}</p>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${call.state === 'active' ? 'bg-green-400' :
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
                  className="text-center text-lg h-12 bg-transparent border-muted-foreground/20 text-gray-900"
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
        <div className="text-center text-white/80 text-xs space-y-1 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
          <p>{deviceModel}</p>
          <p>Aguardando comandos do dashboard...</p>
        </div>
      </div>
    </div>
  );
};