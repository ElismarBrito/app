-- ============================================
-- ANÁLISE COMPLETA DO SCHEMA DO BANCO
-- ============================================
-- Data: 2025-01-18
-- Objetivo: Verificar estrutura completa antes de aplicar migrations

-- ============================================
-- 1. VERIFICAR TABELAS EXISTENTES
-- ============================================
SELECT 
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================
-- 2. VERIFICAR ESTRUTURA DA TABELA devices
-- ============================================
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'devices'
ORDER BY ordinal_position;

-- Verificar constraints de devices
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public' 
  AND table_name = 'devices';

-- Verificar CHECK constraint de status
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.devices'::regclass
  AND contype = 'c';

-- ============================================
-- 3. VERIFICAR ESTRUTURA DA TABELA calls
-- ============================================
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'calls'
ORDER BY ordinal_position;

-- Verificar se status é ENUM ou TEXT
SELECT 
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'calls'
  AND column_name = 'status';

-- Verificar valores do ENUM call_status_enum (se existir)
SELECT 
    enumlabel AS enum_value
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_status_enum')
ORDER BY enumsortorder;

-- ============================================
-- 4. VERIFICAR ESTRUTURA DA TABELA number_lists
-- ============================================
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'number_lists'
ORDER BY ordinal_position;

-- ============================================
-- 5. VERIFICAR ESTRUTURA DA TABELA qr_sessions
-- ============================================
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'qr_sessions'
ORDER BY ordinal_position;

-- ============================================
-- 6. VERIFICAR ÍNDICES EXISTENTES
-- ============================================
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('devices', 'calls', 'number_lists', 'qr_sessions')
ORDER BY tablename, indexname;

-- ============================================
-- 7. VERIFICAR TRIGGERS EXISTENTES
-- ============================================
SELECT 
    trigger_name,
    event_object_table,
    action_statement,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================
-- 8. VERIFICAR FUNÇÕES EXISTENTES
-- ============================================
SELECT 
    routine_name,
    routine_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- ============================================
-- 9. VERIFICAR SE active_calls_count EXISTE EM devices
-- ============================================
SELECT 
    EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'devices' 
          AND column_name = 'active_calls_count'
    ) AS active_calls_count_exists;

-- ============================================
-- 10. VERIFICAR SE TRIGGER JÁ EXISTE
-- ============================================
SELECT 
    EXISTS (
        SELECT 1 
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public' 
          AND trigger_name = 'trigger_update_call_count'
    ) AS trigger_exists;

-- ============================================
-- 11. CONTAR CHAMADAS ATIVAS POR DISPOSITIVO
-- ============================================
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_atual,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    d.active_calls_count - COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS diferenca
FROM public.devices d
LEFT JOIN public.calls c ON c.device_id = d.id
WHERE d.active_calls_count IS NOT NULL
GROUP BY d.id, d.name, d.active_calls_count
HAVING d.active_calls_count != COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing'))
ORDER BY diferenca DESC;

-- ============================================
-- 12. RESUMO DE VERIFICAÇÕES
-- ============================================
SELECT 
    'Tabelas existentes' AS verificacao,
    COUNT(*) AS quantidade
FROM information_schema.tables
WHERE table_schema = 'public'

UNION ALL

SELECT 
    'Colunas em devices' AS verificacao,
    COUNT(*) AS quantidade
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'devices'

UNION ALL

SELECT 
    'Colunas em calls' AS verificacao,
    COUNT(*) AS quantidade
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'calls'

UNION ALL

SELECT 
    'Índices existentes' AS verificacao,
    COUNT(*) AS quantidade
FROM pg_indexes
WHERE schemaname = 'public'

UNION ALL

SELECT 
    'Triggers existentes' AS verificacao,
    COUNT(*) AS quantidade
FROM information_schema.triggers
WHERE trigger_schema = 'public';

