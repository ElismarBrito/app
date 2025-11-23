-- ============================================
-- REMOVER DADOS MOCKADOS/DE EXEMPLO
-- ============================================
-- ATENÇÃO: Esta query vai DELETAR dados mockados!
-- Execute apenas se confirmar que são dados de teste!

-- 1. REMOVER CHAMADAS MOCKADAS
SELECT 
    '=== REMOVENDO CHAMADAS MOCKADAS ===' AS info;

DELETE FROM calls
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
RETURNING id, number, status;

-- 2. REMOVER DISPOSITIVOS MOCKADOS (CUIDADO!)
-- ATENÇÃO: Isso vai deletar dispositivos! Se eles têm chamadas reais, não delete!
-- Descomente apenas se tiver certeza que são mockados:
/*
DELETE FROM devices
WHERE name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')
  AND NOT EXISTS (
      SELECT 1 FROM calls 
      WHERE calls.device_id = devices.id 
        AND calls.number NOT IN (
            '+55 11 99999-9999',
            '+55 11 88888-8888',
            '+55 11 77777-7777'
        )
  )
RETURNING id, name, status;
*/

-- 3. REMOVER LISTAS MOCKADAS
SELECT 
    '=== REMOVENDO LISTAS MOCKADAS ===' AS info;

DELETE FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP')
RETURNING id, name, is_active;

-- 4. VERIFICAR SE AINDA TEM DADOS MOCKADOS
SELECT 
    '=== VERIFICAÇÃO PÓS-REMOVAL ===' AS info;

SELECT 
    'Chamadas mockadas restantes' AS tipo,
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
    'Listas mockadas restantes' AS tipo,
    COUNT(*) AS quantidade
FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP');

