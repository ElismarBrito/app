-- Script para verificar chamadas ativas no banco de dados
-- Status ativos: 'ringing', 'answered', 'dialing', 'queued'

SELECT 
    c.id,
    c.number,
    c.status,
    c.start_time,
    c.duration,
    c.device_id,
    d.name as device_name,
    d.status as device_status,
    c.user_id,
    c.created_at,
    c.updated_at,
    c.campaign_id,
    c.session_id,
    c.failure_reason,
    -- Calcular tempo decorrido desde o início da chamada
    EXTRACT(EPOCH FROM (NOW() - c.start_time))::INTEGER as seconds_elapsed
FROM public.calls c
LEFT JOIN public.devices d ON c.device_id = d.id
WHERE c.status IN ('ringing', 'answered', 'dialing', 'queued')
    AND c.hidden IS NOT TRUE  -- Excluir chamadas ocultas se houver
ORDER BY c.start_time DESC;

-- Contagem de chamadas ativas por status
SELECT 
    status,
    COUNT(*) as count
FROM public.calls
WHERE status IN ('ringing', 'answered', 'dialing', 'queued')
    AND hidden IS NOT TRUE
GROUP BY status
ORDER BY count DESC;

-- Chamadas ativas por dispositivo
SELECT 
    d.name as device_name,
    d.status as device_status,
    COUNT(c.id) as active_calls_count,
    STRING_AGG(DISTINCT c.status, ', ') as call_statuses
FROM public.calls c
LEFT JOIN public.devices d ON c.device_id = d.id
WHERE c.status IN ('ringing', 'answered', 'dialing', 'queued')
    AND c.hidden IS NOT TRUE
GROUP BY d.id, d.name, d.status
ORDER BY active_calls_count DESC;

