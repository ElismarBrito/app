-- Migration: Atualizar schema.sql com estrutura real do banco
-- Data: 2025-01-17
-- Descrição: Adiciona colunas que foram criadas em migrations anteriores mas não estão no schema.sql

-- Esta migration garante que o schema.sql está atualizado
-- Não cria novas colunas, apenas documenta a estrutura atual

-- Observação: As colunas já foram criadas em migrations anteriores
-- Este arquivo serve como documentação e validação

-- Verificar se todas as colunas esperadas existem em devices
DO $$
BEGIN
    -- Verifica colunas de devices
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'model'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN model TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'os'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN os TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'os_version'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN os_version TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'sim_type'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN sim_type TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'has_physical_sim'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN has_physical_sim BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'has_esim'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN has_esim BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'internet_status'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN internet_status TEXT DEFAULT 'unknown';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'signal_status'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN signal_status TEXT DEFAULT 'unknown';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'line_blocked'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN line_blocked BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'devices' 
        AND column_name = 'active_calls_count'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN active_calls_count INTEGER DEFAULT 0;
    END IF;
END$$;

-- Verificar se todas as colunas esperadas existem em calls
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calls' 
        AND column_name = 'hidden'
    ) THEN
        ALTER TABLE public.calls ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calls' 
        AND column_name = 'campaign_id'
    ) THEN
        ALTER TABLE public.calls ADD COLUMN campaign_id UUID REFERENCES public.number_lists(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calls' 
        AND column_name = 'session_id'
    ) THEN
        ALTER TABLE public.calls ADD COLUMN session_id TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calls' 
        AND column_name = 'failure_reason'
    ) THEN
        ALTER TABLE public.calls ADD COLUMN failure_reason TEXT;
    END IF;
END$$;

-- Verificar se qr_sessions tem coluna 'used'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'qr_sessions' 
        AND column_name = 'used'
    ) THEN
        ALTER TABLE public.qr_sessions ADD COLUMN used BOOLEAN DEFAULT false;
    END IF;
    
    -- Verificar se tem session_code em vez de qr_code
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'qr_sessions' 
        AND column_name = 'session_code'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'qr_sessions' 
        AND column_name = 'qr_code'
    ) THEN
        -- Renomear qr_code para session_code se necessário
        ALTER TABLE public.qr_sessions RENAME COLUMN qr_code TO session_code;
    END IF;
END$$;

-- Verificar se number_lists tem ddi_prefix
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'number_lists' 
        AND column_name = 'ddi_prefix'
    ) THEN
        ALTER TABLE public.number_lists ADD COLUMN ddi_prefix TEXT;
    END IF;
END$$;

-- Log de confirmação
SELECT 'Schema validation and updates completed successfully' AS result;

