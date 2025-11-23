-- ============================================
-- DIAGNÓSTICO: Chamadas Presas em Status Ativo
-- ============================================

-- 1. VERIFICAR CHAMADAS COM STATUS 'ringing' ANTIGAS
SELECT 
    id,
    number,
    status,
    device_id,
    start_time,
    duration,
    NOW() - start_time AS tempo_decorrido,
    EXTRACT(EPOCH FROM (NOW() - start_time)) / 60 AS minutos_decorridos,
    CASE 
        WHEN NOW() - start_time > INTERVAL '1 hour' THEN '⚠️ MUITO ANTIGA (mais de 1 hora)'
        WHEN NOW() - start_time > INTERVAL '30 minutes' THEN '⚠️ ANTIGA (mais de 30 minutos)'
        WHEN NOW() - start_time > INTERVAL '10 minutes' THEN '⚠️ POSSÍVEL PROBLEMA (mais de 10 minutos)'
        ELSE '✅ RECENTE (ok)'
    END AS status_tempo
FROM calls
WHERE status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time ASC;

-- 2. VERIFICAR CHAMADAS QUE DEVERIAM TER SIDO FINALIZADAS
SELECT 
    c.id,
    c.number,
    c.status,
    c.start_time,
    d.name AS device_name,
    NOW() - c.start_time AS tempo_decorrido,
    CASE 
        WHEN c.status = 'ringing' AND NOW() - c.start_time > INTERVAL '5 minutes' 
        THEN '⚠️ ringing há mais de 5 minutos - provavelmente deveria ser ended'
        WHEN c.status = 'dialing' AND NOW() - c.start_time > INTERVAL '2 minutes' 
        THEN '⚠️ dialing há mais de 2 minutos - provavelmente deveria ser ended'
        ELSE '✅ Status parece ok'
    END AS recomendacao
FROM calls c
INNER JOIN devices d ON d.id = c.device_id
WHERE c.status IN ('ringing', 'dialing')
  AND NOW() - c.start_time > INTERVAL '5 minutes'
ORDER BY c.start_time ASC;

-- 3. CORRIGIR CHAMADAS PRESAS (ATUALIZAR PARA 'ended')
-- ATENÇÃO: Execute apenas se confirmar que as chamadas estão realmente presas!
/*
UPDATE calls
SET status = 'ended',
    updated_at = NOW()
WHERE status = 'ringing'
  AND NOW() - start_time > INTERVAL '5 minutes'
RETURNING id, number, status, start_time;
*/

-- 4. VERIFICAR CONTADOR APÓS CORREÇÃO
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '⚠️ INCONSISTENTE'
    END AS status_validacao
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.active_calls_count
HAVING d.active_calls_count > 0 OR COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) > 0
ORDER BY d.active_calls_count DESC;

