# Guia de Validação de Índices Compostos

## 📋 Como Validar os Índices

### 1. Validação Rápida (Recomendado)

Execute o script rápido:
```bash
psql $DATABASE_URL -f supabase/scripts/validate_indexes_quick.sql
```

Ou no Supabase Dashboard:
- Vá em SQL Editor
- Cole o conteúdo de `supabase/scripts/validate_indexes_quick.sql`
- Execute

**Resultado esperado:**
- ✅ Todos os 7 índices compostos foram criados!

### 2. Validação Completa

Execute o script completo:
```bash
psql $DATABASE_URL -f supabase/scripts/validate_indexes.sql
```

### 3. Validação Manual com EXPLAIN ANALYZE

#### Teste 1: idx_calls_user_status

```sql
EXPLAIN ANALYZE
SELECT * FROM calls 
WHERE user_id = 'seu-user-id-aqui'
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC
LIMIT 100;
```

**✅ Sucesso se aparecer:**
```
Index Scan using idx_calls_user_status on calls
```

**❌ Problema se aparecer:**
```
Seq Scan on calls  -- Índice não está sendo usado!
```

#### Teste 2: idx_calls_device_status

```sql
EXPLAIN ANALYZE
SELECT * FROM calls 
WHERE device_id = 'seu-device-id-aqui'
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC;
```

**✅ Deve mostrar:** `Index Scan using idx_calls_device_status`

#### Teste 3: idx_calls_device_start_time

```sql
EXPLAIN ANALYZE
SELECT * FROM calls 
WHERE device_id = 'seu-device-id-aqui'
  AND device_id IS NOT NULL
ORDER BY start_time DESC
LIMIT 50;
```

**✅ Deve mostrar:** `Index Scan using idx_calls_device_start_time`

## 📊 Métricas de Performance

### Ver Estatísticas de Uso

```sql
SELECT
    indexname,
    idx_scan AS vezes_usado,
    idx_tup_read AS tuplas_lidas,
    pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%_user_status' 
     OR indexname LIKE 'idx_%_device_status'
ORDER BY idx_scan DESC;
```

### Comparar Performance

**Antes dos índices (estimado):**
- Query com `user_id + status`: ~500-1000ms (Seq Scan)

**Depois dos índices (esperado):**
- Query com `user_id + status`: ~10-50ms (Index Scan)

## 🔍 Troubleshooting

### Problema: Índice não está sendo usado

**Possíveis causas:**
1. **Estatísticas desatualizadas** - Execute:
   ```sql
   ANALYZE calls;
   ANALYZE devices;
   ```

2. **Query não corresponde ao índice** - Verifique se os filtros estão corretos

3. **Tabela muito pequena** - PostgreSQL pode escolher Seq Scan para tabelas pequenas (< 1000 linhas)

### Problema: Índice não existe

**Solução:**
```sql
-- Verificar se a migration foi executada
SELECT * FROM supabase_migrations.schema_migrations 
WHERE name LIKE '%create_composite_indexes%';

-- Se não existir, executar a migration manualmente
\i supabase/migrations/20250117000001_create_composite_indexes.sql
```

## ✅ Checklist de Validação

- [ ] Todos os 7 índices existem no banco
- [ ] Índices estão sendo usados nas queries (EXPLAIN mostra Index Scan)
- [ ] Performance melhorou nas queries frequentes
- [ ] Estatísticas de uso mostram índices sendo utilizados
- [ ] Tamanho dos índices é razoável (< 10% do tamanho da tabela)

## 📈 Resultados Esperados

Após validação bem-sucedida:
- ✅ Queries com `user_id + status` devem ser 10-50x mais rápidas
- ✅ Dashboard deve carregar mais rápido
- ✅ Subscriptions Realtime devem responder mais rápido
- ✅ Menor carga no banco de dados

