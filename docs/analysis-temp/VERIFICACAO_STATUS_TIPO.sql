-- ============================================
-- VERIFICAÇÃO DETALHADA DO TIPO DE STATUS
-- ============================================

-- 1. VERIFICAR TIPO EXATO DE STATUS EM calls
SELECT 
    table_name,
    column_name,
    data_type,
    udt_name,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'calls' 
  AND column_name = 'status';

-- 2. VERIFICAR SE ENUM call_status_enum EXISTE
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_status_enum') 
        THEN '✅ ENUM call_status_enum EXISTE'
        ELSE '❌ ENUM call_status_enum NÃO EXISTE'
    END AS status_enum_exists;

-- 3. VERIFICAR VALORES DO ENUM (se existir)
SELECT 
    enumlabel AS valor_enum,
    enumsortorder AS ordem
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_status_enum')
ORDER BY enumsortorder;

-- 4. VERIFICAR EXEMPLOS DE STATUS ATUAIS NA TABELA calls
SELECT DISTINCT 
    status,
    COUNT(*) AS quantidade
FROM public.calls
GROUP BY status
ORDER BY quantidade DESC
LIMIT 10;

-- 5. VERIFICAR SE PODE COMPARAR STATUS COM STRINGS
SELECT 
    'Teste de comparação' AS teste,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM public.calls 
            WHERE status::text = 'ringing' 
            LIMIT 1
        ) THEN '✅ Pode comparar com strings (CAST funciona)'
        ELSE '⚠️ Problema na comparação'
    END AS resultado_comparacao;

