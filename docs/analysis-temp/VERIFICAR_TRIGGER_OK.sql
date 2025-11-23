-- ============================================
-- VERIFICAÇÃO COMPLETA DO TRIGGER active_calls_count
-- ============================================

-- ============================================
-- 1. VERIFICAR SE TRIGGER EXISTE
-- ============================================
SELECT 
    '=== VERIFICAÇÃO: TRIGGER EXISTE? ===' AS info;

SELECT 
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation,
    action_statement,
    CASE 
        WHEN trigger_name = 'trigger_update_call_count' 
        THEN '✅ Trigger existe e está ativo'
        ELSE '⚠️ Trigger não encontrado'
    END AS status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'trigger_update_call_count';

-- ============================================
-- 2. VERIFICAR SE FUNÇÃO EXISTE
-- ============================================
SELECT 
    '=== VERIFICAÇÃO: FUNÇÃO EXISTE? ===' AS info;

SELECT 
    routine_name,
    routine_type,
    data_type AS return_type,
    CASE 
        WHEN routine_name = 'update_device_call_count' 
        THEN '✅ Função existe'
        ELSE '⚠️ Função não encontrada'
    END AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'update_device_call_count';

-- ============================================
-- 3. VERIFICAR SE COLUNA active_calls_count EXISTE
-- ============================================
SELECT 
    '=== VERIFICAÇÃO: COLUNA EXISTE? ===' AS info;

SELECT 
    table_name,
    column_name,
    data_type,
    column_default,
    is_nullable,
    CASE 
        WHEN column_name = 'active_calls_count' 
        THEN '✅ Coluna existe'
        ELSE '⚠️ Coluna não encontrada'
    END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'devices'
  AND column_name = 'active_calls_count';

-- ============================================
-- 4. VERIFICAR CONTADORES: TRIGGER VS REALIDADE
-- ============================================
-- Esta é a VERIFICAÇÃO PRINCIPAL!
-- Compara o contador do trigger com a contagem real de chamadas ativas

SELECT 
    '=== VERIFICAÇÃO PRINCIPAL: CONTADORES CORRETOS? ===' AS info;

SELECT 
    d.id,
    d.name AS device_name,
    d.status AS device_status,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '❌ INCONSISTENTE'
    END AS status_validacao,
    ABS(d.active_calls_count - COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing'))) AS diferenca
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.status, d.active_calls_count
ORDER BY d.active_calls_count DESC;

-- ============================================
-- 5. RESUMO DE VALIDAÇÃO
-- ============================================
SELECT 
    '=== RESUMO DE VALIDAÇÃO ===' AS info;

SELECT 
    COUNT(*) FILTER (WHERE status_validacao = '✅ CORRETO') AS dispositivos_corretos,
    COUNT(*) FILTER (WHERE status_validacao = '❌ INCONSISTENTE') AS dispositivos_inconsistentes,
    COUNT(*) AS total_dispositivos,
    CASE 
        WHEN COUNT(*) FILTER (WHERE status_validacao = '❌ INCONSISTENTE') = 0 
        THEN '✅ TODOS OS CONTADORES ESTÃO CORRETOS!'
        ELSE '⚠️ ALGUNS CONTADORES ESTÃO INCORRETOS - Precisa resincronizar!'
    END AS resultado_final
FROM (
    SELECT 
        d.id,
        CASE 
            WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
            THEN '✅ CORRETO'
            ELSE '❌ INCONSISTENTE'
        END AS status_validacao
    FROM devices d
    LEFT JOIN calls c ON c.device_id = d.id
    GROUP BY d.id, d.active_calls_count
) AS validacao;

-- ============================================
-- 6. LISTAR CHAMADAS ATIVAS POR DISPOSITIVO
-- ============================================
SELECT 
    '=== CHAMADAS ATIVAS POR DISPOSITIVO ===' AS info;

SELECT 
    d.id AS device_id,
    d.name AS device_name,
    d.active_calls_count,
    c.id AS call_id,
    c.number,
    c.status,
    c.start_time,
    NOW() - c.start_time AS tempo_decorrido
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id 
    AND c.status IN ('ringing', 'answered', 'dialing')
WHERE d.active_calls_count > 0 OR c.id IS NOT NULL
ORDER BY d.name, c.start_time DESC;

-- ============================================
-- 7. VERIFICAR SE HÁ CHAMADAS PRESAS
-- ============================================
SELECT 
    '=== VERIFICAR CHAMADAS PRESAS EM STATUS ATIVO ===' AS info;

SELECT 
    c.id,
    c.number,
    c.status,
    c.device_id,
    d.name AS device_name,
    c.start_time,
    NOW() - c.start_time AS tempo_decorrido,
    EXTRACT(EPOCH FROM (NOW() - c.start_time)) / 60 AS minutos_decorridos,
    CASE 
        WHEN NOW() - c.start_time > INTERVAL '1 hour' THEN '⚠️ MUITO ANTIGA (mais de 1h)'
        WHEN NOW() - c.start_time > INTERVAL '10 minutes' THEN '⚠️ ANTIGA (mais de 10min)'
        ELSE '✅ RECENTE (ok)'
    END AS status_tempo
FROM calls c
INNER JOIN devices d ON d.id = c.device_id
WHERE c.status IN ('ringing', 'dialing')
  AND NOW() - c.start_time > INTERVAL '5 minutes'
ORDER BY c.start_time ASC;

-- ============================================
-- 8. TESTE MANUAL: RESINCRONIZAR CONTADORES
-- ============================================
-- Se os contadores estiverem incorretos, execute esta função:

SELECT 
    '=== FUNÇÃO DE RESINCRONIZAÇÃO ===' AS info;

-- Verificar se função existe
SELECT 
    routine_name,
    CASE 
        WHEN routine_name = 'sync_active_calls_count' 
        THEN '✅ Função existe - Pode resincronizar'
        ELSE '⚠️ Função não encontrada'
    END AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'sync_active_calls_count';

-- Para resincronizar (descomente se necessário):
/*
SELECT sync_active_calls_count();
*/

-- ============================================
-- 9. CHECKLIST FINAL
-- ============================================
SELECT 
    '=== CHECKLIST FINAL ===' AS info;

SELECT 
    '1. Trigger existe?' AS item,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name = 'trigger_update_call_count'
        ) THEN '✅ SIM'
        ELSE '❌ NÃO'
    END AS status

UNION ALL

SELECT 
    '2. Função existe?' AS item,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_name = 'update_device_call_count'
        ) THEN '✅ SIM'
        ELSE '❌ NÃO'
    END AS status

UNION ALL

SELECT 
    '3. Coluna existe?' AS item,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'devices' 
              AND column_name = 'active_calls_count'
        ) THEN '✅ SIM'
        ELSE '❌ NÃO'
    END AS status

UNION ALL

SELECT 
    '4. Contadores corretos?' AS item,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 
            FROM devices d
            LEFT JOIN calls c ON c.device_id = d.id
            GROUP BY d.id, d.active_calls_count
            HAVING d.active_calls_count != COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing'))
        ) THEN '✅ SIM'
        ELSE '❌ NÃO - Execute sync_active_calls_count()'
    END AS status;

