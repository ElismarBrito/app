-- ============================================
-- TESTE COMPLETO DO TRIGGER active_calls_count
-- ============================================
-- Este script testa INSERT, UPDATE e DELETE
-- IMPORTANTE: Substituir UUIDs pelos seus reais!

-- ============================================
-- PASSO 1: PREPARAÇÃO - LISTAR DISPOSITIVOS DISPONÍVEIS
-- ============================================
SELECT 
    '=== DISPOSITIVOS DISPONÍVEIS PARA TESTE ===' AS info;

SELECT 
    id,
    name,
    status,
    active_calls_count AS contador_atual
FROM devices
ORDER BY name
LIMIT 5;

-- ============================================
-- PASSO 2: PEGAR IDs PARA TESTE
-- ============================================
-- Copiar estes valores para usar nos testes abaixo:
-- user_id: (pegar do resultado acima ou de auth.users)
-- device_id: (pegar um dos device IDs acima)

-- ============================================
-- PASSO 3: ESTADO ANTES DOS TESTES
-- ============================================
SELECT 
    '=== ESTADO ANTES DOS TESTES ===' AS info;

-- Selecionar um device para teste (SUBSTITUIR UUID!)
-- Exemplo: device_id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754'
SELECT 
    d.id AS device_id,
    d.name AS device_name,
    d.active_calls_count AS contador_antes,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS chamadas_ativas_reais
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
WHERE d.id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754'  -- SUBSTITUIR POR UUID REAL!
GROUP BY d.id, d.name, d.active_calls_count;

-- ============================================
-- TESTE 1: INSERT - INSERIR CHAMADA ATIVA
-- ============================================
-- Este teste verifica se o contador aumenta ao inserir chamada ativa

-- IMPORTANTE: SUBSTITUIR UUIDs PELOS SEUS REAIS!
-- Pegar user_id de: SELECT id FROM auth.users LIMIT 1;
-- Pegar device_id de: SELECT id FROM devices LIMIT 1;

/*
-- INSERIR CHAMADA ATIVA (status = 'ringing')
INSERT INTO calls (user_id, device_id, number, status)
VALUES (
    'user-uuid-aqui',      -- SUBSTITUIR!
    'a8dff05f-3dbc-44df-ad54-5328d4e0d754',  -- SUBSTITUIR!
    '11999999999', 
    'ringing'
);

-- VERIFICAR SE CONTADOR AUMENTOU
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_depois_insert,
    'Esperado: contador deve aumentar em 1' AS observacao
FROM devices d
WHERE d.id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754';  -- SUBSTITUIR!
*/

-- ============================================
-- TESTE 2: UPDATE - MUDAR STATUS DE ATIVA PARA INATIVA
-- ============================================
-- Este teste verifica se o contador diminui ao mudar status para inativo

/*
-- IMPORTANTE: Pegar call_id da chamada inserida acima
-- SELECT id, number, status FROM calls WHERE device_id = 'seu-device-id' ORDER BY start_time DESC LIMIT 1;

-- MUDAR STATUS DE 'ringing' PARA 'ended' (ativa -> inativa)
UPDATE calls 
SET status = 'ended'
WHERE id = 'call-uuid-aqui'  -- SUBSTITUIR PELO ID DA CHAMADA INSERIDA!
  AND device_id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754';  -- SUBSTITUIR!

-- VERIFICAR SE CONTADOR DIMINUIU
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_depois_update,
    'Esperado: contador deve diminuir em 1' AS observacao
FROM devices d
WHERE d.id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754';  -- SUBSTITUIR!
*/

-- ============================================
-- TESTE 3: UPDATE - MUDAR STATUS DE INATIVA PARA ATIVA
-- ============================================
-- Este teste verifica se o contador aumenta ao mudar status para ativo

/*
-- MUDAR STATUS DE 'ended' PARA 'ringing' (inativa -> ativa)
UPDATE calls 
SET status = 'ringing'
WHERE id = 'call-uuid-aqui'  -- SUBSTITUIR PELO ID DA CHAMADA!
  AND device_id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754';  -- SUBSTITUIR!

-- VERIFICAR SE CONTADOR AUMENTOU
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_depois_update_ativa,
    'Esperado: contador deve aumentar em 1' AS observacao
FROM devices d
WHERE d.id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754';  -- SUBSTITUIR!
*/

-- ============================================
-- TESTE 4: DELETE - DELETAR CHAMADA ATIVA
-- ============================================
-- Este teste verifica se o contador diminui ao deletar chamada ativa

/*
-- DELETAR CHAMADA ATIVA
DELETE FROM calls
WHERE id = 'call-uuid-aqui'  -- SUBSTITUIR PELO ID DA CHAMADA!
  AND device_id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754';  -- SUBSTITUIR!

-- VERIFICAR SE CONTADOR DIMINUIU
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_depois_delete,
    'Esperado: contador deve diminuir em 1 (se chamada estava ativa)' AS observacao
FROM devices d
WHERE d.id = 'a8dff05f-3dbc-44df-ad54-5328d4e0d754';  -- SUBSTITUIR!
*/

-- ============================================
-- TESTE 5: VERIFICAÇÃO FINAL - COMPARAR CONTADORES
-- ============================================
SELECT 
    '=== VERIFICAÇÃO FINAL - CONTADORES VS REALIDADE ===' AS info;

-- Comparar contador do trigger com contagem real
SELECT 
    d.id,
    d.name,
    d.active_calls_count AS contador_trigger,
    COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) AS contador_real,
    CASE 
        WHEN d.active_calls_count = COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing')) 
        THEN '✅ CORRETO'
        ELSE '⚠️ INCONSISTENTE'
    END AS status_validacao,
    ABS(d.active_calls_count - COUNT(c.id) FILTER (WHERE c.status IN ('ringing', 'answered', 'dialing'))) AS diferenca
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.name, d.active_calls_count
ORDER BY d.active_calls_count DESC;

-- ============================================
-- TESTE 6: LISTAR CHAMADAS ATIVAS POR DISPOSITIVO
-- ============================================
SELECT 
    '=== CHAMADAS ATIVAS POR DISPOSITIVO ===' AS info;

SELECT 
    d.id AS device_id,
    d.name AS device_name,
    d.active_calls_count,
    c.id AS call_id,
    c.number,
    c.status,
    c.start_time
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id AND c.status IN ('ringing', 'answered', 'dialing')
WHERE d.active_calls_count > 0 OR c.id IS NOT NULL
ORDER BY d.name, c.start_time DESC;

