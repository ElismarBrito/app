-- Migration: Criar índices compostos otimizados para queries frequentes
-- Data: 2025-01-17
-- Descrição: Índices compostos para melhorar performance de queries comuns

-- 1. Índice composto para devices: user_id + status (query mais frequente)
CREATE INDEX IF NOT EXISTS idx_devices_user_status 
ON public.devices(user_id, status) 
WHERE status IN ('online', 'offline');

-- 2. Índice composto para calls: device_id + status (buscar chamadas ativas do dispositivo)
CREATE INDEX IF NOT EXISTS idx_calls_device_status 
ON public.calls(device_id, status) 
WHERE status IN ('ringing', 'answered', 'dialing');

-- 3. Índice composto para calls: user_id + status (buscar chamadas ativas do usuário)
CREATE INDEX IF NOT EXISTS idx_calls_user_status 
ON public.calls(user_id, status) 
WHERE status IN ('ringing', 'answered', 'dialing', 'completed', 'ended');

-- 4. Índice composto para calls: user_id + device_id (buscar chamadas do dispositivo do usuário)
CREATE INDEX IF NOT EXISTS idx_calls_user_device 
ON public.calls(user_id, device_id) 
WHERE device_id IS NOT NULL;

-- 5. Índice composto para calls: device_id + start_time (chamadas recentes do dispositivo)
CREATE INDEX IF NOT EXISTS idx_calls_device_start_time 
ON public.calls(device_id, start_time DESC) 
WHERE device_id IS NOT NULL;

-- 6. Índice composto para qr_sessions: user_id + used + expires_at (sessões válidas)
CREATE INDEX IF NOT EXISTS idx_qr_sessions_user_valid 
ON public.qr_sessions(user_id, used, expires_at) 
WHERE used = false;

-- 7. Índice composto para number_lists: user_id + is_active (listas ativas do usuário)
CREATE INDEX IF NOT EXISTS idx_number_lists_user_active 
ON public.number_lists(user_id, is_active) 
WHERE is_active = true;

-- Log de confirmação
SELECT 'Composite indexes created successfully' AS result;

