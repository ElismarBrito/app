-- Diagnóstico Rápido: Por que o índice não está sendo usado?

-- 1. Verificar tipo da coluna status
SELECT 
    'Tipo da coluna status:' AS info,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'calls'
  AND column_name = 'status';

-- 2. Atualizar estatísticas (IMPORTANTE!)
ANALYZE calls;

-- 3. Verificar tamanho da tabela
SELECT 
    'Tamanho da tabela:' AS info,
    COUNT(*) AS total_linhas
FROM calls;

-- 4. Teste FORÇANDO uso do índice (apenas diagnóstico)
SET enable_seqscan = OFF;

EXPLAIN ANALYZE
SELECT * FROM calls 
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC
LIMIT 100;

SET enable_seqscan = ON;

-- Se aparecer "Index Scan" com enable_seqscan = OFF, significa que:
-- ✅ O índice está funcionando
-- ⚠️ Mas o planner escolheu Seq Scan porque a tabela é muito pequena (19 linhas)

-- CONCLUSÃO: Com apenas 19 linhas, PostgreSQL prefere Seq Scan porque é mais rápido.
-- Os índices vão ser usados quando a tabela crescer (100+ linhas).

