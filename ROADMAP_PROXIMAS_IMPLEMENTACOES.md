# 🗺️ Roadmap - Próximas Implementações e Branches

## 📋 Branches Existentes

### Branches Atuais:
- ✅ `main` - Branch principal
- ✅ `and-06` - Implementações base (merged)
- ✅ `and-07` - QR Scanner nativo (merged)
- ✅ `and-08` - Correções callId + Event listeners (ATUAL - em validação)
- ✅ `and-09-communication-improvements` - Melhorias de comunicação (ANÁLISE)

---

## 🎯 Próximas Implementações por Prioridade

### 🔴 **ALTA PRIORIDADE** (Implementar Primeiro)

---

### **Branch: `and-10-persistencia-pareamento`**
**Objetivo:** Implementar persistência de pareamento entre sessões

**Problema:**
- Pareamento se perde ao alternar apps ou fechar app
- Usuário precisa parear novamente toda vez

**Implementações:**
1. ✅ Salvar `deviceId` e `isPaired` no `localStorage`
2. ✅ Restaurar pareamento ao iniciar app
3. ✅ Validar no banco se dispositivo ainda está pareado
4. ✅ Limpar localStorage ao desparear
5. ✅ Função `getOrCreateDeviceId()` para ID persistente

**Arquivos a Modificar:**
- `src/components/MobileApp.tsx`
  - Adicionar `useEffect` de restauração
  - Salvar no localStorage após parear
  - Limpar no `handleUnpaired()`

**Tempo Estimado:** 2-3 horas

**Impacto:** ⭐⭐⭐⭐⭐ (Muito Alto - UX crítica)

---

### **Branch: `and-11-correcoes-banco-dados`**
**Objetivo:** Corrigir inconsistências e otimizar banco de dados

**Problemas Identificados:**
1. ❌ Inconsistência de status em `calls` (TEXT vs ENUM)
2. ❌ Status limitado em `devices` (falta 'unpaired')
3. ❌ Falta de índices compostos
4. ❌ `active_calls_count` sem trigger
5. ❌ `schema.sql` desatualizado

**Implementações:**
1. ✅ Migration de correção de status
2. ✅ Adicionar status 'unpaired' e 'pairing' em devices
3. ✅ Criar índices compostos otimizados
4. ✅ Trigger para `active_calls_count`
5. ✅ Atualizar `schema.sql` com estrutura real
6. ✅ Migration de sincronização de status

**Arquivos a Criar/Modificar:**
- `supabase/migrations/202501XX_fix_status_inconsistencies.sql`
- `supabase/migrations/202501XX_add_device_statuses.sql`
- `supabase/migrations/202501XX_create_composite_indexes.sql`
- `supabase/migrations/202501XX_trigger_active_calls_count.sql`
- `supabase/schema.sql` (atualizar)

**Tempo Estimado:** 1-2 dias

**Impacto:** ⭐⭐⭐⭐ (Alto - Estabilidade e performance)

---

### 🟡 **MÉDIA PRIORIDADE** (Depois das Correções)

---

### **Branch: `and-12-comunicacao-otimizada`** (Baseado em and-09)
**Objetivo:** Implementar melhorias de comunicação real-time

**Implementações:**
1. ✅ Canais específicos por dispositivo (`device:${deviceId}:commands`)
2. ✅ Sistema de ACK/confirmação de comandos
3. ✅ Queue de comandos com retry automático
4. ✅ Optimistic updates no dashboard (sem refetch completo)
5. ✅ Heartbeat otimizado (batch updates)
6. ✅ Event sourcing para chamadas (opcional)

**Arquivos a Criar:**
- `src/lib/device-communication.ts` - Serviço de comunicação
- `src/hooks/useDeviceCommunication.ts` - Hook para comunicação
- `src/hooks/useCommandQueue.ts` - Queue de comandos

**Arquivos a Modificar:**
- `src/components/MobileApp.tsx` - Integração no app
- `src/components/PBXDashboard.tsx` - Integração no dashboard
- `src/hooks/usePBXData.ts` - Optimistic updates

**Tempo Estimado:** 3-5 dias

**Impacto:** ⭐⭐⭐⭐ (Alto - Performance e confiabilidade)

---

### **Branch: `and-13-event-sourcing-calls`**
**Objetivo:** Implementar event sourcing para chamadas

**Implementações:**
1. ✅ Tabela `call_events` (histórico completo)
2. ✅ App envia eventos em vez de atualizar banco diretamente
3. ✅ Dashboard processa eventos e atualiza banco (fonte única de verdade)
4. ✅ Validação centralizada
5. ✅ Auditoria completa

**Arquivos a Criar:**
- Migration: `supabase/migrations/202501XX_create_call_events.sql`
- `src/lib/call-event-processor.ts`

**Arquivos a Modificar:**
- `src/components/MobileApp.tsx` - Enviar eventos
- `src/components/PBXDashboard.tsx` - Processar eventos

**Tempo Estimado:** 2-3 dias

**Impacto:** ⭐⭐⭐ (Médio - Auditoria e histórico)

---

### **Branch: `and-14-queue-comandos-pendentes`**
**Objetivo:** Sistema de queue para comandos pendentes

**Implementações:**
1. ✅ Tabela `device_commands` (comandos pendentes)
2. ✅ Queue de comandos no dashboard
3. ✅ Retry automático de comandos falhos
4. ✅ Sincronização ao reconectar
5. ✅ ACK/confirmação de entrega

**Arquivos a Criar:**
- Migration: `supabase/migrations/202501XX_create_device_commands.sql`
- `src/lib/command-queue.ts`
- `src/hooks/useCommandQueue.ts` (refatorar)

**Tempo Estimado:** 2-3 dias

**Impacto:** ⭐⭐⭐⭐ (Alto - Confiabilidade de comandos)

---

### 🟢 **BAIXA PRIORIDADE** (Recursos Premium)

---

### **Branch: `and-15-testes-automatizados`**
**Objetivo:** Implementar testes automatizados

**Implementações:**
1. ✅ Setup Jest/Vitest
2. ✅ Testes unitários (hooks, utils)
3. ✅ Testes de integração (comunicação, pareamento)
4. ✅ Testes E2E (Playwright/Cypress)
5. ✅ Coverage > 70%

**Arquivos a Criar:**
- `vitest.config.ts`
- `src/__tests__/` (estrutura de testes)
- `.github/workflows/tests.yml` (CI)

**Tempo Estimado:** 1-2 semanas

**Impacto:** ⭐⭐⭐⭐ (Alto - Qualidade e confiabilidade)

---

### **Branch: `and-16-logging-metricas`**
**Objetivo:** Sistema de logging e métricas

**Implementações:**
1. ✅ Logging estruturado (Pino/Winston)
2. ✅ Métricas básicas (Prometheus/Grafana)
3. ✅ Error tracking (Sentry)
4. ✅ Dashboard de métricas
5. ✅ Alertas automáticos

**Arquivos a Criar:**
- `src/lib/logger.ts`
- `src/lib/metrics.ts`
- Configuração Sentry

**Tempo Estimado:** 3-5 dias

**Impacto:** ⭐⭐⭐ (Médio - Observabilidade)

---

### **Branch: `and-17-documentacao-api`**
**Objetivo:** Documentação completa de APIs

**Implementações:**
1. ✅ OpenAPI/Swagger specification
2. ✅ Documentação de endpoints
3. ✅ Exemplos de uso
4. ✅ Guias de integração
5. ✅ Diagramas de arquitetura

**Arquivos a Criar:**
- `docs/api/` (documentação)
- `swagger.yaml` ou `openapi.json`
- `docs/architecture/` (diagramas)

**Tempo Estimado:** 3-5 dias

**Impacto:** ⭐⭐⭐ (Médio - Manutenibilidade)

---

### **Branch: `and-18-cache-distribuido`**
**Objetivo:** Cache distribuído (Redis)

**Implementações:**
1. ✅ Setup Redis
2. ✅ Cache de queries frequentes
3. ✅ Cache de estado de dispositivos
4. ✅ Invalidação de cache
5. ✅ Estratégias de cache

**Tempo Estimado:** 3-5 dias

**Impacto:** ⭐⭐⭐ (Médio - Performance em escala)

---

### **Branch: `and-19-ci-cd-pipeline`**
**Objetivo:** CI/CD completo

**Implementações:**
1. ✅ GitHub Actions workflows
2. ✅ Testes automáticos no CI
3. ✅ Build e deploy automatizado
4. ✅ Versionamento semântico
5. ✅ Rollback automático

**Arquivos a Criar:**
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `scripts/deploy.sh`

**Tempo Estimado:** 3-5 dias

**Impacto:** ⭐⭐⭐⭐ (Alto - DevOps)

---

## 📅 Cronograma Sugerido

### **Semana 1-2: Correções Críticas**
```
1. and-10-persistencia-pareamento (2-3h)
   └─ Merge → main
   
2. and-11-correcoes-banco-dados (1-2 dias)
   └─ Merge → main
```

### **Semana 3-4: Melhorias de Comunicação**
```
3. and-12-comunicacao-otimizada (3-5 dias)
   └─ Merge → main
   
4. and-14-queue-comandos-pendentes (2-3 dias)
   └─ Merge → main
```

### **Semana 5-6: Event Sourcing e Testes**
```
5. and-13-event-sourcing-calls (2-3 dias)
   └─ Merge → main (opcional)
   
6. and-15-testes-automatizados (1-2 semanas)
   └─ Merge → main
```

### **Semana 7-8: Observabilidade e Docs**
```
7. and-16-logging-metricas (3-5 dias)
   └─ Merge → main
   
8. and-17-documentacao-api (3-5 dias)
   └─ Merge → main
```

### **Semana 9+: Recursos Premium** (Opcional)
```
9. and-18-cache-distribuido (3-5 dias)
10. and-19-ci-cd-pipeline (3-5 dias)
```

---

## 🎯 Priorização por Impacto

### **Impacto Imediato (UX):**
1. ⭐⭐⭐⭐⭐ `and-10-persistencia-pareamento`
   - Usuário não precisa parear toda vez
   - Melhor experiência

### **Impacto Estabilidade:**
2. ⭐⭐⭐⭐ `and-11-correcoes-banco-dados`
   - Corrige inconsistências
   - Melhora performance
   - Previne erros

### **Impacto Performance:**
3. ⭐⭐⭐⭐ `and-12-comunicacao-otimizada`
   - 30-50% mais rápido
   - Mais confiável
   - Melhor escalabilidade

### **Impacto Qualidade:**
4. ⭐⭐⭐⭐ `and-15-testes-automatizados`
   - Detecta bugs antes
   - Mais confiável
   - Facilita refatoração

---

## 📊 Resumo das Branches

| Branch | Prioridade | Tempo | Impacto | Status |
|--------|------------|-------|---------|--------|
| `and-10-persistencia-pareamento` | 🔴 Alta | 2-3h | ⭐⭐⭐⭐⭐ | 📝 Planejado |
| `and-11-correcoes-banco-dados` | 🔴 Alta | 1-2 dias | ⭐⭐⭐⭐ | 📝 Planejado |
| `and-12-comunicacao-otimizada` | 🟡 Média | 3-5 dias | ⭐⭐⭐⭐ | 📝 Planejado |
| `and-13-event-sourcing-calls` | 🟡 Média | 2-3 dias | ⭐⭐⭐ | 📝 Planejado |
| `and-14-queue-comandos-pendentes` | 🟡 Média | 2-3 dias | ⭐⭐⭐⭐ | 📝 Planejado |
| `and-15-testes-automatizados` | 🟡 Média | 1-2 sem | ⭐⭐⭐⭐ | 📝 Planejado |
| `and-16-logging-metricas` | 🟢 Baixa | 3-5 dias | ⭐⭐⭐ | 📝 Planejado |
| `and-17-documentacao-api` | 🟢 Baixa | 3-5 dias | ⭐⭐⭐ | 📝 Planejado |
| `and-18-cache-distribuido` | 🟢 Baixa | 3-5 dias | ⭐⭐⭐ | 📝 Planejado |
| `and-19-ci-cd-pipeline` | 🟢 Baixa | 3-5 dias | ⭐⭐⭐⭐ | 📝 Planejado |

---

## 🚀 Próximos Passos Imediatos

### **1. Validar and-08** (Em andamento)
- ✅ Testar persistência de pareamento
- ✅ Validar comportamento ao alternar apps
- 📝 Documentar resultados

### **2. Criar and-10** (Próxima)
- ✅ Implementar persistência de pareamento
- ✅ Testar novamente
- ✅ Merge para main

### **3. Criar and-11** (Depois)
- ✅ Corrigir banco de dados
- ✅ Testar migrations
- ✅ Merge para main

---

## 💡 Recomendação

### **Ordem Sugerida de Implementação:**

**Fase 1 - Correções Críticas (1-2 semanas):**
1. ✅ `and-10-persistencia-pareamento` 
2. ✅ `and-11-correcoes-banco-dados`

**Fase 2 - Melhorias de Comunicação (2-3 semanas):**
3. ✅ `and-12-comunicacao-otimizada`
4. ✅ `and-14-queue-comandos-pendentes`

**Fase 3 - Qualidade e Observabilidade (2-3 semanas):**
5. ✅ `and-15-testes-automatizados`
6. ✅ `and-16-logging-metricas`
7. ✅ `and-17-documentacao-api`

**Fase 4 - Recursos Premium (Opcional):**
8. ✅ `and-13-event-sourcing-calls`
9. ✅ `and-18-cache-distribuido`
10. ✅ `and-19-ci-cd-pipeline`

---

## 📝 Notas

- **Branch naming:** Seguir padrão `and-XX-descricao-curta`
- **Commits:** Mensagens claras e descritivas
- **Merges:** Sempre validar antes de merge para main
- **Documentação:** Atualizar documentação em cada branch

---

## ✅ Checklist Antes de Criar Nova Branch

- [ ] Definir objetivo claro da branch
- [ ] Documentar problemas que resolve
- [ ] Listar arquivos que serão modificados
- [ ] Estimar tempo de implementação
- [ ] Validar que não conflita com outras branches
- [ ] Criar issue/tarefa (se usar issue tracker)

