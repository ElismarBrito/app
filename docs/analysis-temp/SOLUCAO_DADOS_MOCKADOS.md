# 🧹 Solução: Remover Dados Mockados

## 🔍 PROBLEMA IDENTIFICADO

### **Dados Mockados Encontrados:**

1. **No arquivo `supabase/schema.sql` (linhas 137-153):**
   - ✅ INSERTs de dados de exemplo:
     - 2 dispositivos mockados (Samsung Galaxy S21, iPhone 13 Pro)
     - 3 chamadas mockadas (números fictícios)
     - 3 listas mockadas

2. **No banco de dados (se schema.sql foi executado):**
   - ⚠️ Pode haver dados mockados inseridos

---

## ✅ SOLUÇÃO: REMOVER DADOS MOCKADOS

### **PASSO 1: Verificar Dados Mockados no Banco**

Execute a query `VERIFICAR_DADOS_MOCKADOS.sql`:

```sql
-- Verificar se há dados mockados
SELECT 
    'Chamadas mockadas' AS tipo,
    COUNT(*) AS quantidade
FROM calls
WHERE number IN (
    '+55 11 99999-9999',
    '+55 11 88888-8888',
    '+55 11 77777-7777',
    '+55 11 66666-6666',
    '+55 11 55555-5555',
    '+55 11 44444-4444',
    '+55 11 33333-3333',
    '+55 11 22222-2222'
);

-- Verificar dispositivos mockados
SELECT id, name, status 
FROM devices 
WHERE name IN ('Samsung Galaxy S21', 'iPhone 13 Pro');

-- Verificar listas mockadas
SELECT id, name, is_active 
FROM number_lists 
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP');
```

---

### **PASSO 2: Remover Dados Mockados do Banco**

Execute a query `REMOVER_DADOS_MOCKADOS.sql`:

**IMPORTANTE:** Esta query vai **DELETAR** dados mockados!

```sql
-- Remover chamadas mockadas
DELETE FROM calls
WHERE number IN (
    '+55 11 99999-9999',
    '+55 11 88888-8888',
    '+55 11 77777-7777',
    '+55 11 66666-6666',
    '+55 11 55555-5555',
    '+55 11 44444-4444',
    '+55 11 33333-3333',
    '+55 11 22222-2222'
)
RETURNING id, number, status;

-- Remover listas mockadas
DELETE FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP')
RETURNING id, name;
```

**⚠️ CUIDADO com dispositivos:**
- Não delete dispositivos se eles têm chamadas reais!
- Execute a query de remoção de dispositivos apenas se tiver certeza

---

### **PASSO 3: Remover INSERTs do schema.sql**

Remover ou comentar as linhas 137-153 do arquivo `supabase/schema.sql`:

**Antes:**
```sql
-- Insert some sample data for demonstration
INSERT INTO public.devices (name, status, user_id) VALUES 
    ('Samsung Galaxy S21', 'online', auth.uid()),
    ('iPhone 13 Pro', 'offline', auth.uid())
ON CONFLICT DO NOTHING;

INSERT INTO public.calls (number, status, start_time, duration, user_id) VALUES 
    ('+55 11 99999-9999', 'answered', NOW() - INTERVAL '2 hours', 120, auth.uid()),
    ('+55 11 88888-8888', 'ended', NOW() - INTERVAL '1 hour', 85, auth.uid()),
    ('+55 11 77777-7777', 'ringing', NOW(), NULL, auth.uid())
ON CONFLICT DO NOTHING;

INSERT INTO public.number_lists (name, numbers, is_active, user_id) VALUES 
    ('Lista Principal', ARRAY['+55 11 99999-9999', '+55 11 88888-8888', '+55 11 77777-7777'], true, auth.uid()),
    ('Campanhas Janeiro', ARRAY['+55 11 66666-6666', '+55 11 55555-5555'], false, auth.uid()),
    ('Clientes VIP', ARRAY['+55 11 44444-4444', '+55 11 33333-3333', '+55 11 22222-2222'], true, auth.uid())
ON CONFLICT DO NOTHING;
```

**Depois (comentado ou removido):**
```sql
-- Dados de exemplo removidos - não usar em produção
-- Se precisar de dados de teste, criar manualmente ou via script separado
```

---

## 📋 CHECKLIST

### **Remoção de Dados Mockados:**
- [ ] Executar `VERIFICAR_DADOS_MOCKADOS.sql` (verificar se há dados)
- [ ] Executar `REMOVER_DADOS_MOCKADOS.sql` (remover do banco)
- [ ] Verificar se dados foram removidos
- [ ] Remover/comentar INSERTs do `schema.sql`
- [ ] Confirmar que não há mais dados mockados

---

## 🎯 RESULTADO ESPERADO

Após executar a remoção:
- ✅ Nenhuma chamada mockada no banco
- ✅ Nenhuma lista mockada no banco
- ✅ `schema.sql` não insere dados de exemplo
- ✅ Banco limpo e pronto para produção

---

## ⚠️ OBSERVAÇÕES

### **Dados Mockados em Código (OK):**
- ✅ Mocks em `useNativeSimDetection.ts` - OK (para web development)
- ✅ Mocks em `web.ts` - OK (para web development)
- ✅ São usados apenas para desenvolvimento web

### **Dados Mockados no Banco (PROBLEMA):**
- ❌ INSERTs no `schema.sql` - REMOVER
- ❌ Dados inseridos no banco - REMOVER

---

**Documento criado em**: 2025-01-18
**Status**: ✅ Solução pronta para aplicar

