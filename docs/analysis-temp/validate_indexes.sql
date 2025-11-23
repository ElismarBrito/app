-- Script de Validação de Índices Compostos
-- Data: 2025-01-21
-- Descrição: Valida se os índices compostos estão criados e sendo utilizados

-- ============================================
-- 1. VERIFICAR SE OS ÍNDICES EXISTEM
-- ============================================

SELECT 
    'Verificando índices compostos...' AS etapa;

-- Lista todos os índices compostos esperados
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname LIKE 'idx_devices_user_status' OR
    indexname LIKE 'idx_calls_device_status' OR
    indexname LIKE 'idx_calls_user_status' OR
    indexname LIKE 'idx_calls_user_device' OR
    indexname LIKE 'idx_calls_device_start_time' OR
    indexname LIKE 'idx_qr_sessions_user_valid' OR
    indexname LIKE 'idx_number_lists_user_active'
  )
ORDER BY tablename, indexname;

-- ============================================
-- 2. VALIDAR USO DOS ÍNDICES COM EXPLAIN ANALYZE
-- ============================================

-- NOTA: Para testar, você precisa substituir os valores de exemplo pelos seus dados reais

-- 2.1. Teste idx_calls_user_status
-- Query que DEVE usar este índice: buscar chamadas ativas do usuário
SELECT 
    'Testando idx_calls_user_status...' AS teste;

-- Substitua 'SEU_USER_ID_AQUI' por um user_id real do seu banco
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, number, status, start_time, device_id
FROM public.calls
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)  -- Pega primeiro user como exemplo
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC
LIMIT 100;

-- Verificar se apareceu "Index Scan using idx_calls_user_status"
-- Se aparecer "Seq Scan" ou "Bitmap Heap Scan", o índice pode não estar sendo usado

-- 2.2. Teste idx_calls_device_status
SELECT 
    'Testando idx_calls_device_status...' AS teste;

-- Substitua 'SEU_DEVICE_ID_AQUI' por um device_id real
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, number, status, start_time
FROM public.calls
WHERE device_id = (SELECT id FROM public.devices LIMIT 1)  -- Pega primeiro device como exemplo
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC;

-- 2.3. Teste idx_calls_device_start_time
SELECT 
    'Testando idx_calls_device_start_time...' AS teste;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, number, status, start_time
FROM public.calls
WHERE device_id = (SELECT id FROM public.devices LIMIT 1)
  AND device_id IS NOT NULL
ORDER BY start_time DESC
LIMIT 50;

-- 2.4. Teste idx_devices_user_status
SELECT 
    'Testando idx_devices_user_status...' AS teste;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, name, status, last_seen
FROM public.devices
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND status IN ('online', 'offline')
ORDER BY last_seen DESC;

-- 2.5. Teste idx_number_lists_user_active
SELECT 
    'Testando idx_number_lists_user_active...' AS teste;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, name, numbers, is_active
FROM public.number_lists
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND is_active = true
ORDER BY created_at DESC;

-- ============================================
-- 3. ESTATÍSTICAS DOS ÍNDICES
-- ============================================

SELECT 
    'Estatísticas de uso dos índices...' AS etapa;

-- Ver tamanho dos índices
SELECT
    schemaname,
    relname AS tablename,
    indexrelname AS indexname,
    pg_size_pretty(pg_relation_size(indexrelid::regclass)) AS tamanho,
    idx_scan AS vezes_usado,
    idx_tup_read AS tuplas_lidas,
    idx_tup_fetch AS tuplas_buscadas
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (
    indexrelname LIKE 'idx_devices_user_status' OR
    indexrelname LIKE 'idx_calls_device_status' OR
    indexrelname LIKE 'idx_calls_user_status' OR
    indexrelname LIKE 'idx_calls_user_device' OR
    indexrelname LIKE 'idx_calls_device_start_time' OR
    indexrelname LIKE 'idx_qr_sessions_user_valid' OR
    indexrelname LIKE 'idx_number_lists_user_active'
  )
ORDER BY idx_scan DESC;

-- ============================================
-- 4. VERIFICAR ÍNDICES PARCIAIS (WHERE clauses)
-- ============================================

SELECT 
    'Verificando índices parciais (WHERE clauses)...' AS etapa;

SELECT
    i.relname AS index_name,
    t.relname AS table_name,
    pg_get_indexdef(i.oid) AS index_definition
FROM pg_class i
JOIN pg_index idx ON i.oid = idx.indexrelid
JOIN pg_class t ON idx.indrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND (
    i.relname LIKE 'idx_devices_user_status' OR
    i.relname LIKE 'idx_calls_device_status' OR
    i.relname LIKE 'idx_calls_user_status' OR
    i.relname LIKE 'idx_calls_user_device' OR
    i.relname LIKE 'idx_calls_device_start_time' OR
    i.relname LIKE 'idx_qr_sessions_user_valid' OR
    i.relname LIKE 'idx_number_lists_user_active'
  )
ORDER BY t.relname, i.relname;

-- ============================================
-- 5. COMPARAR PERFORMANCE (ANTES vs DEPOIS)
-- ============================================

-- NOTA: Execute estas queries e anote os tempos de execução
-- Depois compare com queries similares sem os índices
-- Use EXPLAIN ANALYZE para ver o tempo de execução

SELECT 
    'Teste de performance - Query com índice...' AS teste;

-- Query otimizada que DEVE usar idx_calls_user_status
-- Execute com EXPLAIN ANALYZE para ver o tempo de execução
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT COUNT(*) 
FROM public.calls
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND status IN ('ringing', 'answered', 'dialing')
  AND start_time >= NOW() - INTERVAL '24 hours';

-- ============================================
-- 6. VERIFICAR SE OS ÍNDICES ESTÃO BLOQUEADOS OU INATIVOS
-- ============================================

SELECT 
    'Verificando status dos índices...' AS etapa;

SELECT
    pi.schemaname,
    pi.tablename,
    pi.indexname,
    CASE 
        WHEN NOT pidx.indisvalid THEN 'INVÁLIDO'
        WHEN pidx.indisready THEN 'PRONTO'
        ELSE 'ATIVO'
    END AS status,
    pg_size_pretty(pg_relation_size(pc.oid::regclass)) AS tamanho
FROM pg_indexes pi
JOIN pg_class pc ON pi.indexname = pc.relname
JOIN pg_index pidx ON pc.oid = pidx.indexrelid
WHERE pi.schemaname = 'public'
  AND (
    pi.indexname LIKE 'idx_devices_user_status' OR
    pi.indexname LIKE 'idx_calls_device_status' OR
    pi.indexname LIKE 'idx_calls_user_status' OR
    pi.indexname LIKE 'idx_calls_user_device' OR
    pi.indexname LIKE 'idx_calls_device_start_time' OR
    pi.indexname LIKE 'idx_qr_sessions_user_valid' OR
    pi.indexname LIKE 'idx_number_lists_user_active'
  );

-- ============================================
-- RESUMO FINAL
-- ============================================

SELECT 
    '=== RESUMO DA VALIDAÇÃO ===' AS resumo;

SELECT
    COUNT(*) AS total_indices_encontrados,
    COUNT(*) FILTER (WHERE indexname LIKE 'idx_devices%') AS indices_devices,
    COUNT(*) FILTER (WHERE indexname LIKE 'idx_calls%') AS indices_calls,
    COUNT(*) FILTER (WHERE indexname LIKE 'idx_qr_sessions%') AS indices_qr_sessions,
    COUNT(*) FILTER (WHERE indexname LIKE 'idx_number_lists%') AS indices_number_lists
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname LIKE 'idx_devices_user_status' OR
    indexname LIKE 'idx_calls_device_status' OR
    indexname LIKE 'idx_calls_user_status' OR
    indexname LIKE 'idx_calls_user_device' OR
    indexname LIKE 'idx_calls_device_start_time' OR
    indexname LIKE 'idx_qr_sessions_user_valid' OR
    indexname LIKE 'idx_number_lists_user_active'
  );

