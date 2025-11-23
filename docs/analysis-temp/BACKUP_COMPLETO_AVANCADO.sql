-- ============================================================
-- 💾 BACKUP COMPLETO PARA MIGRAÇÃO - PROJETO "AVANÇADO"
-- ============================================================
-- Este script exporta TUDO do banco de dados:
-- - Todas as estruturas (tabelas, funções, triggers, views, etc.)
-- - Todos os dados
-- - Pronto para migração completa
-- 
-- INSTRUÇÕES:
-- 1. Execute cada seção UMA POR VEZ
-- 2. Salve os resultados com nomes descritivos
-- 3. Organize tudo em pastas para migração futura
-- ============================================================

-- ============================================================
-- PARTE 1: BACKUP DOS DADOS (CSV) - Execute uma por vez
-- ============================================================

-- 1.1: Backup devices
-- Execute e clique "Download CSV" -> salve como: backup_dados_devices.csv
COPY (SELECT * FROM public.devices ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- 1.2: Backup calls
-- Execute e clique "Download CSV" -> salve como: backup_dados_calls.csv
COPY (SELECT * FROM public.calls ORDER BY start_time DESC) 
TO STDOUT WITH CSV HEADER;

-- 1.3: Backup number_lists
-- Execute e clique "Download CSV" -> salve como: backup_dados_number_lists.csv
COPY (SELECT * FROM public.number_lists ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- 1.4: Backup qr_sessions
-- Execute e clique "Download CSV" -> salve como: backup_dados_qr_sessions.csv
COPY (SELECT * FROM public.qr_sessions ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- 1.5: Backup device_commands (se existir)
-- Execute apenas se a tabela existir -> salve como: backup_dados_device_commands.csv
-- COPY (SELECT * FROM public.device_commands ORDER BY created_at) 
-- TO STDOUT WITH CSV HEADER;

-- ============================================================
-- PARTE 2: BACKUP DAS ESTRUTURAS (SQL) - Execute uma por vez
-- ============================================================

-- 2.1: CREATE TABLE - Todas as tabelas
-- Execute, copie o resultado e salve como: backup_estrutura_tabelas.sql
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
            WHEN data_type = 'uuid' THEN 'UUID'
            WHEN data_type = 'boolean' THEN 'BOOLEAN'
            WHEN data_type = 'integer' THEN 'INTEGER'
            WHEN data_type = 'bigint' THEN 'BIGINT'
            WHEN data_type = 'text' THEN 'TEXT'
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
  AND table_name NOT LIKE 'pg_%'
GROUP BY table_name
ORDER BY table_name;

-- 2.2: ALTER TABLE - Constraints (Primary Keys, Foreign Keys, etc.)
-- Execute, copie o resultado e salve como: backup_estrutura_constraints.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- CONSTRAINT: ' || constraint_name || ' na tabela ' || table_name || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'ALTER TABLE public.' || table_name || E'\n' ||
    '  ADD CONSTRAINT ' || constraint_name || ' ' ||
    CASE 
        WHEN constraint_type = 'PRIMARY KEY' THEN 
            'PRIMARY KEY (' || 
            (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
             FROM information_schema.key_column_usage
             WHERE constraint_name = tc.constraint_name
               AND table_schema = 'public'
               AND table_name = tc.table_name) || ')'
        WHEN constraint_type = 'FOREIGN KEY' THEN 
            'FOREIGN KEY (' ||
            (SELECT string_agg(column_name, ', ')
             FROM information_schema.key_column_usage
             WHERE constraint_name = tc.constraint_name
               AND table_schema = 'public'
               AND table_name = tc.table_name) || 
            ') REFERENCES ' ||
            (SELECT table_schema || '.' || table_name
             FROM information_schema.table_constraints
             WHERE constraint_name = tc.constraint_name) || 
            '(' ||
            (SELECT string_agg(column_name, ', ')
             FROM information_schema.constraint_column_usage
             WHERE constraint_name = tc.constraint_name) || ')'
        WHEN constraint_type = 'UNIQUE' THEN 
            'UNIQUE (' ||
            (SELECT string_agg(column_name, ', ')
             FROM information_schema.key_column_usage
             WHERE constraint_name = tc.constraint_name
               AND table_schema = 'public'
               AND table_name = tc.table_name) || ')'
        WHEN constraint_type = 'CHECK' THEN 
            'CHECK (' || check_clause || ')'
        ELSE constraint_type
    END || ';' || E'\n' || E'\n'
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
ORDER BY tc.table_name, tc.constraint_type;

-- 2.3: CREATE INDEX - Todos os índices
-- Execute, copie o resultado e salve como: backup_estrutura_indices.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- ÍNDICE: ' || indexname || ' na tabela ' || tablename || E'\n' ||
    '-- ============================================================' || E'\n' ||
    indexdef || ';' || E'\n' || E'\n'
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 2.4: CREATE FUNCTION - Todas as funções
-- Execute, copie o resultado e salve como: backup_estrutura_funcoes.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- FUNÇÃO: public.' || p.proname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    pg_get_functiondef(p.oid) || ';' || E'\n' || E'\n' || E'\n'
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- 2.5: CREATE TRIGGER - Todos os triggers
-- Execute, copie o resultado e salve como: backup_estrutura_triggers.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- TRIGGER: ' || t.tgname || ' na tabela ' || n.nspname || '.' || c.relname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    pg_get_triggerdef(t.oid) || ';' || E'\n' || E'\n' || E'\n'
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- 2.6: CREATE VIEW - Todas as views
-- Execute, copie o resultado e salve como: backup_estrutura_views.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- VIEW: public.' || viewname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE OR REPLACE VIEW public.' || viewname || ' AS ' || E'\n' ||
    definition || ';' || E'\n' || E'\n' || E'\n'
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- 2.7: CREATE MATERIALIZED VIEW - Todas as materialized views
-- Execute, copie o resultado e salve como: backup_estrutura_materialized_views.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- MATERIALIZED VIEW: public.' || matviewname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE MATERIALIZED VIEW IF NOT EXISTS public.' || matviewname || E'\n' ||
    'AS ' || definition || ';' || E'\n' || E'\n' || E'\n'
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;

-- 2.8: CREATE SEQUENCE - Todas as sequences
-- Execute, copie o resultado e salve como: backup_estrutura_sequences.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- SEQUENCE: public.' || sequencename || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE SEQUENCE IF NOT EXISTS public.' || sequencename || E'\n' ||
    '  START WITH ' || last_value || E'\n' ||
    '  INCREMENT BY ' || increment_by || E'\n' ||
    '  MINVALUE ' || min_value || E'\n' ||
    '  MAXVALUE ' || max_value || E'\n' ||
    '  CACHE 1;' || E'\n' || E'\n' || E'\n'
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;

-- 2.9: CREATE TYPE/ENUM - Todos os tipos customizados
-- Execute, copie o resultado e salve como: backup_estrutura_types.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- TYPE/ENUM: public.' || t.typname || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE TYPE public.' || t.typname || ' AS ' ||
    CASE 
        WHEN t.typtype = 'e' THEN 
            'ENUM (' || 
            (SELECT string_agg('''' || enumlabel || '''', ', ' ORDER BY enumsortorder)
             FROM pg_enum 
             WHERE enumtypid = t.oid) || ')'
        WHEN t.typtype = 'c' THEN 'COMPOSITE'  -- Simplificado
        WHEN t.typtype = 'd' THEN 'DOMAIN'     -- Simplificado
        ELSE 'TEXT'
    END || ';' || E'\n' || E'\n' || E'\n'
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.typtype IN ('e', 'c', 'd')
  AND t.oid NOT IN (SELECT typbasetype FROM pg_type WHERE typbasetype IS NOT NULL)
ORDER BY t.typname;

-- 2.10: RLS POLICIES - Todas as políticas Row Level Security
-- Execute, copie o resultado e salve como: backup_estrutura_rls_policies.sql
SELECT 
    '-- ============================================================' || E'\n' ||
    '-- RLS POLICY: ' || policyname || ' na tabela ' || schemaname || '.' || tablename || E'\n' ||
    '-- ============================================================' || E'\n' ||
    'CREATE POLICY ' || policyname || E'\n' ||
    '  ON public.' || tablename || E'\n' ||
    '  FOR ' || cmd || E'\n' ||
    CASE 
        WHEN qual IS NOT NULL THEN '  USING (' || qual || ')' || E'\n'
        ELSE ''
    END ||
    CASE 
        WHEN with_check IS NOT NULL THEN '  WITH CHECK (' || with_check || ');' || E'\n'
        ELSE ';' || E'\n'
    END || E'\n'
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================
-- PARTE 3: RESUMO E VERIFICAÇÃO
-- ============================================================

-- 3.1: Listar todas as tabelas
SELECT 
    table_name as tabela,
    table_type as tipo
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 3.2: Contar registros em cada tabela
SELECT 
    'devices' as tabela,
    COUNT(*) as total_registros
FROM public.devices
UNION ALL
SELECT 'calls', COUNT(*) FROM public.calls
UNION ALL
SELECT 'number_lists', COUNT(*) FROM public.number_lists
UNION ALL
SELECT 'qr_sessions', COUNT(*) FROM public.qr_sessions
ORDER BY tabela;

-- 3.3: Listar todas as funções
SELECT 
    p.proname as nome_funcao,
    pg_get_function_arguments(p.oid) as argumentos
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- ============================================================
-- FIM DO BACKUP COMPLETO
-- ============================================================
SELECT 'BACKUP COMPLETO FINALIZADO EM: ' || NOW()::text AS status_backup;

