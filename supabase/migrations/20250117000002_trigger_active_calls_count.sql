-- Migration: Criar trigger para atualizar active_calls_count automaticamente
-- Data: 2025-01-17
-- Descrição: Mantém active_calls_count atualizado automaticamente baseado no status das chamadas

-- 1. Função para atualizar contador de chamadas ativas
CREATE OR REPLACE FUNCTION update_device_call_count()
RETURNS TRIGGER AS $$
DECLARE
    device_uuid UUID;
BEGIN
    -- Determina o device_id baseado na operação
    IF TG_OP = 'INSERT' THEN
        device_uuid := NEW.device_id;
        
        -- Se a chamada está em status ativo, incrementa contador
        IF NEW.status IN ('ringing', 'answered', 'dialing') AND device_uuid IS NOT NULL THEN
            UPDATE public.devices 
            SET active_calls_count = COALESCE(active_calls_count, 0) + 1,
                updated_at = NOW()
            WHERE id = device_uuid;
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        device_uuid := NEW.device_id;
        
        -- Se mudou de status ativo para inativo, decrementa
        IF OLD.status IN ('ringing', 'answered', 'dialing') 
           AND NEW.status NOT IN ('ringing', 'answered', 'dialing')
           AND device_uuid IS NOT NULL THEN
            UPDATE public.devices 
            SET active_calls_count = GREATEST(0, COALESCE(active_calls_count, 0) - 1),
                updated_at = NOW()
            WHERE id = device_uuid;
        END IF;
        
        -- Se mudou de status inativo para ativo, incrementa
        IF OLD.status NOT IN ('ringing', 'answered', 'dialing')
           AND NEW.status IN ('ringing', 'answered', 'dialing')
           AND device_uuid IS NOT NULL THEN
            UPDATE public.devices 
            SET active_calls_count = COALESCE(active_calls_count, 0) + 1,
                updated_at = NOW()
            WHERE id = device_uuid;
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        device_uuid := OLD.device_id;
        
        -- Se a chamada deletada estava ativa, decrementa
        IF OLD.status IN ('ringing', 'answered', 'dialing') AND device_uuid IS NOT NULL THEN
            UPDATE public.devices 
            SET active_calls_count = GREATEST(0, COALESCE(active_calls_count, 0) - 1),
                updated_at = NOW()
            WHERE id = device_uuid;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Criar trigger na tabela calls
DROP TRIGGER IF EXISTS trigger_update_call_count ON public.calls;
CREATE TRIGGER trigger_update_call_count
    AFTER INSERT OR UPDATE OR DELETE ON public.calls
    FOR EACH ROW
    EXECUTE FUNCTION update_device_call_count();

-- 3. Função para sincronizar contadores existentes (corrigir dados históricos)
CREATE OR REPLACE FUNCTION sync_active_calls_count()
RETURNS void AS $$
BEGIN
    UPDATE public.devices d
    SET active_calls_count = (
        SELECT COUNT(*)::INTEGER
        FROM public.calls c
        WHERE c.device_id = d.id
          AND c.status IN ('ringing', 'answered', 'dialing')
    ),
    updated_at = NOW()
    WHERE EXISTS (
        SELECT 1 FROM public.calls c WHERE c.device_id = d.id
    );
    
    RAISE NOTICE 'Active calls count synchronized for all devices';
END;
$$ LANGUAGE plpgsql;

-- 4. Executar sincronização inicial
SELECT sync_active_calls_count();

-- Log de confirmação
SELECT 'Trigger for active_calls_count created successfully' AS result;

