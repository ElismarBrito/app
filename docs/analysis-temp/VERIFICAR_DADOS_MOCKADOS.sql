-- ============================================
-- VERIFICAR DADOS MOCKADOS/DE EXEMPLO
-- ============================================

-- 1. VERIFICAR CHAMADAS COM NÚMEROS MOCKADOS
SELECT 
    '=== CHAMADAS MOCKADAS ===' AS info;

SELECT 
    id,
    number,
    status,
    start_time,
    device_id,
    user_id
FROM calls
WHERE number IN (
    '+55 11 99999-9999',
    '+55 11 88888-8888',
    '+55 11 77777-7777',
    '+55 11 66666-6666',
    '+55 11 55555-5555',
    '+55 11 44444-4444',
    '+55 11 33333-3333',
    '+55 11 22222-2222',
    '11999999999',
    '11888888888',
    '11777777777'
)
   OR number LIKE '+55 11 999%'
   OR number LIKE '+55 11 888%'
   OR number LIKE '+55 11 777%'
   OR number LIKE '+55 11 666%'
   OR number LIKE '+55 11 555%'
   OR number LIKE '+55 11 444%'
ORDER BY start_time DESC;

-- 2. VERIFICAR DISPOSITIVOS MOCKADOS
SELECT 
    '=== DISPOSITIVOS MOCKADOS ===' AS info;

SELECT 
    id,
    name,
    status,
    created_at,
    user_id
FROM devices
WHERE name IN (
    'Samsung Galaxy S21',
    'iPhone 13 Pro'
)
ORDER BY created_at DESC;

-- 3. VERIFICAR LISTAS MOCKADAS
SELECT 
    '=== LISTAS MOCKADAS ===' AS info;

SELECT 
    id,
    name,
    is_active,
    created_at,
    user_id
FROM number_lists
WHERE name IN (
    'Lista Principal',
    'Campanhas Janeiro',
    'Clientes VIP'
)
ORDER BY created_at DESC;

-- 4. RESUMO DE DADOS MOCKADOS
SELECT 
    '=== RESUMO DE DADOS MOCKADOS ===' AS info;

SELECT 
    'Chamadas mockadas' AS tipo,
    COUNT(*) AS quantidade
FROM calls
WHERE number IN (
    '+55 11 99999-9999',
    '+55 11 88888-8888',
    '+55 11 77777-7777',
    '+55 11 66666-6666',
    '+55 11 55555-5555',
    '+55 11 44444-4444',
    '+55 11 33333-3333',
    '+55 11 22222-2222'
)
   OR number LIKE '+55 11 999%'
   OR number LIKE '+55 11 888%'
   OR number LIKE '+55 11 777%'
   OR number LIKE '+55 11 666%'
   OR number LIKE '+55 11 555%'
   OR number LIKE '+55 11 444%'

UNION ALL

SELECT 
    'Dispositivos mockados' AS tipo,
    COUNT(*) AS quantidade
FROM devices
WHERE name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')

UNION ALL

SELECT 
    'Listas mockadas' AS tipo,
    COUNT(*) AS quantidade
FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP');

