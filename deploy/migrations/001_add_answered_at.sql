-- ============================================
-- Migração: Adicionar coluna answered_at
-- Data: 2025-12-19
-- Branch: and-29
-- ============================================

-- Adicionar coluna answered_at para registrar quando a chamada foi atendida
-- Esta coluna é preenchida pelo código do app quando status muda para 'answered'
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS answered_at TIMESTAMP WITH TIME ZONE;
