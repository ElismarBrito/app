-- Script para criar tabela device_commands
-- Esta tabela armazena comandos pendentes para dispositivos
-- O CommandListenerService do Android faz polling desta tabela

-- Criar tabela device_commands
CREATE TABLE IF NOT EXISTS public.device_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    command TEXT NOT NULL, -- 'start_campaign', 'make_call', 'stop_campaign', etc
    data JSONB DEFAULT '{}', -- Dados adicionais do comando
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'executed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE,
    error TEXT
);

-- Índice para busca rápida de comandos pendentes por dispositivo
CREATE INDEX IF NOT EXISTS idx_device_commands_pending 
ON public.device_commands(device_id, status) 
WHERE status = 'pending';

-- Índice para limpeza de comandos antigos
CREATE INDEX IF NOT EXISTS idx_device_commands_created 
ON public.device_commands(created_at);

-- RLS: Usuário só pode ver comandos dos seus próprios dispositivos
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own device commands" ON public.device_commands
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert commands for their devices" ON public.device_commands
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device commands" ON public.device_commands
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own device commands" ON public.device_commands
    FOR DELETE USING (auth.uid() = user_id);

-- Função para limpar comandos antigos (executar periodicamente)
CREATE OR REPLACE FUNCTION clean_old_device_commands()
RETURNS void AS $$
BEGIN
    DELETE FROM public.device_commands 
    WHERE created_at < NOW() - INTERVAL '24 hours' 
    AND status IN ('executed', 'failed');
END;
$$ LANGUAGE plpgsql;

-- Comentários para documentação
COMMENT ON TABLE public.device_commands IS 'Fila de comandos para dispositivos móveis (polling)';
COMMENT ON COLUMN public.device_commands.command IS 'Tipo do comando: start_campaign, make_call, stop_campaign, etc';
COMMENT ON COLUMN public.device_commands.status IS 'pending=aguardando, processing=em execução, executed=concluído, failed=falhou';
