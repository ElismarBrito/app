-- Migration: Criar tabela de comandos pendentes para dispositivos
-- Data: 2025-01-17
-- Descrição: Sistema de queue para comandos com retry automático e ACK

-- 1. Criar tabela de comandos pendentes
CREATE TABLE IF NOT EXISTS public.device_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
    command_type TEXT NOT NULL,
    command_data JSONB NOT NULL,
    status TEXT CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed', 'expired')) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout_ms INTEGER DEFAULT 5000,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_device_commands_device_status 
ON public.device_commands(device_id, status) 
WHERE status IN ('pending', 'sent');

CREATE INDEX IF NOT EXISTS idx_device_commands_pending 
ON public.device_commands(status) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_device_commands_user_device 
ON public.device_commands(user_id, device_id);

CREATE INDEX IF NOT EXISTS idx_device_commands_created_at 
ON public.device_commands(created_at DESC);

-- 3. Habilitar RLS
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

-- 4. Criar políticas RLS
CREATE POLICY "Users can view their own device commands" 
ON public.device_commands
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own device commands" 
ON public.device_commands
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device commands" 
ON public.device_commands
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own device commands" 
ON public.device_commands
FOR DELETE USING (auth.uid() = user_id);

-- 5. Trigger para updated_at
CREATE TRIGGER update_device_commands_updated_at
    BEFORE UPDATE ON public.device_commands
    FOR EACH ROW 
    EXECUTE FUNCTION public.set_updated_at();

-- 6. Função para marcar comandos expirados
CREATE OR REPLACE FUNCTION expire_old_commands()
RETURNS void AS $$
BEGIN
    UPDATE public.device_commands
    SET status = 'expired',
        updated_at = NOW()
    WHERE status IN ('pending', 'sent')
      AND created_at < NOW() - INTERVAL '30 seconds'
      AND (sent_at IS NULL OR sent_at < NOW() - INTERVAL '30 seconds');
    
    RAISE NOTICE 'Expired old commands marked';
END;
$$ LANGUAGE plpgsql;

-- Comentários para documentação
COMMENT ON TABLE public.device_commands IS 'Queue de comandos pendentes para dispositivos com retry automático';
COMMENT ON COLUMN public.device_commands.status IS 'Status: pending (aguardando), sent (enviado), acknowledged (confirmado), failed (falhou), expired (expirado)';
COMMENT ON COLUMN public.device_commands.retry_count IS 'Número de tentativas já realizadas';
COMMENT ON COLUMN public.device_commands.max_retries IS 'Número máximo de tentativas';

-- Log de confirmação
SELECT 'Device commands table created successfully' AS result;

