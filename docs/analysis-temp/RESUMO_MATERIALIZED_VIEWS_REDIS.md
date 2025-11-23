# 📊 Resumo: Materialized Views e Redis

## 🎯 Resposta Rápida

### **Materialized Views:**
✅ **Como fazer:** Criar via migration SQL no Supabase  
✅ **Quando usar:** Estatísticas agregadas, relatórios, dashboards  
✅ **Custo:** **GRÁTIS** (incluído no Supabase)  
✅ **Performance:** Queries complexas viram queries simples

### **Redis:**
✅ **Como fazer:** Configurar Upstash Redis (serverless)  
✅ **Quando usar:** Cache de queries, sessões, rate limiting  
✅ **Custo:** **Gratuito até 10K requests/dia** (Upstash)  
✅ **Performance:** Extremamente rápido (100K+ ops/segundo)

---

## 📋 Materialized Views - Passo a Passo

### 1. **Criar Migration SQL**
Arquivo criado: `supabase/migrations/20250118000000_create_materialized_views.sql`

**O que faz:**
- Cria 3 Materialized Views:
  - `mv_call_statistics` - Estatísticas de chamadas por dia
  - `mv_device_performance` - Performance de dispositivos
  - `mv_campaign_performance` - Performance de campanhas

### 2. **Executar no Supabase**
```sql
-- Copiar conteúdo do arquivo SQL e executar no Supabase Dashboard
-- Ou via CLI: supabase db push
```

### 3. **Usar no Código**
```typescript
// Buscar estatísticas do cache (materialized view)
const { data } = await supabase
  .from('mv_call_statistics')
  .select('*')
  .eq('user_id', userId)
  .gte('date', '2025-01-01')
  .order('date', { ascending: false });
```

### 4. **Atualizar Periodicamente**
```typescript
// Atualizar a cada hora (via cron ou script)
await supabase.rpc('refresh_call_statistics');
```

---

## 🔴 Redis - Passo a Passo

### 1. **Setup Upstash Redis (Gratuito)**
1. Acesse: https://upstash.com/
2. Crie uma conta (gratuita)
3. Crie um database Redis
4. Copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`

### 2. **Instalar Dependência**
```bash
npm install @upstash/redis
```

### 3. **Configurar Variáveis de Ambiente**
```env
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxx
```

### 4. **Criar Cliente Redis**
```typescript
// src/lib/redis.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default redis;
```

### 5. **Usar Cache**
```typescript
// Cache de dispositivos (5 minutos)
const devices = await getCachedDevices(userId);

// Cache de chamadas recentes (1 minuto)
const calls = await getCachedRecentCalls(userId, 20);

// Invalidar cache quando mudar
await invalidateDeviceCache(userId);
```

---

## 📊 Comparação Rápida

| Característica | Materialized Views | Redis |
|----------------|-------------------|-------|
| **Para que serve** | Agregações complexas | Cache rápido |
| **Exemplo** | Estatísticas por dia | Lista de dispositivos |
| **Performance** | ⚡⚡⚡ Rápido | ⚡⚡⚡⚡⚡ Muito rápido |
| **Custo** | ✅ Grátis | ✅ Grátis (até 10K/dia) |
| **Dados** | Persistentes | Temporários (TTL) |
| **Atualização** | Manual/Agendada | Tempo real |

---

## 🎯 Quando Usar Cada Um?

### **Materialized Views:**
✅ Estatísticas de chamadas (dashboard)  
✅ Performance de campanhas  
✅ Relatórios agregados  
✅ Dados que mudam pouco

### **Redis:**
✅ Cache de queries frequentes  
✅ Sessões temporárias (QR code)  
✅ Rate limiting  
✅ Contadores em tempo real  
✅ Dispositivos online

---

## 🚀 Próximos Passos

### **Fase 1: Materialized Views (Sem Custo Extra)**
1. ✅ Executar migration SQL no Supabase
2. ✅ Testar queries nas MVs
3. ✅ Integrar no dashboard
4. ✅ Configurar refresh automático (cron)

### **Fase 2: Redis (Gratuito até 10K/dia)**
1. ✅ Criar conta Upstash Redis
2. ✅ Instalar @upstash/redis
3. ✅ Criar src/lib/redis.ts
4. ✅ Criar src/lib/cache.ts
5. ✅ Integrar cache nos hooks
6. ✅ Configurar invalidação

---

## ✅ Checklist

### **Materialized Views:**
- [ ] Executar migration `20250118000000_create_materialized_views.sql` no Supabase
- [ ] Testar queries nas MVs
- [ ] Integrar no dashboard
- [ ] Configurar refresh automático (cron ou Edge Function)

### **Redis:**
- [ ] Criar conta Upstash Redis
- [ ] Instalar `@upstash/redis`
- [ ] Configurar variáveis de ambiente
- [ ] Criar `src/lib/redis.ts`
- [ ] Criar `src/lib/cache.ts`
- [ ] Integrar cache nos hooks
- [ ] Testar cache hit/miss
- [ ] Configurar invalidação automática

---

## 📚 Documentação Completa

Ver arquivo completo: `docs/implementacoes-avancadas.md`

Inclui:
- ✅ Exemplos completos de código
- ✅ Casos de uso específicos
- ✅ Integração com hooks
- ✅ Rate limiting
- ✅ Sessões temporárias
- ✅ Monitoramento de cache

