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

-- 3. Se a coluna status em calls ainda não é do tipo ENUM, converter
DO $$
BEGIN
    -- Verifica se a coluna é TEXT
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calls' 
        AND column_name = 'status' 
        AND data_type = 'text'
    ) THEN
        -- Converte TEXT para ENUM
        ALTER TABLE public.calls 
        ALTER COLUMN status TYPE public.call_status_enum 
        USING CASE 
            WHEN status = 'ringing' THEN 'ringing'::public.call_status_enum
            WHEN status = 'answered' THEN 'answered'::public.call_status_enum
            WHEN status = 'ended' THEN 'ended'::public.call_status_enum
            WHEN status = 'dialing' THEN 'dialing'::public.call_status_enum
            WHEN status = 'completed' THEN 'completed'::public.call_status_enum
            WHEN status = 'busy' THEN 'busy'::public.call_status_enum
            WHEN status = 'failed' THEN 'failed'::public.call_status_enum
            WHEN status = 'no_answer' THEN 'no_answer'::public.call_status_enum
            WHEN status = 'queued' THEN 'queued'::public.call_status_enum
            ELSE 'ringing'::public.call_status_enum -- Default fallback
        END;
    END IF;
END$$;

-- 4. Garantir que o ENUM é usado como tipo da coluna
-- Se ainda não for ENUM, tenta converter novamente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calls' 
        AND column_name = 'status' 
        AND udt_name != 'call_status_enum'
    ) THEN
        -- Força conversão para ENUM
        ALTER TABLE public.calls 
        ALTER COLUMN status TYPE public.call_status_enum 
        USING status::text::public.call_status_enum;
    END IF;
END$$;

-- Comentário na coluna para documentação
COMMENT ON COLUMN public.calls.status IS 'Status da chamada: queued, dialing, ringing, answered, completed, busy, failed, no_answer, ended';

-- Log de confirmação
SELECT 'Status inconsistencies fixed successfully' AS result;

