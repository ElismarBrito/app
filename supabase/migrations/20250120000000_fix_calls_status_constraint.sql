-- Migration: Remover constraint CHECK antiga que bloqueia status 'queued'
-- Data: 2025-01-20
-- Descrição: Remove a constraint CHECK antiga que não permite o status 'queued' na tabela calls

-- IMPORTANTE: Se a coluna status ainda for TEXT, você precisa primeiro garantir que o ENUM
-- tenha todos os valores necessários executando as migrations anteriores que criam o ENUM.

-- 1. Remover a constraint CHECK antiga (esta é a causa do erro!)
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_status_check;

-- 2. Verificar o tipo atual da coluna status
DO $$
DECLARE
    current_type text;
BEGIN
    -- Verificar o tipo atual da coluna
    SELECT udt_name INTO current_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'calls'
    AND column_name = 'status';
    
    -- Se for TEXT, apenas informamos que precisa ser convertido (não fazemos aqui para evitar conflitos)
    IF current_type = 'text' THEN
        RAISE NOTICE 'Coluna status é do tipo TEXT. Verifique se o ENUM call_status_enum existe e tem todos os valores necessários antes de converter.';
    ELSIF current_type = 'call_status_enum' THEN
        RAISE NOTICE 'Coluna status já é do tipo call_status_enum. Apenas a constraint CHECK foi removida.';
    ELSE
        RAISE NOTICE 'Coluna status é do tipo: %', current_type;
    END IF;
END$$;

-- 3. Verificar se a constraint foi removida
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
            AND table_name = 'calls'
            AND constraint_name = 'calls_status_check'
        ) THEN 'ERRO: Constraint calls_status_check ainda existe!'
        ELSE 'OK: Constraint calls_status_check removida com sucesso!'
    END AS resultado;

-- 4. Verificar valores permitidos no ENUM (se a coluna for ENUM)
SELECT 
    t.typname as enum_name,
    e.enumlabel as valores_permitidos
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname = 'call_status_enum'
ORDER BY e.enumsortorder;

