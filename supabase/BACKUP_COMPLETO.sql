-- ============================================================
-- BACKUP COMPLETO - Execute uma query por vez
-- ============================================================

-- ============================================================
-- PARTE 1: DADOS (Execute e clique "Download CSV")
-- ============================================================

-- Query 1: Backup devices
COPY (SELECT * FROM public.devices ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- Query 2: Backup calls
COPY (SELECT * FROM public.calls ORDER BY start_time DESC) 
TO STDOUT WITH CSV HEADER;

-- Query 3: Backup number_lists
COPY (SELECT * FROM public.number_lists ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- Query 4: Backup qr_sessions
COPY (SELECT * FROM public.qr_sessions ORDER BY created_at) 
TO STDOUT WITH CSV HEADER;

-- ============================================================
-- PARTE 2: ESTRUTURAS (Execute e copie CADA LINHA do resultado)
-- ============================================================

-- Query 5: CREATE TABLE (cada tabela aparece em uma linha - copie todas)
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
    ) || E'\n);' AS create_table
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name NOT LIKE 'pg_%'
GROUP BY table_name
ORDER BY table_name;

-- Query 6: CREATE INDEX (cada índice em uma linha - copie todas)
SELECT indexdef || ';' AS create_index
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Query 7: CREATE FUNCTION (cada função em uma linha - copie todas)
SELECT pg_get_functiondef(p.oid) || ';' AS create_function
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- Query 8: CREATE TRIGGER (cada trigger em uma linha - copie todas)
SELECT pg_get_triggerdef(t.oid) || ';' AS create_trigger
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT tgisinternal
ORDER BY c.relname, t.tgname;

-- Query 9: CREATE VIEW (se houver views)
SELECT 'CREATE OR REPLACE VIEW public.' || viewname || ' AS ' || E'\n' ||
    definition || ';' AS create_view
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- Query 10: CREATE MATERIALIZED VIEW (se houver)
SELECT 'CREATE MATERIALIZED VIEW IF NOT EXISTS public.' || matviewname || E'\n' ||
    'AS ' || definition || ';' AS create_materialized_view
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;
