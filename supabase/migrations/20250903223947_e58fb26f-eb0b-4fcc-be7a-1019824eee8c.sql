-- Add soft delete functionality to calls table
ALTER TABLE public.calls 
ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;

-- Add device validation status fields to devices table  
ALTER TABLE public.devices 
ADD COLUMN internet_status TEXT DEFAULT 'unknown',
ADD COLUMN signal_status TEXT DEFAULT 'unknown', 
ADD COLUMN line_blocked BOOLEAN DEFAULT false,
ADD COLUMN active_calls_count INTEGER DEFAULT 0;