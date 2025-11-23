-- Script para diagnosticar e corrigir uso de índices
-- Problema: Índices não estão sendo usados (Seq Scan ao invés de Index Scan)

-- ============================================
-- 1. VERIFICAR TIPO DA COLUNA STATUS
-- ============================================

SELECT 
    'Verificando tipo da coluna status em calls...' AS etapa;

SELECT 
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'calls'
  AND column_name = 'status';

-- Se for TEXT ao invés de call_status_enum, o índice pode não funcionar corretamente

-- ============================================
-- 2. ATUALIZAR ESTATÍSTICAS DO BANCO
-- ============================================

SELECT 
    'Atualizando estatísticas do banco...' AS etapa;

-- Atualiza estatísticas para o planner usar os índices corretamente
ANALYZE calls;
ANALYZE devices;
ANALYZE number_lists;
ANALYZE qr_sessions;

SELECT 'Estatísticas atualizadas!' AS resultado;

-- ============================================
-- 3. VERIFICAR SE OS ÍNDICES ESTÃO VÁLIDOS
-- ============================================

SELECT 
    'Verificando se os índices estão válidos...' AS etapa;

SELECT
    pi.indexname,
    CASE 
        WHEN NOT pidx.indisvalid THEN '❌ INVÁLIDO'
        WHEN pidx.indisready THEN '⚠️ PRONTO (mas não ativo)'
        ELSE '✅ ATIVO'
    END AS status,
    pg_size_pretty(pg_relation_size(pc.oid::regclass)) AS tamanho
FROM pg_indexes pi
JOIN pg_class pc ON pi.indexname = pc.relname
JOIN pg_index pidx ON pc.oid = pidx.indexrelid
WHERE pi.schemaname = 'public'
  AND pi.indexname IN (
    'idx_calls_user_status',
    'idx_calls_device_status',
    'idx_calls_user_device',
    'idx_calls_device_start_time'
  );

-- ============================================
-- 4. VERIFICAR TAMANHO DA TABELA
-- ============================================

SELECT 
    'Verificando tamanho da tabela calls...' AS etapa;

SELECT 
    COUNT(*) AS total_linhas,
    pg_size_pretty(pg_total_relation_size('calls')) AS tamanho_total,
    pg_size_pretty(pg_relation_size('calls')) AS tamanho_tabela
FROM calls;

-- NOTA: PostgreSQL pode escolher Seq Scan para tabelas muito pequenas (< 1000 linhas)
-- mesmo com índices, porque Seq Scan pode ser mais rápido para poucos dados

-- ============================================
-- 5. TESTE COM FORÇA DE USO DO ÍNDICE (apenas para teste)
-- ============================================

-- IMPORTANTE: Este é apenas para diagnóstico, não use em produção!
-- Força o uso do índice mesmo em tabelas pequenas

SET enable_seqscan = OFF;  -- Desabilita Seq Scan temporariamente (apenas para teste)

EXPLAIN ANALYZE
SELECT * FROM calls 
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC
LIMIT 100;

-- Se agora aparecer "Index Scan", o índice está funcionando, mas o planner
-- escolheu Seq Scan porque a tabela é pequena

SET enable_seqscan = ON;  -- Reabilita Seq Scan

-- ============================================
-- 6. VERIFICAR SE O ÍNDICE TEM A CLAUSULA WHERE CORRETA
-- ============================================

SELECT 
    'Verificando definição dos índices...' AS etapa;

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_calls_user_status',
    'idx_calls_device_status'
  );

-- Verificar se a cláusula WHERE do índice corresponde aos valores usados na query

