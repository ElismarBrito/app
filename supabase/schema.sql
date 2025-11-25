-- Enable RLS (Row Level Security) globally
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Create tables
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT CHECK (status IN ('online', 'offline')) DEFAULT 'offline',
    paired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    number TEXT NOT NULL,
    status TEXT CHECK (status IN ('ringing', 'answered', 'ended')) DEFAULT 'ringing',
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration INTEGER DEFAULT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.number_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    numbers TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qr_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    qr_code TEXT NOT NULL,
    session_link TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON public.calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON public.calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_start_time ON public.calls(start_time);
CREATE INDEX IF NOT EXISTS idx_number_lists_user_id ON public.number_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_number_lists_active ON public.number_lists(is_active);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_user_id ON public.qr_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_expires ON public.qr_sessions(expires_at);

-- Enable RLS on all tables
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for devices
CREATE POLICY "Users can view their own devices" ON public.devices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices" ON public.devices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices" ON public.devices
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices" ON public.devices
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for calls
CREATE POLICY "Users can view their own calls" ON public.calls
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calls" ON public.calls
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calls" ON public.calls
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calls" ON public.calls
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for number_lists
CREATE POLICY "Users can view their own number lists" ON public.number_lists
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own number lists" ON public.number_lists
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own number lists" ON public.number_lists
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own number lists" ON public.number_lists
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for qr_sessions
CREATE POLICY "Users can view their own QR sessions" ON public.qr_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own QR sessions" ON public.qr_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own QR sessions" ON public.qr_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own QR sessions" ON public.qr_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON public.devices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_calls_updated_at
    BEFORE UPDATE ON public.calls
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_number_lists_updated_at
    BEFORE UPDATE ON public.number_lists
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Dados de exemplo removidos - não usar em produção
-- Se precisar de dados de teste para desenvolvimento, criar manualmente ou via script separado
-- 
-- EXEMPLO (não executar em produção):
-- INSERT INTO public.devices (name, status, user_id) VALUES 
--     ('Samsung Galaxy S21', 'online', auth.uid())
-- ON CONFLICT DO NOTHING;