-- ============================================
-- CORRIGIR CHAMADAS PRESAS EM STATUS ATIVO
-- ============================================

-- 1. DIAGNÓSTICO: Verificar chamadas presas
SELECT 
    '=== DIAGNÓSTICO: CHAMADAS PRESAS ===' AS info;

SELECT 
    c.id,
    c.number,
    c.status,
    c.device_id,
    d.name AS device_name,
    c.start_time,
    NOW() - c.start_time AS tempo_decorrido,
    EXTRACT(EPOCH FROM (NOW() - c.start_time)) / 60 AS minutos_decorridos,
    EXTRACT(EPOCH FROM (NOW() - c.start_time)) / 3600 AS horas_decorridas,
    CASE 
        WHEN NOW() - c.start_time > INTERVAL '24 hours' THEN '⚠️ MUITO ANTIGA (mais de 24h) - CORRIGIR!'
        WHEN NOW() - c.start_time > INTERVAL '1 hour' THEN '⚠️ ANTIGA (mais de 1h) - CORRIGIR!'
        WHEN NOW() - c.start_time > INTERVAL '10 minutes' THEN '⚠️ POSSÍVEL PROBLEMA (mais de 10min)'
        ELSE '✅ RECENTE (ok)'
    END AS recomendacao
FROM calls c
INNER JOIN devices d ON d.id = c.device_id
WHERE c.status IN ('ringing', 'dialing')
  AND NOW() - c.start_time > INTERVAL '5 minutes'
ORDER BY c.start_time ASC;

-- 2. CORRIGIR: Atualizar chamadas presas para 'ended'
-- ATENÇÃO: Esta query vai atualizar chamadas que estão presas há mais de 5 minutos
-- O trigger vai atualizar automaticamente o active_calls_count!

SELECT 
    '=== CORRIGINDO CHAMADAS PRESAS ===' AS info;

-- Opção A: Corrigir chamadas presas há mais de 5 minutos
UPDATE calls
SET status = 'ended',
    updated_at = NOW(),
    failure_reason = 'Auto-corrected: chamada presa em status ativo'
WHERE status IN ('ringing', 'dialing')
  AND NOW() - start_time > INTERVAL '5 minutes'
RETURNING 
    id,
    number,
    status AS novo_status,
    start_time,
    NOW() - start_time AS tempo_preso;

-- Opção B: Corrigir apenas chamadas muito antigas (mais de 1 hora)
-- Descomente para usar:
/*
UPDATE calls
SET status = 'ended',
    updated_at = NOW(),
    failure_reason = 'Auto-corrected: chamada presa há mais de 1 hora'
WHERE status IN ('ringing', 'dialing')
  AND NOW() - start_time > INTERVAL '1 hour'
RETURNING 
    id,
    number,
    status AS novo_status,
    start_time,
    NOW() - start_time AS tempo_preso;
*/

-- 3. VERIFICAR CONTADOR APÓS CORREÇÃO
SELECT 
    '=== VERIFICAÇÃO PÓS-CORREÇÃO ===' AS info;

SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '⚠️ AINDA INCONSISTENTE'
    END AS status_validacao,
    ABS(d.active_calls_count - COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing'))) AS diferenca
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.active_calls_count
HAVING d.active_calls_count > 0 OR COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) > 0
ORDER BY d.active_calls_count DESC;

-- 4. LISTAR CHAMADAS ATIVAS RESTANTES (se houver)
SELECT 
    '=== CHAMADAS ATIVAS RESTANTES ===' AS info;

SELECT 
    c.id,
    c.number,
    c.status,
    c.device_id,
    d.name AS device_name,
    c.start_time,
    NOW() - c.start_time AS tempo_decorrido
FROM calls c
INNER JOIN devices d ON d.id = c.device_id
WHERE c.status IN ('ringing', 'answered', 'dialing')
ORDER BY c.start_time ASC;

