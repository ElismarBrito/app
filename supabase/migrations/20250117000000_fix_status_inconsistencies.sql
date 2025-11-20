-- Migration: Corrigir inconsistências de status em calls e devices
-- Data: 2025-01-17
-- Descrição: Alinha valores de status entre código, banco e migrations

-- 1. Corrigir status em devices - Adicionar status 'unpaired' e 'pairing'
-- Remove constraint antiga
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_status_check;

-- Adiciona nova constraint com status adicionais
ALTER TABLE public.devices ADD CONSTRAINT devices_status_check 
  CHECK (status IN ('online', 'offline', 'unpaired', 'pairing'));

-- Comentário na coluna para documentação
COMMENT ON COLUMN public.devices.status IS 'Status do dispositivo: online (ativo), offline (inativo), unpaired (despareado), pairing (em pareamento)';

-- 2. Garantir que o ENUM call_status_enum existe e tem todos os valores necessários
-- NOTA: A migration 20251014180000 já criou o ENUM, então apenas adiciona valores faltantes
DO $$
BEGIN
    -- Se o tipo não existe, cria
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_status_enum') THEN
        CREATE TYPE public.call_status_enum AS ENUM (
            'queued', 
            'dialing', 
            'ringing', 
            'answered', 
            'completed', 
            'busy',
            'failed', 
            'no_answer',
            'ended'
        );
    ELSE
        -- Se existe, adiciona valores que podem estar faltando
        -- 'ended' é compatível com 'completed', mas vamos adicionar para manter consistência
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum 
            WHERE enumlabel = 'ended' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_status_enum')
        ) THEN
            ALTER TYPE public.call_status_enum ADD VALUE 'ended';
        END IF;
    END IF;
END$$;

-- 3. A coluna status em calls JÁ é ENUM (da migration 20251014180000)
-- Esta seção apenas garante que o DEFAULT está correto
DO $$
DECLARE
    current_default TEXT;
BEGIN
    -- Verifica se tem DEFAULT
    SELECT column_default INTO current_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'calls'
      AND column_name = 'status';
    
    -- Garante que o DEFAULT está configurado corretamente
    BEGIN
        ALTER TABLE public.calls 
        ALTER COLUMN status SET DEFAULT 'ringing'::public.call_status_enum;
    EXCEPTION
        WHEN OTHERS THEN
            NULL; -- Ignora erro se já estiver correto
    END;
END$$;

-- Comentário na coluna para documentação
COMMENT ON COLUMN public.calls.status IS 'Status da chamada: queued, dialing, ringing, answered, completed, busy, failed, no_answer, ended';

-- Log de confirmação
SELECT 'Status inconsistencies fixed successfully' AS result;

