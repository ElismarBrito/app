/**
 * Sistema de Métricas
 * 
 * Funcionalidades:
 * - Coleta de métricas de performance
 * - Métricas de comunicação (latência, sucesso, falhas)
 * - Métricas de uso (chamadas, dispositivos, etc.)
 * - Envio para serviço de monitoramento (futuro)
 */

interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private metrics: Metric[] = [];
  private maxMetricsInMemory = 1000;

  /**
   * Registra uma métrica
   */
  record(name: string, value: number, tags?: Record<string, string>) {
    const metric: Metric = {
      name,
      value,
      tags,
      timestamp: Date.now()
    };

    this.metrics.push(metric);

    // Limita tamanho do array
    if (this.metrics.length > this.maxMetricsInMemory) {
      this.metrics.shift();
    }

    // Envia para serviço de monitoramento (futuro)
    this.sendToMonitoring(metric);
  }

  /**
   * Incrementa um contador
   */
  increment(name: string, tags?: Record<string, string>, value: number = 1) {
    this.record(name, value, { ...tags, type: 'counter' });
  }

  /**
   * Registra duração (timer)
   */
  timer(name: string, durationMs: number, tags?: Record<string, string>) {
    this.record(name, durationMs, { ...tags, type: 'timer' });
  }

  /**
   * Mede duração de uma função assíncrona
   */
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.timer(name, duration, { ...tags, success: 'true' });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.timer(name, duration, { ...tags, success: 'false' });
      throw error;
    }
  }

  /**
   * Obtém métricas acumuladas
   */
  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  /**
   * Limpa métricas
   */
  clear() {
    this.metrics = [];
  }

  /**
   * Envia métrica para serviço de monitoramento (implementar no futuro)
   */
  private sendToMonitoring(metric: Metric) {
    // TODO: Integrar com Prometheus, Datadog, ou serviço similar
    // Por enquanto, apenas armazena em memória
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

// Helper functions
export const recordMetric = (name: string, value: number, tags?: Record<string, string>) => {
  metrics.record(name, value, tags);
};

export const incrementCounter = (name: string, tags?: Record<string, string>) => {
  metrics.increment(name, tags);
};

export const measureTimer = (name: string, durationMs: number, tags?: Record<string, string>) => {
  metrics.timer(name, durationMs, tags);
};

