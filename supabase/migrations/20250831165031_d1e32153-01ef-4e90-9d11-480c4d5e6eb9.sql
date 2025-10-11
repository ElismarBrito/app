-- Add DDI prefix column to calls table
ALTER TABLE public.calls 
ADD COLUMN ddi_prefix TEXT;