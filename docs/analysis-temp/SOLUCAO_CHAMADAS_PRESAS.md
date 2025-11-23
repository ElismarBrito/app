# 🔧 Solução: Chamadas Presas em Status Ativo

## 🔍 PROBLEMA IDENTIFICADO

### **Situação:**
- ✅ 2 chamadas com status `ringing` desde **19 de novembro** (mais de 1 mês!)
- ✅ Contador mostra `active_calls_count = 2`
- ⚠️ Chamadas deveriam ter sido finalizadas automaticamente
- ❌ Código não atualizou o status para `ended`

### **Causa Provável:**
1. **App Android não notificou** o estado `disconnected` para essas chamadas
2. **Evento não foi recebido** pelo código React (`useCallStatusSync`)
3. **Mapeamento perdido** - `callIdMap` não tinha o mapeamento quando a chamada terminou
4. **App foi fechado** antes do evento ser processado

---

## ✅ SOLUÇÃO IMEDIATA: CORRIGIR CHAMADAS PRESAS

### **PASSO 1: Executar Diagnóstico**

Execute a query `DIAGNOSTICO_CHAMADAS_PRESAS.sql` para ver todas as chamadas presas:

```sql
-- Ver todas as chamadas presas em status ativo
SELECT 
    c.id,
    c.number,
    c.status,
    c.start_time,
    NOW() - c.start_time AS tempo_decorrido,
    CASE 
        WHEN NOW() - c.start_time > INTERVAL '1 hour' THEN '⚠️ MUITO ANTIGA'
        WHEN NOW() - c.start_time > INTERVAL '10 minutes' THEN '⚠️ ANTIGA'
        ELSE '✅ OK'
    END AS status_tempo
FROM calls c
WHERE c.status IN ('ringing', 'dialing')
  AND NOW() - c.start_time > INTERVAL '5 minutes'
ORDER BY c.start_time ASC;
```

---

### **PASSO 2: Corrigir Chamadas Presas**

Execute a query `CORRIGIR_CHAMADAS_PRESAS.sql`:

**IMPORTANTE:** Esta query vai:
1. ✅ Atualizar chamadas presas há mais de **5 minutos** para status `ended`
2. ✅ O **trigger vai atualizar automaticamente** o `active_calls_count`
3. ✅ Contador vai diminuir de 2 para 0 (correto!)

```sql
-- Corrigir chamadas presas
UPDATE calls
SET status = 'ended',
    updated_at = NOW(),
    failure_reason = 'Auto-corrected: chamada presa em status ativo'
WHERE status IN ('ringing', 'dialing')
  AND NOW() - start_time > INTERVAL '5 minutes'
RETURNING 
    id,
    number,
    status AS novo_status,
    start_time;
```

---

### **PASSO 3: Verificar Contador Após Correção**

Execute esta query para confirmar que o contador está correto:

```sql
-- Verificar contador após correção
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '⚠️ AINDA INCONSISTENTE'
    END AS status_validacao
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
WHERE d.id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754'
GROUP BY d.id, d.name, d.active_calls_count;
```

**Resultado esperado:**
- ✅ `contador_trigger` = 0
- ✅ `contador_real` = 0
- ✅ Status: "✅ CORRETO"

---

## 🛡️ SOLUÇÃO PREVENTIVA: Job de Limpeza Automática

### **Criar Função de Limpeza:**

Vou criar uma migration para criar um job que limpa chamadas presas automaticamente:

```sql
-- Função para limpar chamadas presas
CREATE OR REPLACE FUNCTION cleanup_stuck_calls()
RETURNS void AS $$
BEGIN
    UPDATE calls
    SET status = 'ended',
        updated_at = NOW(),
        failure_reason = 'Auto-corrected: chamada presa em status ativo (cleanup job)'
    WHERE status IN ('ringing', 'dialing')
      AND NOW() - start_time > INTERVAL '5 minutes';
    
    RAISE NOTICE 'Chamadas presas limpas automaticamente';
END;
$$ LANGUAGE plpgsql;
```

### **Executar Manualmente (se necessário):**

```sql
-- Executar limpeza manual
SELECT cleanup_stuck_calls();
```

---

## 🔍 DIAGNÓSTICO DO CÓDIGO

### **Onde o Problema Pode Estar:**

1. **`useCallStatusSync.ts`:**
   - ⚠️ Depende de `callIdMap` ter o mapeamento
   - ⚠️ Se o evento não for recebido, status não é atualizado

2. **Código Android:**
   - ⚠️ Pode não estar enviando evento `disconnected` sempre
   - ⚠️ App pode ter sido fechado antes do evento ser enviado

3. **Problema de Sincronização:**
   - ⚠️ Se o app perde conexão, eventos podem ser perdidos
   - ⚠️ Chamadas que terminam offline não são atualizadas

---

## ✅ RECOMENDAÇÕES

### **1. Aplicar Correção Imediata:**
- ✅ Executar `CORRIGIR_CHAMADAS_PRESAS.sql` agora
- ✅ Isso vai corrigir as 2 chamadas presas

### **2. Criar Job de Limpeza:**
- ✅ Criar função `cleanup_stuck_calls()`
- ✅ Executar periodicamente (ou manualmente quando necessário)

### **3. Melhorar Código (Futuro):**
- ⚠️ Adicionar timeout no código React
- ⚠️ Verificar chamadas pendentes ao iniciar app
- ⚠️ Adicionar fallback para atualizar status se evento não chegar

---

## 📋 CHECKLIST

### **Correção Imediata:**
- [ ] Executar diagnóstico (`DIAGNOSTICO_CHAMADAS_PRESAS.sql`)
- [ ] Executar correção (`CORRIGIR_CHAMADAS_PRESAS.sql`)
- [ ] Verificar contador após correção
- [ ] Confirmar que contador está correto (deve ser 0)

### **Prevenção Futura:**
- [ ] Criar função `cleanup_stuck_calls()`
- [ ] Executar limpeza periodicamente (ou manualmente)
- [ ] Melhorar código para evitar o problema

---

## 🎯 RESULTADO ESPERADO

Após executar a correção:
- ✅ Chamadas presas atualizadas para `ended`
- ✅ `active_calls_count` atualizado automaticamente pelo trigger
- ✅ Contador deve ser **0** (correto!)
- ✅ Problema resolvido!

---

**Documento criado em**: 2025-01-18
**Status**: ✅ Solução pronta para aplicar

