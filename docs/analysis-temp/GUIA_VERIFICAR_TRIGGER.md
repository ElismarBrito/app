# ✅ Guia: Como Verificar se o Trigger Está OK

## 🎯 OBJETIVO

Verificar se o trigger `active_calls_count` está funcionando corretamente e mantendo os contadores sincronizados.

---

## 📋 CHECKLIST DE VERIFICAÇÃO

### **✅ VERIFICAÇÃO 1: Trigger Existe**
**O que verifica:**
- Se o trigger `trigger_update_call_count` foi criado
- Se está ativo na tabela `calls`

**Como verificar:**
Execute o arquivo `VERIFICAR_TRIGGER_OK.sql` - Seção 1

**Resultado esperado:**
```
✅ Trigger existe e está ativo
```

---

### **✅ VERIFICAÇÃO 2: Função Existe**
**O que verifica:**
- Se a função `update_device_call_count()` foi criada

**Como verificar:**
Execute o arquivo `VERIFICAR_TRIGGER_OK.sql` - Seção 2

**Resultado esperado:**
```
✅ Função existe
```

---

### **✅ VERIFICAÇÃO 3: Coluna Existe**
**O que verifica:**
- Se a coluna `active_calls_count` existe na tabela `devices`

**Como verificar:**
Execute o arquivo `VERIFICAR_TRIGGER_OK.sql` - Seção 3

**Resultado esperado:**
```
✅ Coluna existe
```

---

### **✅ VERIFICAÇÃO 4: Contadores Corretos** ⭐ PRINCIPAL!
**O que verifica:**
- Compara o contador do trigger com a contagem real de chamadas ativas
- Identifica inconsistências

**Como verificar:**
Execute o arquivo `VERIFICAR_TRIGGER_OK.sql` - Seção 4

**Query principal:**
```sql
SELECT 
    d.id,
    d.name AS device_name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '❌ INCONSISTENTE'
    END AS status_validacao
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.active_calls_count
ORDER BY d.active_calls_count DESC;
```

**Resultado esperado:**
- Todas as linhas devem mostrar **"✅ CORRETO"**
- `contador_trigger` deve ser igual a `contador_real`
- Se houver "❌ INCONSISTENTE", execute `sync_active_calls_count()`

---

### **✅ VERIFICAÇÃO 5: Resumo de Validação**
**O que verifica:**
- Resumo geral: quantos dispositivos estão corretos vs inconsistentes

**Como verificar:**
Execute o arquivo `VERIFICAR_TRIGGER_OK.sql` - Seção 5

**Resultado esperado:**
```
dispositivos_corretos: X
dispositivos_inconsistentes: 0
total_dispositivos: X
resultado_final: ✅ TODOS OS CONTADORES ESTÃO CORRETOS!
```

---

### **✅ VERIFICAÇÃO 6: Chamadas Ativas**
**O que verifica:**
- Lista todas as chamadas ativas por dispositivo
- Confirma se o contador corresponde ao número de chamadas listadas

**Como verificar:**
Execute o arquivo `VERIFICAR_TRIGGER_OK.sql` - Seção 6

**Resultado esperado:**
- Número de chamadas listadas deve corresponder ao `active_calls_count`
- Todas as chamadas devem ter status: 'ringing', 'answered' ou 'dialing'

---

### **✅ VERIFICAÇÃO 7: Chamadas Presas**
**O que verifica:**
- Identifica chamadas que estão presas em status ativo há muito tempo
- Pode indicar problema na atualização de status

**Como verificar:**
Execute o arquivo `VERIFICAR_TRIGGER_OK.sql` - Seção 7

**Resultado esperado:**
- Nenhuma chamada presa (ou todas recentes)
- Se houver chamadas presas há mais de 5 minutos, corrigir com `CORRIGIR_CHAMADAS_PRESAS.sql`

---

## 🔧 COMO CORRIGIR SE ESTIVER INCORRETO

### **Problema 1: Contadores Inconsistentes**

**Solução:**
```sql
-- Resincronizar todos os contadores
SELECT sync_active_calls_count();
```

**Depois:**
```sql
-- Verificar novamente
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '❌ AINDA INCONSISTENTE'
    END AS status_validacao
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.active_calls_count;
```

---

### **Problema 2: Trigger Não Existe**

**Solução:**
```sql
-- Reaplicar a migration
-- Copiar e executar: supabase/migrations/20250117000002_trigger_active_calls_count.sql
```

---

### **Problema 3: Chamadas Presas**

**Solução:**
```sql
-- Corrigir chamadas presas
UPDATE calls
SET status = 'ended',
    updated_at = NOW(),
    failure_reason = 'Auto-corrected: chamada presa em status ativo'
WHERE status IN ('ringing', 'dialing')
  AND NOW() - start_time > INTERVAL '5 minutes';
```

---

## 🧪 TESTE MANUAL DO TRIGGER

### **Teste 1: Inserir Chamada Ativa**

```sql
-- 1. Ver contador ANTES
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'seu-device-id';

-- 2. Inserir chamada ATIVA
INSERT INTO calls (user_id, device_id, number, status)
VALUES (
    'seu-user-id',
    'seu-device-id',
    '11999999999',
    'ringing'  -- Status ATIVO
);

-- 3. Ver contador DEPOIS (deve ter aumentado em 1)
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'seu-device-id';
```

**Resultado esperado:**
- Contador deve aumentar em 1 ✅

---

### **Teste 2: Atualizar Status (Ativa → Inativa)**

```sql
-- 1. Ver contador ANTES
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'seu-device-id';

-- 2. Atualizar status para INATIVO
UPDATE calls 
SET status = 'ended'
WHERE id = 'call-id-aqui';

-- 3. Ver contador DEPOIS (deve ter diminuído em 1)
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'seu-device-id';
```

**Resultado esperado:**
- Contador deve diminuir em 1 ✅

---

### **Teste 3: Deletar Chamada Ativa**

```sql
-- 1. Ver contador ANTES
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'seu-device-id';

-- 2. Deletar chamada ATIVA
DELETE FROM calls
WHERE id = 'call-id-aqui';

-- 3. Ver contador DEPOIS (deve ter diminuído em 1)
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'seu-device-id';
```

**Resultado esperado:**
- Contador deve diminuir em 1 ✅

---

## 📊 RESUMO

### **Status do Trigger:**
- ✅ **Funcionando:** Todos os contadores corretos
- ⚠️ **Precisa Resincronizar:** Alguns contadores inconsistentes
- ❌ **Não Funciona:** Trigger não existe ou não está ativo

### **Ações:**
1. ✅ Executar `VERIFICAR_TRIGGER_OK.sql` periodicamente
2. ✅ Se houver inconsistências, executar `sync_active_calls_count()`
3. ✅ Se houver chamadas presas, corrigir com `CORRIGIR_CHAMADAS_PRESAS.sql`
4. ✅ Testar manualmente após mudanças importantes

---

**Documento criado em**: 2025-01-18
**Status**: ✅ Guia completo de verificação

