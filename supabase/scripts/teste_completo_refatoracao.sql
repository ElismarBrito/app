-- ============================================
-- TESTE COMPLETO: Validação de Refatoração
-- Compatível com Supabase Dashboard SQL Editor
-- ============================================
-- Execute este script no Supabase Dashboard → SQL Editor
-- Data: 2025-01-21
-- 
-- Este script valida:
-- 1. Se os índices foram criados
-- 2. Se os índices estão sendo usados
-- 3. Performance das queries
-- 4. Estatísticas de uso
-- ============================================

-- ============================================
-- TESTE 1: Verificar se Índices Foram Criados
-- ============================================

SELECT 
    'TESTE 1: Verificar Índices Criados' AS teste,
    CASE 
        WHEN COUNT(*) = 7 THEN '✅ SUCESSO: Todos os 7 índices compostos foram criados!'
        ELSE '❌ ERRO: Apenas ' || COUNT(*)::text || ' de 7 índices foram criados.'
    END AS resultado
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname = 'idx_devices_user_status' OR
    indexname = 'idx_calls_device_status' OR
    indexname = 'idx_calls_user_status' OR
    indexname = 'idx_calls_user_device' OR
    indexname = 'idx_calls_device_start_time' OR
    indexname = 'idx_qr_sessions_user_valid' OR
    indexname = 'idx_number_lists_user_active'
  );

-- Lista detalhada dos índices criados
SELECT 
    'Lista de Índices Criados' AS info,
    tablename AS tabela,
    indexname AS indice,
    CASE 
        WHEN indexname = 'idx_devices_user_status' THEN '✅'
        WHEN indexname = 'idx_calls_device_status' THEN '✅'
        WHEN indexname = 'idx_calls_user_status' THEN '✅'
        WHEN indexname = 'idx_calls_user_device' THEN '✅'
        WHEN indexname = 'idx_calls_device_start_time' THEN '✅'
        WHEN indexname = 'idx_qr_sessions_user_valid' THEN '✅'
        WHEN indexname = 'idx_number_lists_user_active' THEN '✅'
        ELSE '❌'
    END AS status
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname = 'idx_devices_user_status' OR
    indexname = 'idx_calls_device_status' OR
    indexname = 'idx_calls_user_status' OR
    indexname = 'idx_calls_user_device' OR
    indexname = 'idx_calls_device_start_time' OR
    indexname = 'idx_qr_sessions_user_valid' OR
    indexname = 'idx_number_lists_user_active'
  )
ORDER BY tablename, indexname;

-- ============================================
-- TESTE 2: Verificar se Índices Estão Sendo Usados
-- ============================================
-- IMPORTANTE: Veja o resultado do EXPLAIN ANALYZE abaixo
-- ✅ Deve aparecer "Index Scan using idx_calls_user_status"
-- ❌ Se aparecer "Seq Scan on calls" = problema

SELECT 'TESTE 2: Verificar Uso do Índice idx_calls_user_status' AS teste,
       'Veja o resultado do EXPLAIN ANALYZE abaixo' AS instrucao;

-- Teste: idx_calls_user_status
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, number, status, start_time
FROM public.calls
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC
LIMIT 10;

-- ============================================
-- TESTE 3: Verificar Performance
-- ============================================
-- Execution Time deve ser < 50ms

SELECT 'TESTE 3: Verificar Performance de idx_devices_user_status' AS teste,
       'Execution Time deve ser < 50ms' AS instrucao;

-- Teste de performance: idx_devices_user_status
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, status
FROM public.devices
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND status = 'online'
ORDER BY created_at DESC;

-- ============================================
-- TESTE 4: Verificar Estatísticas dos Índices
-- ============================================

SELECT 'TESTE 4: Estatísticas de Uso dos Índices' AS teste;

-- Ver estatísticas de uso dos índices
SELECT
    'Estatísticas' AS info,
    relname AS tabela,
    indexrelname AS indice,
    idx_scan AS vezes_usado,
    idx_tup_read AS tuplas_lidas,
    idx_tup_fetch AS tuplas_buscadas,
    pg_size_pretty(pg_relation_size(indexrelid::regclass)) AS tamanho
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (
    indexrelname = 'idx_devices_user_status' OR
    indexrelname = 'idx_calls_device_status' OR
    indexrelname = 'idx_calls_user_status' OR
    indexrelname = 'idx_calls_user_device' OR
    indexrelname = 'idx_calls_device_start_time' OR
    indexrelname = 'idx_qr_sessions_user_valid' OR
    indexrelname = 'idx_number_lists_user_active'
  )
ORDER BY idx_scan DESC;

-- ============================================
-- TESTE 5: Resumo Final
-- ============================================

SELECT 
    '✅ Índices Criados' AS teste,
    CASE 
        WHEN (SELECT COUNT(*) FROM pg_indexes 
              WHERE schemaname = 'public' 
              AND indexname IN ('idx_devices_user_status', 'idx_calls_device_status', 
                                'idx_calls_user_status', 'idx_calls_user_device',
                                'idx_calls_device_start_time', 'idx_qr_sessions_user_valid',
                                'idx_number_lists_user_active')) = 7
        THEN '✅ PASSOU'
        ELSE '❌ FALHOU'
    END AS resultado
UNION ALL
SELECT 
    '✅ Índices Sendo Usados' AS teste,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_stat_user_indexes 
            WHERE schemaname = 'public' 
            AND indexrelname IN ('idx_devices_user_status', 'idx_calls_device_status', 
                                 'idx_calls_user_status', 'idx_calls_user_device',
                                 'idx_calls_device_start_time', 'idx_qr_sessions_user_valid',
                                 'idx_number_lists_user_active')
            AND idx_scan > 0
        ) THEN '✅ PASSOU (ou ainda não usado - normal)'
        ELSE '⚠️ AINDA NÃO USADO (normal se não houver queries)'
    END AS resultado;
