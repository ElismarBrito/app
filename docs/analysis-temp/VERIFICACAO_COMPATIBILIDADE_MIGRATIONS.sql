-- ============================================
-- VERIFICAÇÃO DE COMPATIBILIDADE
-- Antes de aplicar migrations da and-11
-- ============================================

-- ============================================
-- 1. VERIFICAR SE active_calls_count EXISTE
-- ============================================
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'devices' 
              AND column_name = 'active_calls_count'
        ) THEN '✅ Coluna active_calls_count EXISTE'
        ELSE '❌ Coluna active_calls_count NÃO EXISTE'
    END AS status_active_calls_count;

-- ============================================
-- 2. VERIFICAR SE TRIGGER JÁ EXISTE
-- ============================================
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_schema = 'public' 
              AND trigger_name = 'trigger_update_call_count'
        ) THEN '⚠️ Trigger trigger_update_call_count JÁ EXISTE'
        ELSE '✅ Trigger trigger_update_call_count NÃO EXISTE (pode criar)'
    END AS status_trigger;

-- ============================================
-- 3. VERIFICAR SE FUNÇÃO update_device_call_count EXISTE
-- ============================================
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_schema = 'public' 
              AND routine_name = 'update_device_call_count'
        ) THEN '⚠️ Função update_device_call_count JÁ EXISTE'
        ELSE '✅ Função update_device_call_count NÃO EXISTE (pode criar)'
    END AS status_function;

-- ============================================
-- 4. VERIFICAR ÍNDICES COMPOSTOS EXISTENTES
-- ============================================
SELECT 
    indexname AS indice_composto,
    CASE 
        WHEN indexname LIKE 'idx_devices_user_status' THEN '✅ idx_devices_user_status'
        WHEN indexname LIKE 'idx_calls_device_status' THEN '✅ idx_calls_device_status'
        WHEN indexname LIKE 'idx_calls_user_status' THEN '✅ idx_calls_user_status'
        WHEN indexname LIKE 'idx_calls_user_device' THEN '✅ idx_calls_user_device'
        WHEN indexname LIKE 'idx_calls_device_start_time' THEN '✅ idx_calls_device_start_time'
        WHEN indexname LIKE 'idx_qr_sessions_user_valid' THEN '✅ idx_qr_sessions_user_valid'
        WHEN indexname LIKE 'idx_number_lists_user_active' THEN '✅ idx_number_lists_user_active'
        ELSE indexname
    END AS status
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname LIKE 'idx_devices_user_status' OR
    indexname LIKE 'idx_calls_device_status' OR
    indexname LIKE 'idx_calls_user_status' OR
    indexname LIKE 'idx_calls_user_device' OR
    indexname LIKE 'idx_calls_device_start_time' OR
    indexname LIKE 'idx_qr_sessions_user_valid' OR
    indexname LIKE 'idx_number_lists_user_active'
  )
ORDER BY indexname;

-- ============================================
-- 5. VERIFICAR TIPO DE STATUS EM calls
-- ============================================
SELECT 
    column_name,
    data_type,
    udt_name,
    CASE 
        WHEN udt_name = 'call_status_enum' THEN '✅ Status é ENUM (correto)'
        WHEN data_type = 'text' THEN '⚠️ Status é TEXT (precisa converter)'
        ELSE '❓ Status é ' || udt_name
    END AS status_tipo
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'calls' 
  AND column_name = 'status';

-- ============================================
-- 6. VERIFICAR STATUS PERMITIDOS EM devices
-- ============================================
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.devices'::regclass
  AND contype = 'c'
  AND conname LIKE '%status%';

-- ============================================
-- 7. VERIFICAR SE TODAS AS COLUNAS ESPERADAS EXISTEM
-- ============================================
SELECT 
    'devices' AS tabela,
    column_name AS coluna,
    CASE 
        WHEN column_name IN ('model', 'os', 'os_version', 'sim_type', 'has_physical_sim', 
                             'has_esim', 'internet_status', 'signal_status', 'line_blocked', 
                             'active_calls_count') THEN '✅ Existe'
        ELSE 'ℹ️ Existe'
    END AS status
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'devices'
  AND column_name IN ('model', 'os', 'os_version', 'sim_type', 'has_physical_sim', 
                      'has_esim', 'internet_status', 'signal_status', 'line_blocked', 
                      'active_calls_count')
ORDER BY column_name;

SELECT 
    'calls' AS tabela,
    column_name AS coluna,
    CASE 
        WHEN column_name IN ('hidden', 'campaign_id', 'session_id', 'failure_reason') THEN '✅ Existe'
        ELSE 'ℹ️ Existe'
    END AS status
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'calls'
  AND column_name IN ('hidden', 'campaign_id', 'session_id', 'failure_reason')
ORDER BY column_name;

-- ============================================
-- 8. RESUMO FINAL DE COMPATIBILIDADE
-- ============================================
SELECT 
    'RESUMO DE VERIFICAÇÃO' AS verificacao,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'devices' 
              AND column_name = 'active_calls_count'
        ) THEN '✅ active_calls_count existe'
        ELSE '❌ active_calls_count NÃO existe'
    END AS coluna_active_calls_count,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_schema = 'public' 
              AND trigger_name = 'trigger_update_call_count'
        ) THEN '⚠️ Trigger JÁ existe'
        ELSE '✅ Trigger pode ser criado'
    END AS trigger_status,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'calls' 
              AND column_name = 'status'
              AND udt_name = 'call_status_enum'
        ) THEN '✅ Status é ENUM'
        ELSE '⚠️ Status não é ENUM'
    END AS status_tipo_calls;

