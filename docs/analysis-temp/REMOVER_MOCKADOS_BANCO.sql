-- ============================================
-- REMOVER DADOS MOCKADOS DO BANCO
-- ============================================
-- Baseado na verificação:
-- - Chamadas mockadas: 0 (já removidas ou nunca existiram)
-- - Dispositivos mockados: 2 (Samsung Galaxy S21, iPhone 13 Pro)
-- - Listas mockadas: 1 (uma das 3)

-- ============================================
-- 1. VERIFICAR DISPOSITIVOS MOCKADOS ANTES DE REMOVER
-- ============================================
SELECT 
    '=== DISPOSITIVOS MOCKADOS ===' AS info;

SELECT 
    d.id,
    d.name,
    d.status,
    d.created_at,
    COUNT(c.id) AS total_chamadas,
    COUNT(c.id) FILTER (WHERE c.number NOT IN (
        '+55 11 99999-9999',
        '+55 11 88888-8888',
        '+55 11 77777-7777',
        '+55 11 66666-6666',
        '+55 11 55555-5555',
        '+55 11 44444-4444',
        '+55 11 33333-3333',
        '+55 11 22222-2222'
    )) AS chamadas_reais,
    CASE 
        WHEN COUNT(c.id) FILTER (WHERE c.number NOT IN (
            '+55 11 99999-9999',
            '+55 11 88888-8888',
            '+55 11 77777-7777',
            '+55 11 66666-6666',
            '+55 11 55555-5555',
            '+55 11 44444-4444',
            '+55 11 33333-3333',
            '+55 11 22222-2222'
        )) > 0 THEN '⚠️ TEM CHAMADAS REAIS - NÃO DELETAR!'
        ELSE '✅ PODE REMOVER (só tem chamadas mockadas ou nenhuma)'
    END AS pode_remover
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
WHERE d.name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')
GROUP BY d.id, d.name, d.status, d.created_at
ORDER BY d.name;

-- ============================================
-- 2. VERIFICAR LISTAS MOCKADAS ANTES DE REMOVER
-- ============================================
SELECT 
    '=== LISTAS MOCKADAS ===' AS info;

SELECT 
    nl.id,
    nl.name,
    nl.is_active,
    nl.created_at,
    COUNT(c.id) AS total_chamadas,
    CASE 
        WHEN COUNT(c.id) > 0 THEN '⚠️ TEM CHAMADAS - VERIFICAR ANTES DE DELETAR!'
        ELSE '✅ PODE REMOVER (sem chamadas)'
    END AS pode_remover
FROM number_lists nl
LEFT JOIN calls c ON c.campaign_id = nl.id
WHERE nl.name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP')
GROUP BY nl.id, nl.name, nl.is_active, nl.created_at
ORDER BY nl.name;

-- ============================================
-- 3. REMOVER DISPOSITIVOS MOCKADOS (SE NÃO TIVEREM CHAMADAS REAIS)
-- ============================================
-- ATENÇÃO: Esta query só remove dispositivos que:
-- 1. Têm nome mockado (Samsung Galaxy S21 ou iPhone 13 Pro)
-- 2. NÃO têm chamadas reais (sem chamadas ou só com números mockados)

SELECT 
    '=== REMOVENDO DISPOSITIVOS MOCKADOS ===' AS info;

DELETE FROM devices
WHERE name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')
  AND NOT EXISTS (
      -- Verifica se tem chamadas reais (não mockadas)
      SELECT 1 FROM calls c
      WHERE c.device_id = devices.id
        AND c.number NOT IN (
            '+55 11 99999-9999',
            '+55 11 88888-8888',
            '+55 11 77777-7777',
            '+55 11 66666-6666',
            '+55 11 55555-5555',
            '+55 11 44444-4444',
            '+55 11 33333-3333',
            '+55 11 22222-2222',
            '+5511999999999',
            '+5511888888888',
            '+5511777777777',
            '11999999999',
            '11888888888',
            '11777777777'
        )
  )
RETURNING 
    id,
    name,
    status,
    '✅ Removido com sucesso' AS resultado;

-- ============================================
-- 4. REMOVER LISTAS MOCKADAS (SE NÃO TIVEREM CHAMADAS)
-- ============================================
SELECT 
    '=== REMOVENDO LISTAS MOCKADAS ===' AS info;

DELETE FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP')
  AND NOT EXISTS (
      -- Verifica se tem chamadas vinculadas
      SELECT 1 FROM calls c
      WHERE c.campaign_id = number_lists.id
  )
RETURNING 
    id,
    name,
    is_active,
    '✅ Removido com sucesso' AS resultado;

-- ============================================
-- 5. VERIFICAÇÃO FINAL
-- ============================================
SELECT 
    '=== VERIFICAÇÃO PÓS-REMOVAL ===' AS info;

SELECT 
    'Dispositivos mockados restantes' AS tipo,
    COUNT(*) AS quantidade
FROM devices
WHERE name IN ('Samsung Galaxy S21', 'iPhone 13 Pro')

UNION ALL

SELECT 
    'Listas mockadas restantes' AS tipo,
    COUNT(*) AS quantidade
FROM number_lists
WHERE name IN ('Lista Principal', 'Campanhas Janeiro', 'Clientes VIP');

