-- ============================================================
-- 📦 BACKUP COMPLETO DO BANCO DE DADOS VIA SQL
-- ============================================================
-- Este script deve ser executado no SQL Editor do Supabase Dashboard
-- Ele cria um backup completo exportando todas as estruturas e dados
-- 
-- INSTRUÇÕES:
-- 1. Copie TODO este arquivo
-- 2. Cole no SQL Editor do Supabase Dashboard
-- 3. Execute
-- 4. Salve os resultados em arquivos .sql separados
-- ============================================================

-- ============================================================
-- PARTE 1: BACKUP DO SCHEMA (ESTRUTURAS)
-- ============================================================

-- 1.1: Exportar todas as tabelas (CREATE TABLE statements)
-- NOTA: pg_get_tabledef() não está disponível no Supabase
-- Usando information_schema para gerar CREATE TABLE
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- TABELA: public.' || table_name || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE TABLE IF NOT EXISTS public.' || table_name || ' (' || E'\n' ||
    string_agg(
        '    ' || column_name || ' ' || 
        CASE 
            WHEN data_type = 'character varying' THEN 'VARCHAR(' || COALESCE(character_maximum_length::text, '') || ')'
            WHEN data_type = 'character' THEN 'CHAR(' || COALESCE(character_maximum_length::text, '') || ')'
            WHEN data_type = 'numeric' THEN 'NUMERIC(' || numeric_precision || ',' || numeric_scale || ')'
            WHEN data_type = 'USER-DEFINED' THEN udt_name
            WHEN data_type = 'ARRAY' THEN udt_name || '[]'
            WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
            WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
            ELSE UPPER(data_type)
        END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE 
            WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default
            ELSE ''
        END,
        ',' || E'\n'
        ORDER BY ordinal_position
    ) || E'\n' ||
    ');' || E'\n' || E'\n'
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- 1.2: Exportar todas as funções (CREATE FUNCTION statements)
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- FUNÇÃO: ' || n.nspname || '.' || p.proname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    pg_get_functiondef(p.oid) || E'\n' || E'\n'
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('public', 'auth', 'storage', 'realtime')
  AND p.prokind = 'f'  -- Apenas funções
ORDER BY n.nspname, p.proname;

-- 1.3: Exportar todos os triggers (CREATE TRIGGER statements)
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- TRIGGER: ' || tgname || ' na tabela ' || n.nspname || '.' || c.relname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    pg_get_triggerdef(t.oid) || ';' || E'\n' || E'\n'
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname IN ('public', 'auth', 'storage', 'realtime')
  AND NOT tgisinternal
ORDER BY n.nspname, c.relname, tgname;

-- 1.4: Exportar todas as views (CREATE VIEW statements)
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- VIEW: ' || schemaname || '.' || viewname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE OR REPLACE VIEW ' || schemaname || '.' || viewname || ' AS ' || E'\n' ||
    definition || ';' || E'\n' || E'\n'
FROM pg_views
WHERE schemaname IN ('public', 'auth', 'storage', 'realtime')
ORDER BY schemaname, viewname;

-- 1.5: Exportar todas as materialized views (CREATE MATERIALIZED VIEW statements)
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- MATERIALIZED VIEW: ' || schemaname || '.' || matviewname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE MATERIALIZED VIEW IF NOT EXISTS ' || schemaname || '.' || matviewname || E'\n' ||
    'AS ' || definition || ';' || E'\n' || E'\n'
FROM pg_matviews
WHERE schemaname IN ('public', 'auth', 'storage', 'realtime')
ORDER BY schemaname, matviewname;

-- 1.6: Exportar todos os tipos e enums (CREATE TYPE statements)
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- TIPO/ENUM: ' || n.nspname || '.' || t.typname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE TYPE ' || n.nspname || '.' || t.typname || ' AS ' ||
    CASE 
        WHEN t.typtype = 'e' THEN 'ENUM (' || 
            (SELECT string_agg('''' || enumlabel || '''', ', ' ORDER BY enumsortorder)
             FROM pg_enum WHERE enumtypid = t.oid) || ')'
        ELSE 'TEXT'  -- Para outros tipos, simplificar
    END || ';' || E'\n' || E'\n'
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname IN ('public', 'auth', 'storage', 'realtime')
  AND t.typtype IN ('e', 'c', 'd')  -- Enum, Composite, Domain
  AND NOT EXISTS (SELECT 1 FROM pg_type WHERE oid = t.typbasetype)
ORDER BY n.nspname, t.typname;

-- 1.7: Exportar todas as sequências (CREATE SEQUENCE statements)
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- SEQUENCE: ' || schemaname || '.' || sequencename || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE SEQUENCE IF NOT EXISTS ' || schemaname || '.' || sequencename || E'\n' ||
    '  START WITH ' || last_value || E'\n' ||
    '  INCREMENT BY ' || increment_by || E'\n' ||
    '  MINVALUE ' || min_value || E'\n' ||
    '  MAXVALUE ' || max_value || E'\n' ||
    '  CACHE 1;' || E'\n' || E'\n'
FROM pg_sequences
WHERE schemaname IN ('public', 'auth', 'storage', 'realtime')
ORDER BY schemaname, sequencename;

-- 1.8: Exportar todos os índices (CREATE INDEX statements)
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- ÍNDICE: ' || schemaname || '.' || indexname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    indexdef || ';' || E'\n' || E'\n'
FROM pg_indexes
WHERE schemaname IN ('public', 'auth', 'storage', 'realtime')
ORDER BY schemaname, tablename, indexname;

-- ============================================================
-- PARTE 2: BACKUP DOS DADOS (INSERT statements)
-- ============================================================

-- 2.1: Exportar dados da tabela 'devices'
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- DADOS DA TABELA: public.devices' || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'COPY public.devices FROM stdin;' || E'\n' ||
    string_agg(
        id::text || E'\t' || 
        COALESCE(name, '') || E'\t' || 
        COALESCE(status, '') || E'\t' || 
        COALESCE(paired_at::text, '') || E'\t' || 
        COALESCE(last_seen::text, '') || E'\t' || 
        COALESCE(user_id::text, '') || E'\t' || 
        COALESCE(created_at::text, '') || E'\t' || 
        COALESCE(updated_at::text, ''),
        E'\n'
    ) || E'\n' || 
    '\.' || E'\n' || E'\n'
FROM public.devices;

-- 2.2: Exportar dados da tabela 'calls'
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- DADOS DA TABELA: public.calls' || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'COPY public.calls FROM stdin;' || E'\n' ||
    string_agg(
        id::text || E'\t' || 
        COALESCE(number, '') || E'\t' || 
        COALESCE(status, '') || E'\t' || 
        COALESCE(start_time::text, '') || E'\t' || 
        COALESCE(duration::text, '') || E'\t' || 
        COALESCE(user_id::text, '') || E'\t' || 
        COALESCE(device_id::text, '') || E'\t' || 
        COALESCE(created_at::text, '') || E'\t' || 
        COALESCE(updated_at::text, ''),
        E'\n'
    ) || E'\n' || 
    '\.' || E'\n' || E'\n'
FROM public.calls;

-- 2.3: Exportar dados da tabela 'number_lists'
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- DADOS DA TABELA: public.number_lists' || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'COPY public.number_lists FROM stdin;' || E'\n' ||
    string_agg(
        id::text || E'\t' || 
        COALESCE(name, '') || E'\t' || 
        COALESCE(array_to_string(numbers, ','), '{}') || E'\t' || 
        COALESCE(is_active::text, '') || E'\t' || 
        COALESCE(user_id::text, '') || E'\t' || 
        COALESCE(created_at::text, '') || E'\t' || 
        COALESCE(updated_at::text, ''),
        E'\n'
    ) || E'\n' || 
    '\.' || E'\n' || E'\n'
FROM public.number_lists;

-- 2.4: Exportar dados da tabela 'qr_sessions'
-- NOTA: A tabela tem session_code, não qr_code
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- DADOS DA TABELA: public.qr_sessions' || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'COPY public.qr_sessions FROM stdin;' || E'\n' ||
    string_agg(
        id::text || E'\t' || 
        COALESCE(session_code, '') || E'\t' || 
        COALESCE(expires_at::text, '') || E'\t' || 
        COALESCE(user_id::text, '') || E'\t' || 
        COALESCE(used::text, 'false') || E'\t' || 
        COALESCE(created_at::text, '') || E'\t' || 
        COALESCE(updated_at::text, ''),
        E'\n'
    ) || E'\n' || 
    '\.' || E'\n' || E'\n'
FROM public.qr_sessions;

-- 2.5: Exportar dados da tabela 'device_commands' (se existir)
-- NOTA: Execute esta query apenas se a tabela device_commands existir
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'device_commands') THEN
        RAISE NOTICE 'Tabela device_commands existe - execute a query abaixo manualmente';
    ELSE
        RAISE NOTICE 'Tabela device_commands NÃO existe - pule esta seção';
    END IF;
END $$;

-- Execute a query abaixo apenas se device_commands existir:
-- SELECT 
--     '-- ============================================================' || E'\n' ||
--     '-- DADOS DA TABELA: public.device_commands' || E'\n' ||
--     '-- ============================================================' || E'\n' ||
--     'COPY public.device_commands FROM stdin;' || E'\n' ||
--     string_agg(
--         id::text || E'\t' || 
--         COALESCE(device_id::text, '') || E'\t' || 
--         COALESCE(command::text, '') || E'\t' || 
--         COALESCE(status, '') || E'\t' || 
--         COALESCE(created_at::text, ''),
--         E'\n'
--     ) || E'\n' || 
--     '\.' || E'\n' || E'\n'
-- FROM public.device_commands;

-- ============================================================
-- PARTE 3: BACKUP DE CONFIGURAÇÕES E PERMISSÕES
-- ============================================================

-- 3.1: Exportar Row Level Security (RLS) policies
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- RLS POLICY: ' || schemaname || '.' || tablename || '.' || policyname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE POLICY ' || policyname || E'\n' ||
    '  ON ' || schemaname || '.' || tablename || E'\n' ||
    '  FOR ' || cmd || E'\n' ||
    '  USING (' || qual || ')' || 
    CASE WHEN with_check IS NOT NULL THEN E'\n' || '  WITH CHECK (' || with_check || ')' ELSE '' END || 
    ';' || E'\n' || E'\n'
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY schemaname, tablename, policyname;

-- ============================================================
-- FIM DO BACKUP
-- ============================================================
SELECT '-- ============================================================' || E'\n' ||
       '-- BACKUP COMPLETO FINALIZADO EM: ' || NOW()::text || E'\n' ||
       '-- ============================================================' || E'\n' 
       AS status_backup;