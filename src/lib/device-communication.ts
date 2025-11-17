/**
 * Serviço de comunicação otimizada entre Dashboard e Dispositivos
 * 
 * Implementa:
 * - Canais específicos por dispositivo
 * - Sistema de ACK/confirmação
 * - Retry automático de comandos
 * - Timeout e tratamento de erros
 */

import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Command {
  id: string; // UUID único do comando
  device_id: string;
  command: string;
  data: any;
  timestamp: number;
  timeout?: number; // Timeout em ms (padrão: 5000)
  retries?: number; // Tentativas restantes (padrão: 3)
}

export interface CommandAck {
  command_id: string;
  device_id: string;
  status: 'received' | 'processed' | 'failed';
  error?: string;
  timestamp: number;
}

export interface CommandResult {
  success: boolean;
  commandId: string;
  error?: string;
}

/**
 * Classe para gerenciar comunicação de comandos com dispositivos
 */
export class DeviceCommunicationService {
  private pendingCommands: Map<string, Command> = new Map();
  private ackListeners: Map<string, (ack: CommandAck) => void> = new Map();
  private retryTimers: Map<string, NodeJS.Timeout> = new Map();
  private channels: Map<string, RealtimeChannel> = new Map();

  /**
   * Envia um comando para um dispositivo específico
   * @param deviceId ID do dispositivo
   * @param command Tipo de comando
   * @param data Dados do comando
   * @param options Opções (timeout, retries)
   * @returns Promise que resolve quando comando é confirmado
   */
  async sendCommand(
    deviceId: string,
    command: string,
    data: any,
    options?: { timeout?: number; retries?: number }
  ): Promise<CommandResult> {
    const commandId = crypto.randomUUID();
    const timeout = options?.timeout || 5000;
    const retries = options?.retries || 3;

    const cmd: Command = {
      id: commandId,
      device_id: deviceId,
      command,
      data,
      timestamp: Date.now(),
      timeout,
      retries
    };

    return new Promise((resolve) => {
      // Listener para ACK
      this.ackListeners.set(commandId, (ack: CommandAck) => {
        this.pendingCommands.delete(commandId);
        const timer = this.retryTimers.get(commandId);
        if (timer) {
          clearTimeout(timer);
          this.retryTimers.delete(commandId);
        }

        if (ack.status === 'received' || ack.status === 'processed') {
          resolve({ success: true, commandId });
        } else {
          resolve({ success: false, commandId, error: ack.error });
        }
      });

      // Envia comando
      this.pendingCommands.set(commandId, cmd);
      this.sendCommandToDevice(cmd, retries, resolve);
    });
  }

  /**
   * Envia comando para dispositivo com retry automático
   */
  private async sendCommandToDevice(
    cmd: Command,
    retriesLeft: number,
    resolve: (result: CommandResult) => void
  ): Promise<void> {
    try {
      // Cria canal específico para o dispositivo se não existir
      const channelKey = `device:${cmd.device_id}:commands`;
      let channel = this.channels.get(channelKey);

      if (!channel) {
        channel = supabase.channel(channelKey);
        this.channels.set(channelKey, channel);
      }

      // Envia comando via broadcast
      const { error: sendError } = await channel.send({
        type: 'broadcast',
        event: 'command',
        payload: cmd
      });

      if (sendError) {
        throw new Error(`Erro ao enviar comando: ${sendError.message}`);
      }

      console.log(`📤 Comando enviado: ${cmd.command} para dispositivo ${cmd.device_id} (ID: ${cmd.id})`);

      // Timeout para ACK
      const timer = setTimeout(() => {
        if (this.pendingCommands.has(cmd.id)) {
          console.warn(`⏱️ Timeout aguardando ACK do comando ${cmd.id}`);
          
          if (retriesLeft > 0) {
            console.log(`🔄 Retentando comando ${cmd.id} (tentativas restantes: ${retriesLeft - 1})`);
            this.sendCommandToDevice(cmd, retriesLeft - 1, resolve);
          } else {
            console.error(`❌ Comando ${cmd.id} falhou após ${cmd.retries} tentativas`);
            this.pendingCommands.delete(cmd.id);
            this.ackListeners.delete(cmd.id);
            resolve({ success: false, commandId: cmd.id, error: 'Timeout: comando não foi confirmado' });
          }
        }
      }, cmd.timeout);

      this.retryTimers.set(cmd.id, timer);
    } catch (error: any) {
      console.error(`❌ Erro ao enviar comando ${cmd.id}:`, error);
      
      if (retriesLeft > 0) {
        // Retry após delay
        setTimeout(() => {
          this.sendCommandToDevice(cmd, retriesLeft - 1, resolve);
        }, 1000);
      } else {
        this.pendingCommands.delete(cmd.id);
        this.ackListeners.delete(cmd.id);
        resolve({ success: false, commandId: cmd.id, error: error.message });
      }
    }
  }

  /**
   * Processa ACK recebido de um dispositivo
   */
  handleAck(ack: CommandAck): void {
    const listener = this.ackListeners.get(ack.command_id);
    if (listener) {
      listener(ack);
    } else {
      console.warn(`⚠️ ACK recebido para comando desconhecido: ${ack.command_id}`);
    }
  }

  /**
   * Limpa recursos de um dispositivo
   */
  cleanupDevice(deviceId: string): void {
    // Remove comandos pendentes do dispositivo
    for (const [cmdId, cmd] of this.pendingCommands.entries()) {
      if (cmd.device_id === deviceId) {
        const timer = this.retryTimers.get(cmdId);
        if (timer) {
          clearTimeout(timer);
          this.retryTimers.delete(cmdId);
        }
        this.pendingCommands.delete(cmdId);
        this.ackListeners.delete(cmdId);
      }
    }

    // Remove canal do dispositivo
    const channelKey = `device:${deviceId}:commands`;
    const channel = this.channels.get(channelKey);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(channelKey);
    }
  }

  /**
   * Limpa todos os recursos
   */
  cleanup(): void {
    // Limpa todos os timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }

    // Remove todos os canais
    for (const channel of this.channels.values()) {
      supabase.removeChannel(channel);
    }

    this.pendingCommands.clear();
    this.ackListeners.clear();
    this.retryTimers.clear();
    this.channels.clear();
  }
}

// Singleton instance
export const deviceCommunicationService = new DeviceCommunicationService();

