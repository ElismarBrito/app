/**
 * Hook para comunicação otimizada com dispositivos
 * 
 * Funcionalidades:
 * - Canais específicos por dispositivo
 * - Sistema de ACK/confirmação
 * - Processamento de comandos recebidos
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface DeviceCommand {
  id: string;
  device_id: string;
  command: string;
  data: any;
  timestamp: number;
}

export interface UseDeviceCommunicationOptions {
  deviceId: string | null;
  enabled: boolean;
  onCommand: (command: DeviceCommand) => Promise<void> | void;
}

/**
 * Hook para escutar comandos do dashboard em canal específico do dispositivo
 */
export const useDeviceCommunication = ({
  deviceId,
  enabled,
  onCommand
}: UseDeviceCommunicationOptions) => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const ackChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!deviceId || !enabled) {
      console.log('Device communication disabled:', { deviceId, enabled });
      return;
    }

    console.log('Setting up device communication for:', deviceId);

    // Canal para receber comandos do dashboard
    const commandsChannel = supabase.channel(`device:${deviceId}:commands`);
    
    // Canal para enviar ACKs de volta ao dashboard
    const ackChannel = supabase.channel(`device:${deviceId}:acks`);

    // Escuta comandos do dashboard
    commandsChannel
      .on('broadcast', { event: 'command' }, async (payload) => {
        const command = payload.payload as DeviceCommand;
        
        console.log('📥 Comando recebido:', {
          commandId: command.id,
          command: command.command,
          deviceId: command.device_id
        });

        // Envia ACK de recebimento imediatamente
        await ackChannel.send({
          type: 'broadcast',
          event: 'ack',
          payload: {
            command_id: command.id,
            device_id: deviceId,
            status: 'received',
            timestamp: Date.now()
          } as any
        });

        try {
          // Processa comando
          await onCommand(command);

          // Envia ACK de processamento bem-sucedido
          await ackChannel.send({
            type: 'broadcast',
            event: 'ack',
            payload: {
              command_id: command.id,
              device_id: deviceId,
              status: 'processed',
              timestamp: Date.now()
            } as any
          });

          console.log(`✅ Comando ${command.id} processado com sucesso`);
        } catch (error: any) {
          console.error(`❌ Erro ao processar comando ${command.id}:`, error);

          // Envia ACK de falha
          await ackChannel.send({
            type: 'broadcast',
            event: 'ack',
            payload: {
              command_id: command.id,
              device_id: deviceId,
              status: 'failed',
              error: error.message || 'Erro desconhecido',
              timestamp: Date.now()
            } as any
          });
        }
      })
      .subscribe((status) => {
        console.log('Commands channel subscription status:', status);
      });

    ackChannel.subscribe((status) => {
      console.log('ACK channel subscription status:', status);
    });

    channelRef.current = commandsChannel;
    ackChannelRef.current = ackChannel;

    return () => {
      console.log('Cleaning up device communication');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (ackChannelRef.current) {
        supabase.removeChannel(ackChannelRef.current);
        ackChannelRef.current = null;
      }
    };
  }, [deviceId, enabled, onCommand]);
};

