/**
 * Serviço de Queue de Comandos Pendentes
 * 
 * Funcionalidades:
 * - Queue de comandos no banco de dados
 * - Retry automático de comandos falhos
 * - Sincronização ao reconectar dispositivo
 * - Limpeza de comandos expirados
 */

import { supabase } from '@/integrations/supabase/client';
import { deviceCommunicationService } from './device-communication';

export interface DeviceCommand {
  id?: string;
  device_id: string;
  command_type: string;
  command_data: any;
  status?: 'pending' | 'sent' | 'acknowledged' | 'failed' | 'expired';
  retry_count?: number;
  max_retries?: number;
  timeout_ms?: number;
}

/**
 * Classe para gerenciar queue de comandos no banco de dados
 */
export class CommandQueueService {
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Adiciona comando à queue
   */
  async addCommand(command: DeviceCommand, userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('device_commands')
      .insert({
        device_id: command.device_id,
        command_type: command.command_type,
        command_data: command.command_data,
        status: 'pending',
        retry_count: 0,
        max_retries: command.max_retries || 3,
        timeout_ms: command.timeout_ms || 5000,
        user_id: userId
      })
      .select('id')
      .single();

    if (error) {
      console.error('Erro ao adicionar comando à queue:', error);
      throw error;
    }

    console.log(`📝 Comando adicionado à queue: ${data.id}`);
    return data.id;
  }

  /**
   * Processa comandos pendentes para um dispositivo
   */
  async processPendingCommands(deviceId: string): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Busca comandos pendentes para o dispositivo
      const { data: commands, error } = await supabase
        .from('device_commands')
        .select('*')
        .eq('device_id', deviceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Erro ao buscar comandos pendentes:', error);
        return;
      }

      if (!commands || commands.length === 0) {
        return;
      }

      console.log(`📋 Processando ${commands.length} comandos pendentes para dispositivo ${deviceId}`);

      for (const cmd of commands) {
        try {
          // Marca como enviado
          await supabase
            .from('device_commands')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              retry_count: cmd.retry_count + 1
            })
            .eq('id', cmd.id);

          // Envia comando via serviço de comunicação
          const result = await deviceCommunicationService.sendCommand(
            cmd.device_id,
            cmd.command_type,
            cmd.command_data,
            {
              timeout: cmd.timeout_ms || 5000,
              retries: (cmd.max_retries || 3) - cmd.retry_count
            }
          );

          if (result.success) {
            // Marca como confirmado (ACK será atualizado pelo listener)
            await supabase
              .from('device_commands')
              .update({
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString()
              })
              .eq('id', cmd.id);

            console.log(`✅ Comando ${cmd.id} processado com sucesso`);
          } else {
            // Verifica se pode tentar novamente
            if (cmd.retry_count < (cmd.max_retries || 3)) {
              await supabase
                .from('device_commands')
                .update({
                  status: 'pending',
                  error_message: result.error || 'Falha ao enviar comando'
                })
                .eq('id', cmd.id);
            } else {
              await supabase
                .from('device_commands')
                .update({
                  status: 'failed',
                  error_message: result.error || 'Falha após máximo de tentativas'
                })
                .eq('id', cmd.id);
            }
          }
        } catch (error: any) {
          console.error(`❌ Erro ao processar comando ${cmd.id}:`, error);
          
          if (cmd.retry_count < (cmd.max_retries || 3)) {
            await supabase
              .from('device_commands')
              .update({
                status: 'pending',
                error_message: error.message
              })
              .eq('id', cmd.id);
          } else {
            await supabase
              .from('device_commands')
              .update({
                status: 'failed',
                error_message: error.message
              })
              .eq('id', cmd.id);
          }
        }

        // Delay entre comandos para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Inicia processamento periódico de comandos pendentes
   */
  startProcessing(deviceId: string, intervalMs: number = 5000): void {
    if (this.processingInterval) {
      this.stopProcessing();
    }

    this.processingInterval = setInterval(() => {
      this.processPendingCommands(deviceId);
    }, intervalMs);

    // Processa imediatamente
    this.processPendingCommands(deviceId);
  }

  /**
   * Para processamento periódico
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Obtém comandos pendentes para um dispositivo
   */
  async getPendingCommands(deviceId: string): Promise<DeviceCommand[]> {
    const { data, error } = await supabase
      .from('device_commands')
      .select('*')
      .eq('device_id', deviceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar comandos pendentes:', error);
      return [];
    }

    return (data || []).map(cmd => ({
      id: cmd.id,
      device_id: cmd.device_id,
      command_type: cmd.command_type,
      command_data: cmd.command_data,
      status: cmd.status,
      retry_count: cmd.retry_count,
      max_retries: cmd.max_retries,
      timeout_ms: cmd.timeout_ms
    }));
  }

  /**
   * Limpa comandos antigos (expirados ou concluídos há mais de 24h)
   */
  async cleanupOldCommands(): Promise<void> {
    const { error } = await supabase
      .from('device_commands')
      .delete()
      .in('status', ['acknowledged', 'failed', 'expired'])
      .lt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('Erro ao limpar comandos antigos:', error);
    } else {
      console.log('🧹 Comandos antigos limpos');
    }
  }
}

// Singleton instance
export const commandQueueService = new CommandQueueService();

