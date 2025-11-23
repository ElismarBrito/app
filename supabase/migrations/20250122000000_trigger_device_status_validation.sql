-- Migration: Trigger automático para validação de status de dispositivos
-- Data: 2025-01-22
-- Descrição: Validação profissional de estado real dos dispositivos usando triggers e heartbeat

-- 1. Função para validar status de dispositivo baseado em last_seen
-- CORREÇÃO PROFISSIONAL: Validação no banco, mais confiável que timeout no cliente
CREATE OR REPLACE FUNCTION validate_device_status()
RETURNS TRIGGER AS $$
DECLARE
    minutes_since_last_seen INTEGER;
    heartbeat_timeout_minutes INTEGER := 5; -- Timeout de 5 minutos sem heartbeat
BEGIN
    -- Apenas validar se o dispositivo está 'online'
    IF NEW.status = 'online' AND NEW.last_seen IS NOT NULL THEN
        -- Calcula minutos desde o último heartbeat
        minutes_since_last_seen := EXTRACT(EPOCH FROM (NOW() - NEW.last_seen::timestamp)) / 60;
        
        -- Se passou mais de X minutos sem heartbeat, marcar como offline
        IF minutes_since_last_seen > heartbeat_timeout_minutes THEN
            NEW.status := 'offline';
            NEW.updated_at := NOW();
            RAISE NOTICE 'Device % marcado como offline (sem heartbeat há % minutos)', NEW.id, minutes_since_last_seen;
        END IF;
    END IF;
    
    -- Se last_seen foi atualizado, garantir que status não seja 'unpaired' (só pode ser atualizado manualmente)
    IF TG_OP = 'UPDATE' AND OLD.status = 'unpaired' AND NEW.status != 'unpaired' THEN
        -- Se estava unpaired, não permite voltar para online/offline automaticamente
        NEW.status := OLD.status;
        RAISE NOTICE 'Device % está unpaired, não pode ser atualizado automaticamente', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger BEFORE UPDATE para validar status ANTES de salvar
DROP TRIGGER IF EXISTS trigger_validate_device_status ON public.devices;
CREATE TRIGGER trigger_validate_device_status
    BEFORE UPDATE ON public.devices
    FOR EACH ROW
    WHEN (
        -- Só executa se status ou last_seen mudou
        (OLD.status IS DISTINCT FROM NEW.status) OR 
        (OLD.last_seen IS DISTINCT FROM NEW.last_seen)
    )
    EXECUTE FUNCTION validate_device_status();

-- 3. Função para verificação periódica de dispositivos inativos (executar via pg_cron ou Edge Function)
-- Esta função pode ser chamada periodicamente para validar TODOS os dispositivos
CREATE OR REPLACE FUNCTION check_inactive_devices()
RETURNS TABLE (
    device_id UUID,
    device_name TEXT,
    status TEXT,
    last_seen TIMESTAMP,
    minutes_inactive INTEGER
) AS $$
DECLARE
    heartbeat_timeout_minutes INTEGER := 5;
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        d.status,
        d.last_seen::timestamp,
        EXTRACT(EPOCH FROM (NOW() - d.last_seen::timestamp)) / 60::INTEGER AS minutes_inactive
    FROM public.devices d
    WHERE d.status = 'online'
      AND d.last_seen IS NOT NULL
      AND (NOW() - d.last_seen::timestamp) > (heartbeat_timeout_minutes || ' minutes')::INTERVAL
      -- Não inclui dispositivos já marcados como 'unpaired'
      AND d.status != 'unpaired';
END;
$$ LANGUAGE plpgsql;

-- 4. Função para marcar dispositivos inativos como offline automaticamente
CREATE OR REPLACE FUNCTION mark_inactive_devices_offline()
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
    heartbeat_timeout_minutes INTEGER := 5;
BEGIN
    WITH inactive_devices AS (
        UPDATE public.devices
        SET 
            status = 'offline',
            updated_at = NOW()
        WHERE status = 'online'
          AND last_seen IS NOT NULL
          AND (NOW() - last_seen::timestamp) > (heartbeat_timeout_minutes || ' minutes')::INTERVAL
          AND status != 'unpaired' -- Nunca marca 'unpaired' como 'offline'
        RETURNING id
    )
    SELECT COUNT(*) INTO affected_count FROM inactive_devices;
    
    RAISE NOTICE 'Marcados % dispositivo(s) como offline (inativos)', affected_count;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- 5. Índice para melhorar performance da validação de dispositivos inativos
CREATE INDEX IF NOT EXISTS idx_devices_status_last_seen 
ON public.devices(status, last_seen) 
WHERE status = 'online' AND last_seen IS NOT NULL;

-- Log de confirmação
SELECT 'Trigger de validação de status de dispositivos criado com sucesso' AS result;

