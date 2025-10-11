-- Remove ddi_prefix column from calls table
ALTER TABLE public.calls DROP COLUMN ddi_prefix;

-- Add ddi_prefix column to number_lists table
ALTER TABLE public.number_lists ADD COLUMN ddi_prefix TEXT;