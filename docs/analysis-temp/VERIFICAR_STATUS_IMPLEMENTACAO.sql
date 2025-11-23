-- ============================================================
-- Verificar se a implementação de status está funcionando
-- ============================================================

-- 1. Verificar constraint de devices (deve aceitar unpaired e pairing)
SELECT 
    constraint_name,
    check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'devices_status_check';

-- 2. Verificar valores do ENUM call_status_enum (deve ter ended)
SELECT 
    enumlabel as valor_status,
    enumsortorder as ordem
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_status_enum')
ORDER BY enumsortorder;

-- 3. Verificar tipo da coluna status em calls (deve ser ENUM)
SELECT 
    table_name,
    column_name,
    data_type,
    udt_name,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'calls'
  AND column_name = 'status';

-- 4. Verificar constraint de devices (status permitidos)
SELECT 
    table_name,
    column_name,
    constraint_name
FROM information_schema.constraint_column_usage
WHERE table_schema = 'public'
  AND table_name = 'devices'
  AND column_name = 'status';

-- 5. Testar se aceita novos status (não executa, apenas mostra)
-- Teste manual: Tente atualizar um device com status 'pairing' ou 'unpaired'
-- UPDATE public.devices SET status = 'pairing' WHERE id = 'seu-device-id';

-- 6. Ver comentários/documentação das colunas
SELECT 
    table_name,
    column_name,
    col_description(
        (SELECT oid FROM pg_class WHERE relname = table_name AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')::regnamespace),
        ordinal_position
    ) as comentario
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('devices', 'calls')
  AND column_name = 'status';


