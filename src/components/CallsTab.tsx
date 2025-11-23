import React, { useState } from 'react';
import { PhoneCall, Phone, PhoneOff, Clock, MoreVertical, Play, Pause, Square, Smartphone, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
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
  
  // Filtra chamadas ativas, excluindo chamadas antigas que provavelmente já foram encerradas
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000); // 5 minutos
  
  const activesCalls = calls.filter(call => {
    if (call.status === 'ended') return false;
    
    const callStartTime = new Date(call.startTime).getTime();
    const callAge = now - callStartTime;
    
    // Se a chamada está "ringing" há mais de 5 minutos, provavelmente já foi encerrada
    if (call.status === 'ringing' && callAge > fiveMinutesAgo) {
      return false;
    }
    
    // Se a chamada está "answered" há mais de 2 horas, provavelmente já foi encerrada
    if (call.status === 'answered' && callAge > (2 * 60 * 60 * 1000)) {
      return false;
    }
    
    return true;
  });
  
  const endedCalls = calls.filter(call => call.status === 'ended' && !call.hidden);
  const hiddenCalls = calls.filter(call => call.status === 'ended' && call.hidden);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ringing':
        return (
          <Badge variant="secondary" className="bg-warning/20 text-warning-foreground border-warning/30">
            <Clock className="w-3 h-3 mr-1 animate-pulse" />
            Tocando
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
        return null;
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
                className={`flex items-center justify-between p-4 border rounded-lg transition-all ${
                  call.status === 'ringing' 
                    ? 'border-warning/30 bg-warning/5 animate-pulse' 
                    : call.status === 'answered'
                    ? 'border-success/30 bg-success/5'
                    : 'border-border bg-card/30'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-lg ${
                    call.status === 'ringing' 
                      ? 'bg-warning/10' 
                      : call.status === 'answered'
                      ? 'bg-success/10'
                      : 'bg-muted/20'
                  }`}>
                    <PhoneCall className={`w-5 h-5 ${
                      call.status === 'ringing' 
                        ? 'text-warning' 
                        : call.status === 'answered'
                        ? 'text-success'
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

      {/* Recent Calls */}
      {endedCalls.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">
              Histórico de Chamadas ({endedCalls.length})
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
                onClick={() => onCallAction('delete-all', 'bulk')}
                className="text-danger border-danger/30 hover:bg-danger/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Apagar Todas
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
            {(showHidden ? [...endedCalls, ...hiddenCalls] : endedCalls).slice(0, 10).map((call) => (
              <div 
                key={call.id} 
                className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                  call.hidden 
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
    </div>
  );
};