-- Add new columns to devices table for enhanced device information
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS os TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS os_version TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS sim_type TEXT;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS has_physical_sim BOOLEAN DEFAULT false;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS has_esim BOOLEAN DEFAULT false;

-- Update existing devices with default values
UPDATE public.devices 
SET 
  model = COALESCE(model, 'Smartphone'),
  os = COALESCE(os, 'Android'),
  os_version = COALESCE(os_version, ''),
  sim_type = COALESCE(sim_type, 'physical'),
  has_physical_sim = COALESCE(has_physical_sim, true),
  has_esim = COALESCE(has_esim, false)
WHERE model IS NULL OR os IS NULL;