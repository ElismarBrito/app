-- ============================================
-- VERIFICAR SE CONTADORES DO TRIGGER ESTÃO CORRETOS
-- ============================================

-- Comparar contador do trigger com contagem real de chamadas ativas
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ Correto'
        ELSE '⚠️ Inconsistente'
    END AS status
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.active_calls_count
ORDER BY d.active_calls_count DESC, d.name;

-- Verificar chamadas ativas do dispositivo que tem contador = 2
SELECT 
    c.id,
    c.number,
    c.status,
    c.device_id,
    c.start_time,
    d.name AS device_name
FROM calls c
INNER JOIN devices d ON d.id = c.device_id
WHERE c.device_id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754'
  AND c.status IN ('ringing', 'answered', 'dialing')
ORDER BY c.start_time DESC;

-- Listar TODAS as chamadas do dispositivo (para verificar)
SELECT 
    c.id,
    c.number,
    c.status,
    c.device_id,
    c.start_time,
    d.name AS device_name,
    CASE 
        WHEN c.status IN ('ringing', 'answered', 'dialing') 
        THEN '✅ Ativa'
        ELSE '❌ Inativa'
    END AS tipo_chamada
FROM calls c
INNER JOIN devices d ON d.id = c.device_id
WHERE c.device_id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754'
ORDER BY c.start_time DESC
LIMIT 20;

