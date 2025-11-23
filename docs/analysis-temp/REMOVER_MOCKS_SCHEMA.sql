-- ============================================
-- REMOVER INSERTs MOCKADOS DO schema.sql
-- ============================================
-- Este arquivo mostra o que deve ser removido/comentado
-- no arquivo supabase/schema.sql

-- ============================================
-- COMENTAR OU REMOVER ESTAS LINHAS DO schema.sql:
-- ============================================

/*
-- Insert some sample data for demonstration
INSERT INTO public.devices (name, status, user_id) VALUES 
    ('Samsung Galaxy S21', 'online', auth.uid()),
    ('iPhone 13 Pro', 'offline', auth.uid())
ON CONFLICT DO NOTHING;

INSERT INTO public.calls (number, status, start_time, duration, user_id) VALUES 
    ('+55 11 99999-9999', 'answered', NOW() - INTERVAL '2 hours', 120, auth.uid()),
    ('+55 11 88888-8888', 'ended', NOW() - INTERVAL '1 hour', 85, auth.uid()),
    ('+55 11 77777-7777', 'ringing', NOW(), NULL, auth.uid())
ON CONFLICT DO NOTHING;

INSERT INTO public.number_lists (name, numbers, is_active, user_id) VALUES 
    ('Lista Principal', ARRAY['+55 11 99999-9999', '+55 11 88888-8888', '+55 11 77777-7777'], true, auth.uid()),
    ('Campanhas Janeiro', ARRAY['+55 11 66666-6666', '+55 11 55555-5555'], false, auth.uid()),
    ('Clientes VIP', ARRAY['+55 11 44444-4444', '+55 11 33333-3333', '+55 11 22222-2222'], true, auth.uid())
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- MOTIVOS PARA REMOVER:
-- ============================================
-- 1. Dados de exemplo não devem estar em produção
-- 2. Podem confundir usuários reais
-- 3. Podem causar problemas em relatórios/estatísticas
-- 4. Não são necessários para funcionamento do sistema

