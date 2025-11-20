# 🚀 Implementações Avançadas: Materialized Views e Redis

## 📊 Materialized Views no PostgreSQL/Supabase

### 🎯 **O que são Materialized Views?**

Materialized Views são **tabelas pré-computadas** que armazenam resultados de queries complexas. Ao invés de executar queries pesadas toda vez, você consulta uma "cópia" pré-calculada que é atualizada periodicamente.

### ✅ **Vantagens:**
- ⚡ **Performance:** Queries complexas viram consultas simples
- 📊 **Agregações pré-calculadas:** Estatísticas instantâneas
- 💰 **Menos carga no banco:** Reduz uso de CPU/memória
- 🔄 **Atualização automática:** Pode ser atualizada por triggers ou schedule

### ❌ **Desvantagens:**
- 💾 **Espaço em disco:** Armazena dados duplicados
- ⏱️ **Dados podem estar desatualizados:** Até a próxima atualização
- 🔄 **Manutenção:** Precisa atualizar periodicamente

---

## 📋 Casos de Uso para o Projeto PBX Mobile

### 1. **Estatísticas de Chamadas por Dia/Semana/Mês**
```sql
-- Materialized View: Estatísticas de chamadas agregadas
CREATE MATERIALIZED VIEW mv_call_statistics AS
SELECT 
    user_id,
    DATE_TRUNC('day', start_time) as date,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'answered') as answered_calls,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
    AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration,
    SUM(duration) FILTER (WHERE duration IS NOT NULL) as total_duration,
    COUNT(DISTINCT device_id) as devices_used,
    COUNT(DISTINCT campaign_id) as campaigns_run
FROM public.calls
WHERE start_time >= NOW() - INTERVAL '90 days'
GROUP BY user_id, DATE_TRUNC('day', start_time);

-- Índice para consultas rápidas
CREATE INDEX idx_mv_call_statistics_user_date ON mv_call_statistics(user_id, date DESC);

-- Atualizar periodicamente (via função ou cron)
CREATE OR REPLACE FUNCTION refresh_call_statistics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_call_statistics;
END;
$$ LANGUAGE plpgsql;
```

**Quando usar:**
- Dashboard com estatísticas de chamadas
- Relatórios diários/semanais/mensais
- Gráficos de performance

---

### 2. **Top Dispositivos por Chamadas Ativas**
```sql
-- Materialized View: Dispositivos com mais chamadas ativas
CREATE MATERIALIZED VIEW mv_device_performance AS
SELECT 
    d.id as device_id,
    d.name as device_name,
    d.user_id,
    d.status,
    COUNT(c.id) as total_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'answered') as answered_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'completed') as completed_calls,
    AVG(c.duration) FILTER (WHERE c.duration IS NOT NULL) as avg_duration,
    MAX(c.start_time) as last_call_at,
    SUM(c.duration) FILTER (WHERE c.duration IS NOT NULL) as total_duration_seconds
FROM public.devices d
LEFT JOIN public.calls c ON c.device_id = d.id
WHERE c.start_time >= NOW() - INTERVAL '30 days' OR c.id IS NULL
GROUP BY d.id, d.name, d.user_id, d.status;

-- Índice
CREATE INDEX idx_mv_device_performance_user ON mv_device_performance(user_id, total_calls DESC);
```

**Quando usar:**
- Lista de dispositivos ordenada por performance
- Identificar dispositivos com problemas
- Estatísticas de uso por dispositivo

---

### 3. **Campanhas com Melhor Taxa de Sucesso**
```sql
-- Materialized View: Performance de campanhas
CREATE MATERIALIZED VIEW mv_campaign_performance AS
SELECT 
    nl.id as campaign_id,
    nl.name as campaign_name,
    nl.user_id,
    COUNT(c.id) as total_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'answered') as answered_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'completed') as completed_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'failed') as failed_calls,
    ROUND(
        (COUNT(c.id) FILTER (WHERE c.status = 'answered')::numeric / 
         NULLIF(COUNT(c.id), 0)) * 100, 
        2
    ) as answer_rate_percent,
    AVG(c.duration) FILTER (WHERE c.duration IS NOT NULL) as avg_duration,
    MAX(c.start_time) as last_call_at,
    MIN(c.start_time) as first_call_at
FROM public.number_lists nl
LEFT JOIN public.calls c ON c.campaign_id = nl.id
WHERE c.start_time >= NOW() - INTERVAL '60 days' OR c.id IS NULL
GROUP BY nl.id, nl.name, nl.user_id;

-- Índice
CREATE INDEX idx_mv_campaign_performance_user ON mv_campaign_performance(user_id, answer_rate_percent DESC);
```

**Quando usar:**
- Dashboard de campanhas
- Comparação de performance entre campanhas
- Identificar campanhas com melhor ROI

---

## 🔄 Como Atualizar Materialized Views

### Opção 1: **Via Trigger (Tempo Real)**
```sql
-- Trigger para atualizar MV quando calls mudarem
CREATE OR REPLACE FUNCTION update_call_statistics_on_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualiza apenas os dados do dia afetado
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_call_statistics;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica trigger (pode ser muito pesado se houver muitas chamadas)
-- CREATE TRIGGER trigger_refresh_call_stats
-- AFTER INSERT OR UPDATE OR DELETE ON public.calls
-- FOR EACH ROW EXECUTE FUNCTION update_call_statistics_on_change();
```

### Opção 2: **Via Schedule (PostgreSQL pg_cron ou Supabase Cron)**
```sql
-- Supabase Edge Function ou pg_cron
-- Atualizar a cada hora
SELECT cron.schedule(
    'refresh-call-statistics',
    '0 * * * *', -- A cada hora
    'SELECT refresh_call_statistics();'
);
```

### Opção 3: **Via API/Script (Manual)**
```typescript
// src/lib/materialized-views.ts
import { supabase } from '@/integrations/supabase/client';

export async function refreshCallStatistics() {
  const { error } = await supabase.rpc('refresh_call_statistics');
  
  if (error) {
    console.error('Erro ao atualizar estatísticas:', error);
    throw error;
  }
  
  console.log('Estatísticas atualizadas com sucesso');
}
```

---

## 🔴 Redis Cache Distribuído

### 🎯 **O que é Redis?**

Redis é um **banco de dados em memória** (in-memory) extremamente rápido usado para cache, sessões, filas e armazenamento temporário.

### ✅ **Vantagens:**
- ⚡ **Performance:** 100.000+ operações/segundo
- 🔄 **Cache distribuído:** Compartilhado entre múltiplas instâncias
- 💾 **Tipos de dados:** String, Hash, List, Set, Sorted Set
- ⏱️ **TTL automático:** Dados expiram automaticamente

### ❌ **Desvantagens:**
- 💰 **Custo:** Requer infraestrutura adicional
- 💾 **Dados em memória:** Limitado pela RAM
- 🔄 **Pode perder dados:** Se não usar persistência

---

## 🏗️ Como Implementar Redis no Projeto

### 1. **Setup do Redis**

#### Opção A: **Upstash Redis (Serverless) - Recomendado**
```bash
# Instalar cliente Redis para Node.js
npm install @upstash/redis
```

#### Opção B: **Redis Cloud**
```bash
# Instalar cliente Redis padrão
npm install redis ioredis
```

#### Opção C: **Docker Local (Desenvolvimento)**
```bash
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

---

### 2. **Cliente Redis no Projeto**

```typescript
// src/lib/redis.ts
import { Redis } from '@upstash/redis'; // Upstash
// OU
// import Redis from 'ioredis'; // Redis padrão

// Configuração para Upstash (recomendado para produção)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Configuração para Redis padrão
// const redis = new Redis({
//   host: process.env.REDIS_HOST || 'localhost',
//   port: parseInt(process.env.REDIS_PORT || '6379'),
//   password: process.env.REDIS_PASSWORD,
// });

export default redis;
```

---

### 3. **Cache de Queries Frequentes**

```typescript
// src/lib/cache.ts
import redis from './redis';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cache de dispositivos do usuário
 */
export async function getCachedDevices(userId: string) {
  const cacheKey = `devices:user:${userId}`;
  
  try {
    // Tenta buscar do cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('✅ Cache hit: devices');
      return JSON.parse(cached as string);
    }
    
    // Se não estiver no cache, busca do banco
    console.log('❌ Cache miss: devices - buscando do banco');
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', userId)
      .order('last_seen', { ascending: false });
    
    if (error) throw error;
    
    // Salva no cache por 5 minutos
    await redis.setex(cacheKey, 300, JSON.stringify(data));
    
    return data;
  } catch (error) {
    console.error('Erro no cache de dispositivos:', error);
    // Fallback: busca direto do banco
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', userId);
    return data;
  }
}

/**
 * Cache de chamadas recentes
 */
export async function getCachedRecentCalls(userId: string, limit: number = 20) {
  const cacheKey = `calls:recent:user:${userId}:limit:${limit}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }
    
    const { data } = await supabase
      .from('calls')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(limit);
    
    // Cache por 1 minuto (chamadas mudam frequentemente)
    await redis.setex(cacheKey, 60, JSON.stringify(data));
    
    return data;
  } catch (error) {
    console.error('Erro no cache de chamadas:', error);
    return null;
  }
}

/**
 * Invalidar cache (quando dados mudarem)
 */
export async function invalidateDeviceCache(userId: string) {
  const cacheKey = `devices:user:${userId}`;
  await redis.del(cacheKey);
  console.log('🗑️ Cache invalidado: devices');
}

export async function invalidateCallsCache(userId: string) {
  // Remove todos os caches de chamadas do usuário
  const keys = await redis.keys(`calls:*:user:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log('🗑️ Cache invalidado: calls');
  }
}
```

---

### 4. **Cache de Estatísticas (Materialized Views)**

```typescript
// src/lib/stats-cache.ts
import redis from './redis';

/**
 * Cache de estatísticas de chamadas
 */
export async function getCachedCallStatistics(userId: string, date: string) {
  const cacheKey = `stats:calls:user:${userId}:date:${date}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }
    
    // Busca da Materialized View
    const { data } = await supabase
      .from('mv_call_statistics')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .single();
    
    // Cache por 15 minutos (estatísticas não mudam tanto)
    if (data) {
      await redis.setex(cacheKey, 900, JSON.stringify(data));
    }
    
    return data;
  } catch (error) {
    console.error('Erro no cache de estatísticas:', error);
    return null;
  }
}
```

---

### 5. **Cache de Sessões e Dados Temporários**

```typescript
// src/lib/session-cache.ts
import redis from './redis';

/**
 * Armazena sessão de pareamento temporária
 */
export async function setPairingSession(sessionCode: string, data: any, ttl: number = 600) {
  const cacheKey = `pairing:session:${sessionCode}`;
  await redis.setex(cacheKey, ttl, JSON.stringify(data));
}

/**
 * Recupera sessão de pareamento
 */
export async function getPairingSession(sessionCode: string) {
  const cacheKey = `pairing:session:${sessionCode}`;
  const data = await redis.get(cacheKey);
  return data ? JSON.parse(data as string) : null;
}

/**
 * Remove sessão de pareamento
 */
export async function deletePairingSession(sessionCode: string) {
  const cacheKey = `pairing:session:${sessionCode}`;
  await redis.del(cacheKey);
}
```

---

### 6. **Rate Limiting com Redis**

```typescript
// src/lib/rate-limit.ts
import redis from './redis';

/**
 * Rate limiting para evitar spam de comandos
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowSeconds: number = 60
): Promise<boolean> {
  const cacheKey = `ratelimit:${key}`;
  
  try {
    const current = await redis.incr(cacheKey);
    
    // Se for a primeira requisição no período, define TTL
    if (current === 1) {
      await redis.expire(cacheKey, windowSeconds);
    }
    
    // Verifica se excedeu o limite
    return current <= maxRequests;
  } catch (error) {
    console.error('Erro no rate limiting:', error);
    // Em caso de erro, permite (fail-open)
    return true;
  }
}

// Uso:
const canSend = await checkRateLimit(`device:${deviceId}:commands`, 10, 60);
if (!canSend) {
  throw new Error('Rate limit excedido. Aguarde um minuto.');
}
```

---

### 7. **Integração com Supabase Realtime**

```typescript
// src/lib/realtime-cache.ts
import redis from './redis';

/**
 * Cache de dispositivos online (set no Redis)
 */
export async function markDeviceOnline(deviceId: string, userId: string) {
  const cacheKey = `devices:online:user:${userId}`;
  await redis.sadd(cacheKey, deviceId);
  // Expira após 5 minutos se não atualizar
  await redis.expire(cacheKey, 300);
}

export async function markDeviceOffline(deviceId: string, userId: string) {
  const cacheKey = `devices:online:user:${userId}`;
  await redis.srem(cacheKey, deviceId);
}

export async function getOnlineDevices(userId: string): Promise<string[]> {
  const cacheKey = `devices:online:user:${userId}`;
  const devices = await redis.smembers(cacheKey);
  return devices as string[];
}
```

---

### 8. **Integração no Hooks**

```typescript
// src/hooks/usePBXData.ts
import { getCachedDevices, invalidateDeviceCache } from '@/lib/cache';

export const usePBXData = () => {
  const fetchDevices = async () => {
    // Tenta buscar do cache primeiro
    const cachedDevices = await getCachedDevices(user.id);
    if (cachedDevices && cachedDevices.length > 0) {
      setDevices(cachedDevices);
    }
    
    // Busca atualizada do banco em background
    const { data } = await supabase.from('devices').select('*').eq('user_id', user.id);
    if (data) {
      setDevices(data);
      // Atualiza cache
      // (já atualizado pela função getCachedDevices)
    }
  };
  
  // Quando dispositivos mudarem, invalida cache
  useEffect(() => {
    const subscription = supabase
      .channel('devices_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' },
        async () => {
          // Invalida cache quando houver mudança
          await invalidateDeviceCache(user.id);
          fetchDevices();
        }
      )
      .subscribe();
    
    return () => subscription.unsubscribe();
  }, [user]);
};
```

---

## 📊 Comparação: Materialized Views vs Redis

| Característica | Materialized Views | Redis |
|----------------|-------------------|-------|
| **Performance** | ⚡⚡⚡ Rápido | ⚡⚡⚡⚡⚡ Muito rápido |
| **Dados** | Persistentes | Temporários (com TTL) |
| **Tipo** | Agregações complexas | Qualquer tipo de dado |
| **Atualização** | Manual/Agendada | Tempo real (set/get) |
| **Escalabilidade** | Limitada ao banco | Horizontal (distribuído) |
| **Custo** | ✅ Incluído no Supabase | 💰 Serviço adicional |
| **Uso Ideal** | Estatísticas/Relatórios | Cache/Sessões/Rate Limit |

---

## 🎯 Recomendações para o Projeto

### **Materialized Views:**
✅ **Usar para:**
- Estatísticas de chamadas (dashboard)
- Performance de campanhas
- Relatórios agregados
- Dados que mudam pouco

### **Redis:**
✅ **Usar para:**
- Cache de queries frequentes (devices, calls recentes)
- Sessões temporárias (pareamento QR code)
- Rate limiting
- Dispositivos online (set)
- Contadores em tempo real

---

## 🚀 Próximos Passos

### **Fase 1: Materialized Views (Sem Custo)**
1. ✅ Criar migrations para Materialized Views
2. ✅ Função de refresh automático
3. ✅ Integração no dashboard

### **Fase 2: Redis (Com Custo)**
1. ✅ Setup Upstash Redis (gratuito até 10K requests/dia)
2. ✅ Cliente Redis no projeto
3. ✅ Cache de queries frequentes
4. ✅ Rate limiting
5. ✅ Sessões temporárias

### **Fase 3: Otimização**
1. ✅ Invalidar cache automaticamente
2. ✅ Monitorar hit/miss rate
3. ✅ Ajustar TTLs conforme uso

---

## 📋 Checklist de Implementação

### **Materialized Views:**
- [ ] Criar migration para mv_call_statistics
- [ ] Criar migration para mv_device_performance
- [ ] Criar migration para mv_campaign_performance
- [ ] Criar função refresh_*_statistics()
- [ ] Configurar atualização automática (cron ou trigger)
- [ ] Integrar no dashboard

### **Redis:**
- [ ] Configurar Upstash Redis (ou alternativa)
- [ ] Instalar cliente Redis (@upstash/redis)
- [ ] Criar src/lib/redis.ts
- [ ] Criar src/lib/cache.ts
- [ ] Criar src/lib/stats-cache.ts
- [ ] Criar src/lib/session-cache.ts
- [ ] Criar src/lib/rate-limit.ts
- [ ] Integrar cache nos hooks
- [ ] Configurar invalidação automática

---

## 💡 Conclusão

**Materialized Views** e **Redis** são complementares:
- **Materialized Views:** Para agregações complexas e relatórios
- **Redis:** Para cache rápido e dados temporários

Ambos melhoram significativamente a **performance** do projeto, especialmente quando há muitos usuários e dados.

