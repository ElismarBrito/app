-- ============================================================
-- 💾 BACKUP PRÁTICO - EXECUTE UMA QUERY POR VEZ
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute UMA query por vez
-- 2. Para dados: Clique em "Download CSV" após executar
-- 3. Para schema: Copie o resultado e salve como .sql
-- ============================================================

-- ============================================================
-- PARTE 1: BACKUP DOS DADOS (CSV) - Execute uma por vez
-- ============================================================

-- 1. Backup devices (execute e clique "Download CSV")
COPY (SELECT * FROM public.devices ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- 2. Backup calls (execute e clique "Download CSV")
COPY (SELECT * FROM public.calls ORDER BY start_time DESC) 
TO STDOUT WITH CSV HEADER;

-- 3. Backup number_lists (execute e clique "Download CSV")
COPY (SELECT * FROM public.number_lists ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- 4. Backup qr_sessions (execute e clique "Download CSV")
COPY (SELECT * FROM public.qr_sessions ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- 5. Backup device_commands (execute apenas se a tabela existir)
-- COPY (SELECT * FROM public.device_commands ORDER BY created_at) 
-- TO STDOUT WITH CSV HEADER;

-- ============================================================
-- PARTE 2: BACKUP DO SCHEMA (SQL) - Execute uma por vez
-- ============================================================

-- 2.1: CREATE TABLE (copie o resultado e salve como backup_schema_tabelas.sql)
SELECT 
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
    ');'
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name NOT LIKE 'pg_%'  -- Ignora tabelas do sistema
GROUP BY table_name
ORDER BY table_name;

-- 2.2: CREATE INDEX (copie o resultado e salve como backup_indices.sql)
SELECT indexdef || ';'
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 2.3: CREATE FUNCTION (copie o resultado e salve como backup_funcoes.sql)
SELECT pg_get_functiondef(p.oid) || ';'
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- 2.4: CREATE TRIGGER (copie o resultado e salve como backup_triggers.sql)
SELECT pg_get_triggerdef(t.oid) || ';'
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT tgisinternal
ORDER BY c.relname, t.tgname;

-- 2.5: CREATE VIEW (copie o resultado e salve como backup_views.sql)
SELECT 
    'CREATE OR REPLACE VIEW public.' || viewname || ' AS ' || E'\n' ||
    definition || ';'
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- 2.6: CREATE MATERIALIZED VIEW (copie o resultado e salve como backup_materialized_views.sql)
SELECT 
    'CREATE MATERIALIZED VIEW IF NOT EXISTS public.' || matviewname || E'\n' ||
    'AS ' || definition || ';'
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;

-- 2.7: CREATE SEQUENCE (copie o resultado e salve como backup_sequences.sql)
SELECT 
    'CREATE SEQUENCE IF NOT EXISTS public.' || sequencename || E'\n' ||
    '  START WITH ' || last_value || E'\n' ||
    '  INCREMENT BY ' || increment_by || E'\n' ||
    '  MINVALUE ' || min_value || E'\n' ||
    '  MAXVALUE ' || max_value || E'\n' ||
    '  CACHE 1;'
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;

-- ============================================================
-- PARTE 3: VERIFICAÇÃO - Execute para ver o que tem no banco
-- ============================================================

-- Ver quais tabelas existem
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Contar registros em cada tabela
SELECT 
    'devices' as tabela,
    COUNT(*) as registros
FROM public.devices
UNION ALL
SELECT 'calls', COUNT(*) FROM public.calls
UNION ALL
SELECT 'number_lists', COUNT(*) FROM public.number_lists
UNION ALL
SELECT 'qr_sessions', COUNT(*) FROM public.qr_sessions
ORDER BY tabela;

