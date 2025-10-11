import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Call {
  id: string;
  number: string;
  status: string;
  start_time: string;
  created_at: string;
  duration: number;
  device_id: string;
}

export const CallHistoryManager = ({ deviceId }: { deviceId: string }) => {
  const { user } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (deviceId) {
      loadCallHistory();
      
      // Subscribe to real-time updates
      const subscription = supabase
        .channel('call-history')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'calls',
          filter: `device_id=eq.${deviceId}`
        }, () => {
          loadCallHistory();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [deviceId]);

  const loadCallHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('device_id', deviceId)
        .order('start_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCalls(data || []);
    } catch (error) {
      console.error('Error loading call history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      const { error } = await supabase
        .from('calls')
        .delete()
        .eq('device_id', deviceId);

      if (error) throw error;
      setCalls([]);
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  };

  const getCallIcon = (status: string) => {
    switch (status) {
      case 'answered':
      case 'completed':
        return <PhoneIncoming className="w-4 h-4 text-green-400" />;
      case 'ended':
        return <PhoneOutgoing className="w-4 h-4 text-blue-400" />;
      case 'missed':
      case 'failed':
        return <PhoneMissed className="w-4 h-4 text-red-400" />;
      default:
        return <Phone className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'answered': 'Atendida',
      'completed': 'Completada',
      'ended': 'Finalizada',
      'missed': 'Perdida',
      'failed': 'Falhou',
      'dialing': 'Discando',
      'ringing': 'Tocando'
    };
    return labels[status] || status;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardContent className="p-4 text-white/70 text-center">
          Carregando histórico...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Histórico de Chamadas ({calls.length})
          </CardTitle>
          {calls.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearHistory}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <div className="text-center text-white/60 text-sm py-4">
            Nenhuma chamada registrada
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between bg-white/5 rounded p-2 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getCallIcon(call.status)}
                    <div className="flex flex-col">
                      <span className="text-white text-sm font-medium">
                        {call.number}
                      </span>
                      <span className="text-white/50 text-xs">
                        {formatDistanceToNow(new Date(call.start_time), {
                          addSuffix: true,
                          locale: ptBR
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className="text-xs border-white/20 text-white/80"
                    >
                      {getStatusLabel(call.status)}
                    </Badge>
                    {call.duration !== null && (
                      <span className="text-white/50 text-xs">
                        {formatDuration(call.duration)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
