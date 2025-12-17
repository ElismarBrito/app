import React, { useState, useMemo } from 'react';
import { PhoneCall, Phone, PhoneOff, Clock, MoreVertical, Play, Pause, Square, Smartphone, Eye, EyeOff, Trash2, AlertTriangle, CheckCircle2, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Call {
  id: string;
  number: string;
  status: 'ringing' | 'answered' | 'ended';
  startTime: string;
  duration?: number;
  deviceId?: string;
  deviceName?: string;
  hidden?: boolean;
}

interface CallsTabProps {
  calls: Call[];
  onCallAction: (callId: string, action: string, data?: any) => void;
}

export const CallsTab: React.FC<CallsTabProps> = ({ calls, onCallAction }) => {
  const [showHidden, setShowHidden] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // CORREÇÃO: Filtra apenas chamadas REALMENTE ativas (em curso ou atendidas)
  // Exclui: ended, queued, e chamadas antigas
  const now = Date.now();
  const tenMinutesInMs = 10 * 60 * 1000; // 10 minutos

  const activesCalls = calls.filter(call => {
    // Só mostra chamadas com status ringing, dialing ou answered
    const isActiveStatus = ['ringing', 'dialing', 'answered'].includes(call.status);
    if (!isActiveStatus) return false;

    // Exclui chamadas muito antigas (mais de 10 min) - provavelmente órfãs
    const callStartTime = new Date(call.startTime).getTime();
    const callAge = now - callStartTime;
    if (callAge > tenMinutesInMs) return false;

    return true;
  });

  // CORREÇÃO: Histórico inclui chamadas ended E chamadas órfãs (antigas sem status ended)
  // Chamadas órfãs são aquelas com mais de 10 minutos e status diferente de ended
  const orphanCalls = calls.filter(call => {
    if (call.status === 'ended') return false;
    if (call.hidden) return false;
    const callStartTime = new Date(call.startTime).getTime();
    const callAge = now - callStartTime;
    return callAge > tenMinutesInMs; // Mais de 10 minutos = órfã
  });

  const endedCalls = calls.filter(call => call.status === 'ended' && !call.hidden);
  const allHistoryCalls = [...endedCalls, ...orphanCalls]; // Combina ended + órfãs
  const hiddenCalls = calls.filter(call => call.status === 'ended' && call.hidden);

  // NOVO: Chamadas bem-sucedidas (atendidas por mais de 1 minuto / 60 segundos)
  const successfulCalls = useMemo(() => {
    return calls.filter(call => {
      // Deve ser uma chamada encerrada
      if (call.status !== 'ended') return false;
      // Deve ter duração registrada maior que 60 segundos
      if (!call.duration || call.duration < 60) return false;
      // Não mostrar chamadas ocultas
      if (call.hidden) return false;
      return true;
    }).sort((a, b) => {
      // Ordenar por duração (maior primeiro)
      return (b.duration || 0) - (a.duration || 0);
    });
  }, [calls]);

  // Função para obter classe CSS da borda baseado no status
  const getStatusBorderClass = (status: string) => {
    switch (status) {
      case 'dialing':
        return 'border-2 border-yellow-500 animate-pulse shadow-lg shadow-yellow-500/20';
      case 'ringing':
        return 'border-2 border-yellow-400 animate-pulse shadow-lg shadow-yellow-400/20';
      case 'answered':
        return 'border-2 border-green-500 shadow-lg shadow-green-500/20';
      case 'queued':
        return 'border-2 border-purple-500';
      case 'ended':
        return 'border border-gray-300';
      default:
        return 'border border-border';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'dialing':
        return (
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-600 border-blue-500/30">
            <Phone className="w-3 h-3 mr-1 animate-pulse" />
            Discando
          </Badge>
        );
      case 'ringing':
        return (
          <Badge variant="secondary" className="bg-warning/20 text-warning-foreground border-warning/30">
            <Clock className="w-3 h-3 mr-1 animate-pulse" />
            Tocando
          </Badge>
        );
      case 'queued':
        return (
          <Badge variant="secondary" className="bg-purple-500/20 text-purple-600 border-purple-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Na Fila
          </Badge>
        );
      case 'answered':
        return (
          <Badge variant="default" className="bg-success/20 text-success-foreground border-success/30">
            <Phone className="w-3 h-3 mr-1" />
            Atendida
          </Badge>
        );
      case 'ended':
        return (
          <Badge variant="secondary">
            <PhoneOff className="w-3 h-3 mr-1" />
            Encerrada
          </Badge>
        );
      default:
        // Mostra o status desconhecido para debug
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-600">
            {status || 'Desconhecido'}
          </Badge>
        );
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (calls.length === 0) {
    return (
      <div className="text-center py-12">
        <PhoneCall className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma chamada registrada</h3>
        <p className="text-muted-foreground mb-6">
          As chamadas aparecerão aqui quando iniciadas
        </p>
        <Button
          onClick={() => onCallAction('new', 'start')}
          className="bg-primary hover:bg-primary/90"
        >
          <Phone className="w-4 h-4 mr-2" />
          Iniciar Nova Chamada
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Calls */}
      {activesCalls.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">
              Chamadas Ativas ({activesCalls.length})
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCallAction('all', 'end')}
              className="text-danger border-danger/30 hover:bg-danger/10"
            >
              <Square className="w-4 h-4 mr-2" />
              Encerrar Todas
            </Button>
          </div>

          <div className="space-y-3">
            {activesCalls.map((call) => (
              <div
                key={call.id}
                className={`flex items-center justify-between p-4 rounded-lg transition-all ${getStatusBorderClass(call.status)} ${call.status === 'answered'
                  ? 'bg-green-500/5'
                  : call.status === 'dialing' || call.status === 'ringing'
                    ? 'bg-yellow-500/5'
                    : 'bg-card/30'
                  }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-lg ${call.status === 'answered'
                    ? 'bg-green-500/20'
                    : call.status === 'dialing' || call.status === 'ringing'
                      ? 'bg-yellow-500/20'
                      : 'bg-muted/20'
                    }`}>
                    <PhoneCall className={`w-5 h-5 ${call.status === 'answered'
                      ? 'text-green-500'
                      : call.status === 'dialing' || call.status === 'ringing'
                        ? 'text-yellow-500'
                        : 'text-muted-foreground'
                      }`} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="font-medium text-foreground">{call.number}</h4>
                      {getStatusBadge(call.status)}
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>
                        Iniciada {formatDistanceToNow(new Date(call.startTime), {
                          addSuffix: true,
                          locale: ptBR
                        })}
                      </span>
                      {call.deviceName && (
                        <div className="flex items-center space-x-1">
                          <Smartphone className="w-3 h-3" />
                          <span>{call.deviceName}</span>
                        </div>
                      )}
                      {call.duration && (
                        <span className="font-mono">
                          {formatDuration(call.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {call.status === 'answered' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCallAction(call.id, 'hold')}
                    >
                      <Pause className="w-4 h-4" />
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {call.status === 'answered' && (
                        <>
                          <DropdownMenuItem
                            onClick={() => onCallAction(call.id, 'mute')}
                          >
                            <Pause className="w-4 h-4 mr-2" />
                            Silenciar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onCallAction(call.id, 'transfer')}
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Transferir
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem
                        onClick={() => onCallAction(call.id, 'end')}
                        className="text-danger"
                      >
                        <PhoneOff className="w-4 h-4 mr-2" />
                        Encerrar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chamadas Bem-Sucedidas (atendidas por mais de 1 minuto) */}
      {successfulCalls.length > 0 && (
        <div className="border-2 border-green-500/50 rounded-lg p-4 bg-green-500/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-foreground">
                Chamadas Bem-Sucedidas ({successfulCalls.length})
              </h3>
            </div>
            <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
              <Timer className="w-3 h-3 mr-1" />
              Duração {'>'} 1 min
            </Badge>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {successfulCalls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between p-3 border-2 border-green-500/30 rounded-lg bg-green-500/10"
              >
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <div>
                    <p className="font-medium text-foreground font-mono">{call.number}</p>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      {call.deviceName && (
                        <span className="flex items-center space-x-1">
                          <Smartphone className="w-3 h-3" />
                          <span>{call.deviceName}</span>
                        </span>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(call.startTime), {
                          addSuffix: true,
                          locale: ptBR
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-green-500 text-white font-mono">
                    <Timer className="w-3 h-3 mr-1" />
                    {formatDuration(call.duration || 0)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Resumo */}
          <div className="mt-3 pt-3 border-t border-green-500/30 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Total de tempo em chamadas bem-sucedidas:
            </span>
            <span className="font-mono font-medium text-green-600">
              {formatDuration(successfulCalls.reduce((acc, call) => acc + (call.duration || 0), 0))}
            </span>
          </div>
        </div>
      )}

      {/* Histórico de Chamadas / Recent Calls */}
      {allHistoryCalls.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">
              Histórico de Chamadas ({allHistoryCalls.length})
            </h3>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCallAction('hide-all', 'bulk')}
                className="text-muted-foreground"
              >
                <EyeOff className="w-4 h-4 mr-2" />
                Ocultar Todas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-danger border-danger/30 hover:bg-danger/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Apagar Todas ({allHistoryCalls.length})
              </Button>
              {hiddenCalls.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHidden(!showHidden)}
                  className="text-muted-foreground"
                >
                  {showHidden ? (
                    <>
                      <EyeOff className="w-4 h-4 mr-2" />
                      Ocultar Removidas
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Ver Removidas ({hiddenCalls.length})
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {(showHidden ? [...allHistoryCalls, ...hiddenCalls] : allHistoryCalls).slice(0, 20).map((call) => (
              <div
                key={call.id}
                className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${call.hidden
                  ? 'border-muted/50 bg-muted/10 opacity-60'
                  : 'border-border/50 bg-muted/20 hover:bg-muted/30'
                  }`}
              >
                <div className="flex items-center space-x-3">
                  <PhoneOff className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="font-medium text-foreground">{call.number}</p>
                      {call.hidden && (
                        <Badge variant="outline" className="text-xs bg-muted/20">
                          Oculta
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(call.startTime), {
                          addSuffix: true,
                          locale: ptBR
                        })}
                      </span>
                      {call.deviceName && (
                        <div className="flex items-center space-x-1">
                          <Smartphone className="w-3 h-3" />
                          <span>{call.deviceName}</span>
                        </div>
                      )}
                      {call.duration && (
                        <span className="font-mono">
                          {formatDuration(call.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {getStatusBadge(call.status)}
                  {/* Mantém menu individual apenas para chamadas ocultas */}
                  {call.hidden && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onCallAction(call.id, 'unhide')}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Restaurar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onCallAction(call.id, 'delete')}
                          className="text-danger"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="border-t border-border pt-6">
        <h4 className="text-sm font-medium text-foreground mb-3">Ações Rápidas</h4>
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => onCallAction('new', 'start')}
            variant="outline"
            className="justify-start"
          >
            <Phone className="w-4 h-4 mr-2" />
            Nova Chamada
          </Button>
          <Button
            onClick={() => onCallAction('conference', 'start')}
            variant="outline"
            className="justify-start"
          >
            <PhoneCall className="w-4 h-4 mr-2" />
            Conferência
          </Button>
        </div>
      </div>

      {/* Dialog de confirmação para apagar histórico */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-danger" />
              Apagar histórico de chamadas?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá excluir permanentemente <strong>{allHistoryCalls.length + hiddenCalls.length} chamada(s)</strong> do banco de dados.
              <br /><br />
              <span className="text-danger font-medium">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onCallAction('delete-all', 'bulk');
                setShowDeleteConfirm(false);
              }}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Sim, apagar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};