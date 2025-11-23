-- Script para limpar chamadas "presas" no banco de dados
-- Chamadas que estão com status ativo mas já deveriam ter terminado
-- (mais de 5 minutos com status 'ringing', 'queued' ou 'dialing')

-- Primeiro, verificar quantas chamadas serão afetadas
SELECT 
    COUNT(*) as stuck_calls_count,
    status,
    device_id,
    d.name as device_name
FROM public.calls c
LEFT JOIN public.devices d ON c.device_id = d.id
WHERE c.status IN ('ringing', 'queued', 'dialing')
    AND c.start_time < NOW() - INTERVAL '5 minutes'
    AND c.hidden IS NOT TRUE
GROUP BY status, device_id, d.name
ORDER BY stuck_calls_count DESC;

-- Atualizar chamadas "presas" para status 'ended'
-- Calcula a duração baseada no tempo desde start_time até agora
UPDATE public.calls
SET 
    status = 'ended',
    duration = EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER,
    updated_at = NOW()
WHERE status IN ('ringing', 'queued', 'dialing')
    AND start_time < NOW() - INTERVAL '5 minutes'
    AND hidden IS NOT TRUE;

-- Verificar resultado
SELECT 
    COUNT(*) as cleaned_calls,
    'Chamadas limpas' as description
FROM public.calls
WHERE status = 'ended'
    AND updated_at > NOW() - INTERVAL '1 minute';


