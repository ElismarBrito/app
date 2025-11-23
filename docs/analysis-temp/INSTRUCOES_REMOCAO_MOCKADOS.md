# 🧹 Instruções: Remover Dados Mockados do Banco

## 📊 RESULTADO DA VERIFICAÇÃO

### **Dados Mockados Encontrados:**
- ✅ **Chamadas mockadas:** 0 (já removidas ou nunca existiram)
- ⚠️ **Dispositivos mockados:** 2 (Samsung Galaxy S21, iPhone 13 Pro)
- ⚠️ **Listas mockadas:** 1 (uma das 3)

---

## 🔍 PASSO 1: VERIFICAR ANTES DE REMOVER

Execute a primeira parte de `REMOVER_MOCKADOS_BANCO.sql`:

```sql
-- Verificar dispositivos mockados e suas chamadas
SELECT 
    d.id,
    d.name,
    d.status,
    COUNT(c.id) AS total_chamadas,
    COUNT(c.id) FILTER (WHERE c.number NOT IN (
        '+55 11 99999-9999',
        '+55 11 88888-8888',
        '+55 11 77777-7777'
        -- ... outros números mockados
    )) AS chamadas_reais,
    CASE 
        WHEN COUNT(c.id) FILTER (WHERE c.number NOT IN (...)) > 0 
        THEN '⚠️ TEM CHAMADAS REAIS - NÃO DELETAR!'
        ELSE '✅ PODE REMOVER'
    END AS pode_remover
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
WHERE d.name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')
GROUP BY d.id, d.name, d.status;
```

**Resultado esperado:**
- Se mostrar "✅ PODE REMOVER" → Pode deletar
- Se mostrar "⚠️ TEM CHAMADAS REAIS" → **NÃO deletar!**

---

## ✅ PASSO 2: REMOVER DISPOSITIVOS MOCKADOS

### **IMPORTANTE:**
A query só remove dispositivos que:
1. ✅ Têm nome mockado
2. ✅ **NÃO têm chamadas reais** (só mockadas ou nenhuma)

Execute esta parte de `REMOVER_MOCKADOS_BANCO.sql`:

```sql
-- Remover dispositivos mockados (seguro)
DELETE FROM devices
WHERE name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')
  AND NOT EXISTS (
      -- Verifica se tem chamadas reais (não mockadas)
      SELECT 1 FROM calls c
      WHERE c.device_id = devices.id
        AND c.number NOT IN (
            '+55 11 99999-9999',
            '+55 11 88888-8888',
            '+55 11 77777-7777',
            '+55 11 66666-6666',
            '+55 11 55555-5555',
            '+55 11 44444-4444',
            '+55 11 33333-3333',
            '+55 11 22222-2222'
        )
  )
RETURNING id, name, status;
```

**O que vai acontecer:**
- ✅ Remove apenas dispositivos que **não têm chamadas reais**
- ✅ Protege dispositivos que têm chamadas reais
- ✅ Retorna quais dispositivos foram removidos

---

## ✅ PASSO 3: REMOVER LISTAS MOCKADAS

Execute esta parte:

```sql
-- Remover listas mockadas (se não tiverem chamadas)
DELETE FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP')
  AND NOT EXISTS (
      -- Verifica se tem chamadas vinculadas
      SELECT 1 FROM calls c
      WHERE c.campaign_id = number_lists.id
  )
RETURNING id, name, is_active;
```

**O que vai acontecer:**
- ✅ Remove apenas listas que **não têm chamadas vinculadas**
- ✅ Protege listas que têm chamadas reais
- ✅ Retorna quais listas foram removidas

---

## ✅ PASSO 4: VERIFICAÇÃO FINAL

Execute a verificação final:

```sql
-- Verificar se ainda há dados mockados
SELECT 
    'Dispositivos mockados restantes' AS tipo,
    COUNT(*) AS quantidade
FROM devices
WHERE name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')

UNION ALL

SELECT 
    'Listas mockadas restantes' AS tipo,
    COUNT(*) AS quantidade
FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP');
```

**Resultado esperado:**
- ✅ Ambas as quantidades devem ser **0**
- ✅ Todos os dados mockados removidos

---

## ⚠️ IMPORTANTE

### **Por que a query é segura:**
1. ✅ **Verifica antes de deletar** - Não remove dispositivos com chamadas reais
2. ✅ **Usa NOT EXISTS** - Só remove se não tiver chamadas reais
3. ✅ **Filtra números mockados** - Identifica chamadas reais vs mockadas

### **O que fazer se um dispositivo tiver "⚠️ TEM CHAMADAS REAIS":**
- ❌ **NÃO deletar** o dispositivo
- ✅ Verificar se realmente são chamadas reais
- ✅ Se forem mockadas, atualizar as chamadas primeiro
- ✅ Depois tentar remover novamente

---

## 🎯 RESULTADO ESPERADO

Após executar todas as queries:
- ✅ 0 dispositivos mockados restantes
- ✅ 0 listas mockadas restantes
- ✅ Dados reais preservados
- ✅ Banco limpo e pronto para produção

---

**Documento criado em**: 2025-01-18
**Status**: ✅ Pronto para executar

