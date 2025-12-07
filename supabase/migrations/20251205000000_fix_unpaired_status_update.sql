-- Migration: Corrigir trigger que impede pareamento de dispositivos 'unpaired'
-- Data: 2025-12-05
-- Descrição: Permite que dispositivos 'unpaired' sejam atualizados para 'online' durante o pareamento

-- 1. Atualizar função validate_device_status para permitir pareamento
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
    
    -- CORREÇÃO: Permitir atualização de 'unpaired' para 'online' durante pareamento
    -- Isso permite que o pareamento funcione mesmo se o dispositivo estava 'unpaired' antes
    IF TG_OP = 'UPDATE' AND OLD.status = 'unpaired' AND NEW.status = 'online' THEN
        -- Se está mudando para 'online', sempre permitir (pareamento ativo)
        -- A função pair-device sempre define status como 'online' durante pareamento
        RAISE NOTICE 'Device % está sendo pareado (mudando de unpaired para online), permitindo atualização', NEW.id;
        -- Permitir a mudança de status
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'unpaired' AND NEW.status != 'unpaired' AND NEW.status != 'online' THEN
        -- Se está mudando para outro status que não seja 'online', manter como 'unpaired'
        -- Isso protege contra atualizações acidentais para 'offline' ou outros status
        NEW.status := OLD.status;
        RAISE NOTICE 'Device % está unpaired, não pode ser atualizado para % (apenas para online é permitido)', NEW.id, NEW.status;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Log de confirmação
SELECT 'Trigger de validação de status corrigido - pareamento de dispositivos unpaired agora permitido' AS result;

