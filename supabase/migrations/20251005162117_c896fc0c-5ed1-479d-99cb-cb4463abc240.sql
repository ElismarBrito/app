-- Limpar dados de teste/mockados antigos

-- Remover chamadas antigas (mais de 7 dias) ou encerradas há mais de 1 dia
DELETE FROM calls 
WHERE start_time < NOW() - INTERVAL '7 days' 
   OR (status = 'ended' AND start_time < NOW() - INTERVAL '1 day');

-- Remover dispositivos offline há mais de 30 dias
DELETE FROM devices 
WHERE status = 'offline' 
  AND (last_seen < NOW() - INTERVAL '30 days' OR last_seen IS NULL)
  AND paired_at < NOW() - INTERVAL '30 days';

-- Remover sessões QR expiradas ou já usadas
DELETE FROM qr_sessions 
WHERE expires_at < NOW() OR used = true;