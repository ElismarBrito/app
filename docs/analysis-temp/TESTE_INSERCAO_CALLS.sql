-- Script para testar inserção manual de chamadas
-- Execute este script no Supabase SQL Editor para verificar se a inserção funciona
-- Substitua os valores entre <<VALORES>> pelos valores reais da sua sessão

-- 1. Verificar usuário atual
SELECT 
    auth.uid() as current_user_id,
    auth.email() as current_user_email;

-- 2. Verificar se o device_id existe e pertence ao usuário
-- Substitua 'f514d693-d52a-4552-8325-24e7b02e6578' pelo device_id real
SELECT 
    id,
    name,
    user_id,
    status
FROM devices
WHERE id = 'f514d693-d52a-4552-8325-24e7b02e6578'
AND user_id = auth.uid();

-- 3. Verificar se a campaign_id existe e pertence ao usuário
-- Substitua '34bfee6f-ed6f-432b-8200-183cbbc131dd' pela campaign_id real
SELECT 
    id,
    name,
    user_id
FROM number_lists
WHERE id = '34bfee6f-ed6f-432b-8200-183cbbc131dd'
AND user_id = auth.uid();

-- 4. Tentar inserir uma chamada de teste
-- IMPORTANTE: Substitua os valores entre <<VALORES>> pelos valores reais
INSERT INTO calls (
    user_id,
    device_id,
    number,
    status,
    campaign_id,
    session_id,
    start_time
) VALUES (
    auth.uid(), -- user_id (será preenchido automaticamente com o usuário autenticado)
    'f514d693-d52a-4552-8325-24e7b02e6578', -- device_id (substitua pelo real)
    'TESTE_999999999', -- number
    'queued', -- status
    '34bfee6f-ed6f-432b-8200-183cbbc131dd', -- campaign_id (substitua pelo real)
    'test_session_' || extract(epoch from now())::text, -- session_id
    now() -- start_time
)
RETURNING *;

-- 5. Verificar as políticas RLS
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'calls';

-- 6. Verificar se o status 'queued' é válido no ENUM
SELECT 
    t.typname as enum_name,
    e.enumlabel as enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname = 'call_status_enum'
ORDER BY e.enumsortorder;

