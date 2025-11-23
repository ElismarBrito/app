-- Validação Rápida de Índices Compostos
-- Execute este script para verificar se todos os índices foram criados

SELECT 
    CASE 
        WHEN COUNT(*) = 7 THEN '✅ Todos os 7 índices compostos foram criados!'
        ELSE '⚠️ Apenas ' || COUNT(*)::text || ' de 7 índices foram criados. Verifique os erros acima.'
    END AS resultado
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname = 'idx_devices_user_status' OR
    indexname = 'idx_calls_device_status' OR
    indexname = 'idx_calls_user_status' OR
    indexname = 'idx_calls_user_device' OR
    indexname = 'idx_calls_device_start_time' OR
    indexname = 'idx_qr_sessions_user_valid' OR
    indexname = 'idx_number_lists_user_active'
  );

-- Lista todos os índices criados
SELECT 
    tablename AS tabela,
    indexname AS indice,
    indexdef AS definicao
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname = 'idx_devices_user_status' OR
    indexname = 'idx_calls_device_status' OR
    indexname = 'idx_calls_user_status' OR
    indexname = 'idx_calls_user_device' OR
    indexname = 'idx_calls_device_start_time' OR
    indexname = 'idx_qr_sessions_user_valid' OR
    indexname = 'idx_number_lists_user_active'
  )
ORDER BY tablename, indexname;
