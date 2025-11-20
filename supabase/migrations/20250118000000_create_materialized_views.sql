-- Migration: Criar Materialized Views para estatísticas e performance
-- Data: 2025-01-18
-- Descrição: Materialized Views para otimizar queries de estatísticas

-- 1. Materialized View: Estatísticas de chamadas por dia
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_call_statistics AS
SELECT 
    user_id,
    DATE_TRUNC('day', start_time) as date,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'answered') as answered_calls,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
    COUNT(*) FILTER (WHERE status = 'busy') as busy_calls,
    COUNT(*) FILTER (WHERE status = 'no_answer') as no_answer_calls,
    AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration_seconds,
    SUM(duration) FILTER (WHERE duration IS NOT NULL) as total_duration_seconds,
    MIN(duration) FILTER (WHERE duration IS NOT NULL) as min_duration_seconds,
    MAX(duration) FILTER (WHERE duration IS NOT NULL) as max_duration_seconds,
    COUNT(DISTINCT device_id) as devices_used,
    COUNT(DISTINCT campaign_id) as campaigns_run
FROM public.calls
WHERE start_time >= NOW() - INTERVAL '90 days'
GROUP BY user_id, DATE_TRUNC('day', start_time);

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_mv_call_statistics_user_date 
ON mv_call_statistics(user_id, date DESC);

-- 2. Materialized View: Performance de dispositivos
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_device_performance AS
SELECT 
    d.id as device_id,
    d.name as device_name,
    d.user_id,
    d.status,
    d.model,
    d.os,
    COUNT(c.id) as total_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'answered') as answered_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'completed') as completed_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'failed') as failed_calls,
    AVG(c.duration) FILTER (WHERE c.duration IS NOT NULL) as avg_duration_seconds,
    SUM(c.duration) FILTER (WHERE c.duration IS NOT NULL) as total_duration_seconds,
    MAX(c.start_time) as last_call_at,
    MIN(c.start_time) as first_call_at,
    ROUND(
        (COUNT(c.id) FILTER (WHERE c.status = 'answered')::numeric / 
         NULLIF(COUNT(c.id), 0)) * 100, 
        2
    ) as answer_rate_percent
FROM public.devices d
LEFT JOIN public.calls c ON c.device_id = d.id 
    AND c.start_time >= NOW() - INTERVAL '30 days'
GROUP BY d.id, d.name, d.user_id, d.status, d.model, d.os;

-- Índice
CREATE INDEX IF NOT EXISTS idx_mv_device_performance_user 
ON mv_device_performance(user_id, total_calls DESC);

-- 3. Materialized View: Performance de campanhas
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_campaign_performance AS
SELECT 
    nl.id as campaign_id,
    nl.name as campaign_name,
    nl.user_id,
    COUNT(c.id) as total_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'answered') as answered_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'completed') as completed_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'failed') as failed_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'busy') as busy_calls,
    COUNT(c.id) FILTER (WHERE c.status = 'no_answer') as no_answer_calls,
    ROUND(
        (COUNT(c.id) FILTER (WHERE c.status = 'answered')::numeric / 
         NULLIF(COUNT(c.id), 0)) * 100, 
        2
    ) as answer_rate_percent,
    ROUND(
        (COUNT(c.id) FILTER (WHERE c.status = 'completed')::numeric / 
         NULLIF(COUNT(c.id), 0)) * 100, 
        2
    ) as completion_rate_percent,
    AVG(c.duration) FILTER (WHERE c.duration IS NOT NULL) as avg_duration_seconds,
    SUM(c.duration) FILTER (WHERE c.duration IS NOT NULL) as total_duration_seconds,
    MAX(c.start_time) as last_call_at,
    MIN(c.start_time) as first_call_at,
    COUNT(DISTINCT c.device_id) as devices_used,
    COUNT(DISTINCT DATE_TRUNC('day', c.start_time)) as days_active
FROM public.number_lists nl
LEFT JOIN public.calls c ON c.campaign_id = nl.id 
    AND c.start_time >= NOW() - INTERVAL '60 days'
WHERE nl.is_active = true OR c.id IS NOT NULL
GROUP BY nl.id, nl.name, nl.user_id;

-- Índice
CREATE INDEX IF NOT EXISTS idx_mv_campaign_performance_user 
ON mv_campaign_performance(user_id, answer_rate_percent DESC);

-- 4. Funções para refresh das Materialized Views
CREATE OR REPLACE FUNCTION refresh_call_statistics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_call_statistics;
    RAISE NOTICE 'Materialized View mv_call_statistics atualizada';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_device_performance()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_device_performance;
    RAISE NOTICE 'Materialized View mv_device_performance atualizada';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_campaign_performance()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_campaign_performance;
    RAISE NOTICE 'Materialized View mv_campaign_performance atualizada';
END;
$$ LANGUAGE plpgsql;

-- Função para refresh de todas as MVs
CREATE OR REPLACE FUNCTION refresh_all_statistics()
RETURNS void AS $$
BEGIN
    PERFORM refresh_call_statistics();
    PERFORM refresh_device_performance();
    PERFORM refresh_campaign_performance();
    RAISE NOTICE 'Todas as Materialized Views foram atualizadas';
END;
$$ LANGUAGE plpgsql;

-- 5. Comentários para documentação
COMMENT ON MATERIALIZED VIEW mv_call_statistics IS 
'Estatísticas agregadas de chamadas por dia, atualizadas periodicamente';

COMMENT ON MATERIALIZED VIEW mv_device_performance IS 
'Performance e estatísticas de uso por dispositivo';

COMMENT ON MATERIALIZED VIEW mv_campaign_performance IS 
'Performance e métricas de campanhas (taxa de resposta, conclusão, etc.)';

COMMENT ON FUNCTION refresh_call_statistics() IS 
'Atualiza a Materialized View mv_call_statistics';

COMMENT ON FUNCTION refresh_device_performance() IS 
'Atualiza a Materialized View mv_device_performance';

COMMENT ON FUNCTION refresh_campaign_performance() IS 
'Atualiza a Materialized View mv_campaign_performance';

COMMENT ON FUNCTION refresh_all_statistics() IS 
'Atualiza todas as Materialized Views de uma vez';

-- Log de confirmação
SELECT 'Materialized Views criadas com sucesso' AS result;

