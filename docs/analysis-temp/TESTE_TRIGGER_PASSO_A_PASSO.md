# 🧪 Teste Completo do Trigger: Passo a Passo

## 📋 COMO TESTAR O TRIGGER

Este guia mostra como testar o trigger `active_calls_count` nas operações:
1. ✅ **INSERT** - Inserir chamada ativa
2. ✅ **UPDATE** - Mudar status da chamada
3. ✅ **DELETE** - Deletar chamada ativa
4. ✅ **LISTAR** - Verificar estado atual

---

## 🔧 PREPARAÇÃO

### **PASSO 1: Pegar UUIDs Necessários**

Execute estas queries no Supabase SQL Editor:

#### **A) Pegar user_id:**
```sql
SELECT id, email FROM auth.users LIMIT 1;
```
**Copie o `id`** - você vai precisar dele!

#### **B) Pegar device_id:**
```sql
SELECT id, name, active_calls_count 
FROM devices 
ORDER BY name 
LIMIT 5;
```
**Copie um `id`** de um dispositivo - você vai usar para teste!

#### **C) Verificar Estado Inicial:**
```sql
-- Ver contador ANTES dos testes
SELECT 
    id, 
    name, 
    active_calls_count AS contador_inicial
FROM devices 
WHERE id = 'cole-device-id-aqui';
```
**Anote o valor de `contador_inicial`** para comparar depois!

---

## ✅ TESTE 1: INSERT - Inserir Chamada Ativa

### **O que esperamos:**
- ✅ Contador deve **AUMENTAR em 1**
- ✅ Chamada deve ser criada

### **Passos:**

1. **Inserir chamada com status ativo:**
```sql
-- SUBSTITUIR UUIDs PELOS SEUS REAIS!
INSERT INTO calls (user_id, device_id, number, status)
VALUES (
    'seu-user-id-aqui',        -- Substituir!
    'seu-device-id-aqui',      -- Substituir!
    '11999999999', 
    'ringing'                  -- Status ATIVO (contará no contador)
)
RETURNING id, number, status, device_id;
```

2. **Verificar se contador aumentou:**
```sql
SELECT 
    id, 
    name, 
    active_calls_count AS contador_depois_insert
FROM devices 
WHERE id = 'seu-device-id-aqui';
```

**Resultado esperado:**
- ✅ `contador_depois_insert` = `contador_inicial` + 1
- ✅ Contador deve ter aumentado em 1

---

## ✅ TESTE 2: UPDATE - Mudar Status de Ativa para Inativa

### **O que esperamos:**
- ✅ Contador deve **DIMINUIR em 1**
- ✅ Chamada deve mudar de status

### **Passos:**

1. **Pegar ID da chamada inserida:**
```sql
-- Buscar chamada que inserimos
SELECT id, number, status 
FROM calls 
WHERE device_id = 'seu-device-id-aqui' 
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC 
LIMIT 1;
```
**Copie o `id` da chamada!**

2. **Mudar status para inativo:**
```sql
-- SUBSTITUIR call-id PELO ID DA CHAMADA!
UPDATE calls 
SET status = 'ended'  -- Status INATIVO (não contará mais)
WHERE id = 'call-id-aqui'  -- Substituir!
RETURNING id, number, status;
```

3. **Verificar se contador diminuiu:**
```sql
SELECT 
    id, 
    name, 
    active_calls_count AS contador_depois_update
FROM devices 
WHERE id = 'seu-device-id-aqui';
```

**Resultado esperado:**
- ✅ `contador_depois_update` = `contador_depois_insert` - 1
- ✅ Contador deve ter diminuído em 1

---

## ✅ TESTE 3: UPDATE - Mudar Status de Inativa para Ativa

### **O que esperamos:**
- ✅ Contador deve **AUMENTAR em 1**
- ✅ Chamada deve voltar a status ativo

### **Passos:**

1. **Mudar status de volta para ativo:**
```sql
-- SUBSTITUIR call-id PELO ID DA CHAMADA!
UPDATE calls 
SET status = 'ringing'  -- Status ATIVO (contará novamente)
WHERE id = 'call-id-aqui'  -- Substituir!
RETURNING id, number, status;
```

2. **Verificar se contador aumentou:**
```sql
SELECT 
    id, 
    name, 
    active_calls_count AS contador_depois_update_ativa
FROM devices 
WHERE id = 'seu-device-id-aqui';
```

**Resultado esperado:**
- ✅ `contador_depois_update_ativa` = `contador_depois_update` + 1
- ✅ Contador deve ter aumentado em 1

---

## ✅ TESTE 4: DELETE - Deletar Chamada Ativa

### **O que esperamos:**
- ✅ Contador deve **DIMINUIR em 1**
- ✅ Chamada deve ser deletada

### **Passos:**

1. **Anotar contador atual:**
```sql
SELECT 
    id, 
    name, 
    active_calls_count AS contador_antes_delete
FROM devices 
WHERE id = 'seu-device-id-aqui';
```
**Anote o valor!**

2. **Deletar chamada ativa:**
```sql
-- SUBSTITUIR call-id PELO ID DA CHAMADA!
DELETE FROM calls
WHERE id = 'call-id-aqui'  -- Substituir!
RETURNING id, number, status;
```

3. **Verificar se contador diminuiu:**
```sql
SELECT 
    id, 
    name, 
    active_calls_count AS contador_depois_delete
FROM devices 
WHERE id = 'seu-device-id-aqui';
```

**Resultado esperado:**
- ✅ `contador_depois_delete` = `contador_antes_delete` - 1
- ✅ Contador deve ter diminuído em 1
- ✅ Chamada não deve existir mais

---

## ✅ TESTE 5: VERIFICAÇÃO FINAL

### **Comparar Contador com Realidade:**

```sql
-- Comparar contador do trigger com contagem real
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '⚠️ INCONSISTENTE'
    END AS status_validacao
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.active_calls_count
ORDER BY d.active_calls_count DESC;
```

**Resultado esperado:**
- ✅ Todas as linhas devem mostrar "✅ CORRETO"
- ✅ `contador_trigger` deve ser igual a `contador_real`

---

## ✅ TESTE 6: LISTAR Chamadas Ativas

### **Ver Todas as Chamadas Ativas por Dispositivo:**
```sql
SELECT 
    d.id AS device_id,
    d.name AS device_name,
    d.active_calls_count,
    c.id AS call_id,
    c.number,
    c.status,
    c.start_time
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id 
    AND c.status IN ('ringing', 'answered', 'dialing')
WHERE d.active_calls_count > 0 OR c.id IS NOT NULL
ORDER BY d.name, c.start_time DESC;
```

**Resultado esperado:**
- ✅ Mostra todos os dispositivos com chamadas ativas
- ✅ Lista todas as chamadas ativas de cada dispositivo
- ✅ `active_calls_count` deve corresponder ao número de chamadas listadas

---

## 📊 RESUMO DOS TESTES

### **Status dos Testes:**
- [ ] **TESTE 1:** INSERT - Contador aumenta ✅
- [ ] **TESTE 2:** UPDATE (ativa→inativa) - Contador diminui ✅
- [ ] **TESTE 3:** UPDATE (inativa→ativa) - Contador aumenta ✅
- [ ] **TESTE 4:** DELETE - Contador diminui ✅
- [ ] **TESTE 5:** Verificação final - Contadores corretos ✅
- [ ] **TESTE 6:** Listagem - Mostra chamadas ativas ✅

---

## 🎯 STATUS ESPERADO DOS STATUS

### **Status ATIVOS (contam no contador):**
- ✅ `ringing` - Chamada tocando
- ✅ `answered` - Chamada atendida
- ✅ `dialing` - Discando

### **Status INATIVOS (não contam):**
- ❌ `ended` - Chamada encerrada
- ❌ `completed` - Chamada completada
- ❌ `failed` - Chamada falhou
- ❌ `busy` - Linha ocupada
- ❌ `no_answer` - Sem resposta
- ❌ `queued` - Na fila (não conta ainda)

---

## ❓ PROBLEMAS COMUNS

### **Contador não aumenta ao inserir:**
- ✅ Verificar se `status` está em: 'ringing', 'answered', 'dialing'
- ✅ Verificar se `device_id` não é NULL
- ✅ Verificar se trigger foi criado: `SELECT * FROM information_schema.triggers WHERE trigger_name = 'trigger_update_call_count';`

### **Contador não diminui ao atualizar:**
- ✅ Verificar se mudou de status ATIVO para INATIVO
- ✅ Verificar se `status` antigo estava em: 'ringing', 'answered', 'dialing'
- ✅ Verificar se `status` novo NÃO está em: 'ringing', 'answered', 'dialing'

### **Contador inconsistente:**
- ✅ Executar: `SELECT sync_active_calls_count();` para resincronizar
- ✅ Verificar se há chamadas órfãs (sem device_id)

---

**Documento criado em**: 2025-01-18
**Status**: ✅ Pronto para testar!

