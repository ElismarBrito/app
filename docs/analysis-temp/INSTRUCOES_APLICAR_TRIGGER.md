# ✅ Instruções: Aplicar Migration do Trigger

## 📋 STATUS ATUAL

### **Verificações Concluídas:**
- ✅ `active_calls_count` existe em devices
- ✅ Trigger pode ser criado (não existe ainda)
- ✅ Status pode comparar com strings (CAST funciona)
- ✅ **TUDO PRONTO PARA APLICAR** 🎉

---

## 🚀 COMO APLICAR A MIGRATION

### **PASSO 1: Abrir Supabase Dashboard**
1. Acessar: https://supabase.com/dashboard
2. Selecionar seu projeto
3. Ir em: **SQL Editor** (no menu lateral)

---

### **PASSO 2: Copiar Migration**
1. Abrir arquivo: `supabase/migrations/20250117000002_trigger_active_calls_count.sql`
2. **Selecionar TODO o conteúdo** (Ctrl+A)
3. **Copiar** (Ctrl+C)

---

### **PASSO 3: Colar no SQL Editor**
1. No Supabase SQL Editor, **colar** o conteúdo (Ctrl+V)
2. Verificar se o conteúdo está completo

---

### **PASSO 4: Executar**
1. Clicar em **Run** ou pressionar **Ctrl+Enter**
2. Aguardar execução
3. Verificar mensagem de sucesso

**Mensagem esperada:**
```
Trigger for active_calls_count created successfully
```

---

## ✅ O QUE A MIGRATION FAZ

### **1. Cria Função `update_device_call_count()`**
- ✅ Atualiza contador quando INSERT ocorre
- ✅ Atualiza contador quando UPDATE ocorre (mudança de status)
- ✅ Atualiza contador quando DELETE ocorre

### **2. Cria Trigger `trigger_update_call_count`**
- ✅ Executado após INSERT, UPDATE ou DELETE na tabela `calls`
- ✅ Mantém `active_calls_count` sempre atualizado

### **3. Cria Função `sync_active_calls_count()`**
- ✅ Sincroniza contadores existentes (corrige dados históricos)
- ✅ Executada automaticamente na migration

---

## 🧪 COMO TESTAR APÓS APLICAR

### **Teste 1: Verificar Contadores Atuais**
```sql
SELECT 
    id, 
    name, 
    active_calls_count,
    status
FROM devices
ORDER BY active_calls_count DESC;
```

### **Teste 2: Verificar Trigger Funcionando**
```sql
-- Inserir uma chamada ativa (substituir UUIDs pelos seus)
INSERT INTO calls (user_id, device_id, number, status)
VALUES (
    'user-uuid-aqui', 
    'device-uuid-aqui', 
    '123456789', 
    'ringing'
);

-- Verificar se contador atualizou
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'device-uuid-aqui';
```

### **Teste 3: Atualizar Status**
```sql
-- Mudar status de ringing para answered (aumenta contador se estava errado)
UPDATE calls 
SET status = 'answered' 
WHERE status = 'ringing' 
  AND device_id = 'device-uuid-aqui';

-- Verificar se contador está correto
SELECT id, name, active_calls_count 
FROM devices 
WHERE id = 'device-uuid-aqui';
```

---

## ⚠️ OBSERVAÇÕES IMPORTANTES

### **Status Ativo vs Inativo:**
**Status Ativos (contam no contador):**
- `ringing`
- `answered`
- `dialing`

**Status Inativos (não contam):**
- `ended`
- `completed`
- `failed`
- `busy`
- `no_answer`
- `queued`

### **Sincronização Automática:**
- ✅ Contadores são sincronizados automaticamente na migration
- ✅ Se houver inconsistências, serão corrigidas
- ✅ Contadores futuros serão mantidos automaticamente

---

## 🎯 PRÓXIMOS PASSOS

### **Após Aplicar o Trigger:**
1. ✅ Testar trigger (verificar se funciona)
2. ✅ Aplicar validação de schema: `update_schema.sql`
3. ✅ Aplicar índices compostos: `create_composite_indexes.sql`
4. ✅ Refatorar código para usar índices

---

## ❓ PROBLEMAS COMUNS

### **Erro: "function update_device_call_count() already exists"**
- ✅ **Solução:** Migration usa `CREATE OR REPLACE` - não é problema
- ✅ Função será atualizada

### **Erro: "trigger trigger_update_call_count already exists"**
- ✅ **Solução:** Migration usa `DROP TRIGGER IF EXISTS` - não é problema
- ✅ Trigger será recriado

### **Contador não atualiza após INSERT**
- ✅ Verificar se `device_id` não é NULL
- ✅ Verificar se `status` está em: 'ringing', 'answered', 'dialing'
- ✅ Verificar se trigger foi criado corretamente

---

## ✅ CHECKLIST

Antes de aplicar:
- [x] `active_calls_count` existe
- [x] Trigger pode ser criado
- [x] Status pode comparar com strings
- [ ] Conteúdo da migration copiado
- [ ] SQL Editor aberto no Supabase
- [ ] Pronto para executar

Após aplicar:
- [ ] Mensagem de sucesso recebida
- [ ] Trigger criado (verificar)
- [ ] Contadores sincronizados
- [ ] Teste funcionando

---

**Documento criado em**: 2025-01-18
**Status**: ✅ Pronto para aplicar!

