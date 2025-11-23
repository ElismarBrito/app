# 📋 Resumo: Implementação da Branch and-11

## ✅ PLANO DE IMPLEMENTAÇÃO

### **Ordem de Execução:**
1. ✅ **Remover migration duplicada** - `fix_status_inconsistencies.sql` (já aplicada na and-09)
2. 🔍 **Analisar schema completo** - Verificar estrutura antes de aplicar
3. ⚡ **Aplicar TRIGGER** (mais fácil) - Ganho imediato sem refatoração
4. 📋 **Aplicar VALIDAÇÃO DE SCHEMA** - Garantir consistência
5. 🚀 **Aplicar ÍNDICES COMPOSTOS** - Requer refatoração de código
6. 🔧 **Refatorar código** - Mover filtros para o banco
7. 🐛 **Debugar** - Verificar erros e performance

---

## ✅ PASSO 1: Migration Duplicada Removida

- ❌ Removido: `20250117000000_fix_status_inconsistencies.sql`
- ✅ Motivo: Já foi aplicada na and-09 (mergeada com main)

---

## 🔍 PASSO 2: Análise do Schema

### **Script Criado:**
- ✅ `ANALISE_SCHEMA_COMPLETO.sql` - Script completo de análise

**O que verifica:**
1. ✅ Todas as tabelas existentes
2. ✅ Estrutura completa de cada tabela (colunas, tipos)
3. ✅ Constraints e CHECK constraints
4. ✅ Índices existentes
5. ✅ Triggers existentes
6. ✅ Funções existentes
7. ✅ Se `active_calls_count` existe
8. ✅ Se trigger já existe
9. ✅ Comparação de contadores (atual vs. real)

**Como usar:**
1. Abrir Supabase Dashboard → SQL Editor
2. Copiar conteúdo de `ANALISE_SCHEMA_COMPLETO.sql`
3. Executar (Ctrl+Enter)
4. Analisar resultados

---

## ⚡ PASSO 3: Aplicar Trigger (PRIMEIRO)

### **Arquivo:** `20250117000002_trigger_active_calls_count.sql`

**O que faz:**
- ✅ Cria função `update_device_call_count()`
- ✅ Cria trigger `trigger_update_call_count`
- ✅ Sincroniza contadores existentes automaticamente
- ✅ Mantém `active_calls_count` sempre atualizado

**Verificações antes de aplicar:**
- ✅ Coluna `active_calls_count` existe? **SIM** (já existe)
- ✅ Status em calls é ENUM? **SIM** (da migration anterior)
- ✅ Trigger já existe? **NÃO** (será criado)

**Ganho:**
- ✅ **Imediato:** Contador sempre correto
- ✅ **Sem refatoração:** Código já usa `active_calls_count`

**Como aplicar:**
1. Abrir Supabase Dashboard → SQL Editor
2. Copiar conteúdo da migration
3. Executar (Ctrl+Enter)
4. Verificar mensagem: "Trigger for active_calls_count created successfully"

---

## 📋 PASSO 4: Aplicar Validação de Schema

### **Arquivo:** `20250117000003_update_schema.sql`

**O que faz:**
- ✅ Valida que todas as colunas existem
- ✅ Adiciona colunas faltantes (se houver)
- ✅ Renomeia `qr_code` → `session_code` (se necessário)

**Verificações:**
- ✅ Usa `IF NOT EXISTS` - Seguro
- ✅ Não quebra se coluna já existe

**Colunas verificadas:**
- `devices`: model, os, os_version, sim_type, has_physical_sim, has_esim, internet_status, signal_status, line_blocked, active_calls_count
- `calls`: hidden, campaign_id, session_id, failure_reason
- `qr_sessions`: used, session_code
- `number_lists`: ddi_prefix

**Como aplicar:**
1. Abrir Supabase Dashboard → SQL Editor
2. Copiar conteúdo da migration
3. Executar (Ctrl+Enter)
4. Verificar mensagem: "Schema validation and updates completed successfully"

---

## 🚀 PASSO 5: Aplicar Índices Compostos (DEPOIS)

### **Arquivo:** `20250117000001_create_composite_indexes.sql`

**O que faz:**
- ✅ Cria 7 índices compostos otimizados
- ✅ Usa `IF NOT EXISTS` - Seguro

**⚠️ ATENÇÃO:**
- ❌ **NÃO terá ganho** se código não usar filtros no banco
- ✅ **Requer refatoração** do código

**Índices criados:**
1. `idx_devices_user_status` - devices(user_id, status)
2. `idx_calls_device_status` - calls(device_id, status)
3. `idx_calls_user_status` - calls(user_id, status)
4. `idx_calls_user_device` - calls(user_id, device_id)
5. `idx_calls_device_start_time` - calls(device_id, start_time DESC)
6. `idx_qr_sessions_user_valid` - qr_sessions(user_id, used, expires_at)
7. `idx_number_lists_user_active` - number_lists(user_id, is_active)

**Como aplicar:**
1. Abrir Supabase Dashboard → SQL Editor
2. Copiar conteúdo da migration
3. Executar (Ctrl+Enter)
4. Verificar mensagem: "Composite indexes created successfully"

---

## 🔧 PASSO 6: Refatorar Código

### **Queries que precisam ser refatoradas:**

#### **1. `usePBXData.ts` - fetchDevices():**
**ATUAL (filtro no cliente):**
```typescript
const { data } = await supabase
  .from('devices')
  .select('*')
  .eq('user_id', user.id);

// Depois filtra no cliente:
const devicesConnected = devices.filter(d => d.status === 'online').length
```

**REFATORADO (filtro no banco - usa índice):**
```typescript
const { data } = await supabase
  .from('devices')
  .select('*')
  .eq('user_id', user.id)
  .eq('status', 'online'); // ✅ Usa idx_devices_user_status

// Não precisa mais filtrar no cliente
```

#### **2. `usePBXData.ts` - fetchCalls():**
**ATUAL (filtro no cliente):**
```typescript
const { data } = await supabase
  .from('calls')
  .select('*')
  .eq('user_id', user.id);

// Depois filtra no cliente:
const activesCalls = calls.filter(c => c.status !== 'ended');
```

**REFATORADO (filtro no banco - usa índice):**
```typescript
const { data } = await supabase
  .from('calls')
  .select('*')
  .eq('user_id', user.id)
  .in('status', ['ringing', 'answered', 'dialing']); // ✅ Usa idx_calls_user_status
```

#### **3. `CallHistoryManager.tsx` - loadCallHistory():**
**ATUAL:**
```typescript
.eq('device_id', deviceId)
```

**REFATORADO (se filtrar por status):**
```typescript
.eq('device_id', deviceId)
.in('status', ['ringing', 'answered']) // ✅ Usa idx_calls_device_status
```

#### **4. Outros lugares com filtros:**
- `CallsTab.tsx` - Filtra por status no cliente
- `NewCallDialog.tsx` - Filtra devices online no cliente
- `ConferenceDialog.tsx` - Filtra devices no cliente

---

## 🐛 PASSO 7: Debugar e Verificar

### **Verificações:**
1. ✅ Verificar se trigger está funcionando
   ```sql
   -- Testar inserindo uma chamada
   INSERT INTO calls (user_id, device_id, number, status)
   VALUES ('user-uuid', 'device-uuid', '123456789', 'ringing');
   
   -- Verificar se contador atualizou
   SELECT id, name, active_calls_count FROM devices WHERE id = 'device-uuid';
   ```

2. ✅ Verificar se índices foram criados
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE schemaname = 'public' 
     AND indexname LIKE 'idx_%';
   ```

3. ✅ Verificar se queries usam índices
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM devices 
   WHERE user_id = 'user-uuid' AND status = 'online';
   ```

4. ✅ Testar performance antes/depois
   - Medir tempo de queries
   - Comparar bandwidth usado

---

## 📊 RESUMO DO PLANO

### **Ordem de Implementação:**
1. ✅ **Remover duplicada** - Feito!
2. 🔍 **Analisar schema** - Próximo passo
3. ⚡ **Aplicar trigger** - Mais fácil (ganho imediato)
4. 📋 **Validar schema** - Garantir consistência
5. 🚀 **Aplicar índices** - Criar índices (ainda sem ganho)
6. 🔧 **Refatorar código** - Mover filtros para banco
7. 🐛 **Debugar** - Verificar erros e performance

### **Migrations que serão aplicadas:**
1. ⚡ `20250117000002_trigger_active_calls_count.sql` - **PRIMEIRO**
2. 📋 `20250117000003_update_schema.sql` - **SEGUNDO**
3. 🚀 `20250117000001_create_composite_indexes.sql` - **TERCEIRO** (+ refatoração)

### **Arquivos que serão refatorados:**
1. `src/hooks/usePBXData.ts`
2. `src/components/CallHistoryManager.tsx`
3. `src/components/CallsTab.tsx` (pode melhorar)
4. `src/components/dialogs/NewCallDialog.tsx` (pode melhorar)
5. `src/components/dialogs/ConferenceDialog.tsx` (pode melhorar)

---

**Documento criado em**: 2025-01-18
**Status**: ✅ Pronto para começar implementação

