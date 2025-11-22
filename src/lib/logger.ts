/**
 * Sistema de Logging Estruturado
 * 
 * Funcionalidades:
 * - Logs estruturados com níveis (debug, info, warn, error)
 * - Formatação consistente
 * - Integração com serviços de monitoramento (futuro)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private enabled: boolean = true;
  private minLevel: LogLevel = 'debug';

  /**
   * Configura o logger
   */
  configure(options: { enabled?: boolean; minLevel?: LogLevel }) {
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
    }
    if (options.minLevel) {
      this.minLevel = options.minLevel;
    }
  }

  /**
   * Verifica se o nível deve ser logado
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  /**
   * Cria entrada de log
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } as any : undefined
    };
  }

  /**
   * Log debug
   */
  debug(message: string, context?: Record<string, any>) {
    if (!this.shouldLog('debug')) return;

    const entry = this.createLogEntry('debug', message, context);
    console.debug('🐛', entry);
    
    // Envia para serviço de monitoramento (futuro)
    this.sendToMonitoring(entry);
  }

  /**
   * Log info
   */
  info(message: string, context?: Record<string, any>) {
    if (!this.shouldLog('info')) return;

    const entry = this.createLogEntry('info', message, context);
    console.info('ℹ️', entry);
    
    this.sendToMonitoring(entry);
  }

  /**
   * Log warn
   */
  warn(message: string, context?: Record<string, any>) {
    if (!this.shouldLog('warn')) return;

    const entry = this.createLogEntry('warn', message, context);
    console.warn('⚠️', entry);
    
    this.sendToMonitoring(entry);
  }

  /**
   * Log error
   */
  error(message: string, error?: Error, context?: Record<string, any>) {
    if (!this.shouldLog('error')) return;

    const entry = this.createLogEntry('error', message, context, error);
    console.error('❌', entry);
    
    this.sendToMonitoring(entry);
  }

  /**
   * Envia log para serviço de monitoramento (implementar no futuro)
   */
  private sendToMonitoring(entry: LogEntry) {
    // TODO: Integrar com Sentry, LogRocket, ou serviço similar
    // Por enquanto, apenas loga no console
  }
}

// Singleton instance
export const logger = new Logger();

// Helper functions
export const logDebug = (message: string, context?: Record<string, any>) => {
  logger.debug(message, context);
};

export const logInfo = (message: string, context?: Record<string, any>) => {
  logger.info(message, context);
};

export const logWarn = (message: string, context?: Record<string, any>) => {
  logger.warn(message, context);
};

export const logError = (message: string, error?: Error, context?: Record<string, any>) => {
  logger.error(message, error, context);
};

