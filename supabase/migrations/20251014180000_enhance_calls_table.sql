-- Migration to enhance the calls table for concurrent campaign dialing

-- 1. Add a new type for more detailed call statuses
-- First, we remove the old check constraint from the calls table.
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_status_check;

-- Then, we create a new ENUM type for better status management.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_status_enum') THEN
        CREATE TYPE public.call_status_enum AS ENUM (
            'queued', 
            'dialing', 
            'ringing', 
            'answered', 
            'completed', 
            'busy',
            'failed', 
            'no_answer'
        );
    END IF;
END$$;

-- We alter the column to use the new ENUM type.
-- Note: This requires the column to be text-compatible. If it was another type, we might need to cast.
ALTER TABLE public.calls ALTER COLUMN status TYPE public.call_status_enum USING status::text::public.call_status_enum;

-- 2. Add columns to link calls to campaigns and sessions
ALTER TABLE public.calls
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.number_lists(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 3. Create indexes for the new columns for performance
CREATE INDEX IF NOT EXISTS idx_calls_campaign_id ON public.calls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_calls_session_id ON public.calls(session_id);

-- 4. Update RLS policies if necessary (the existing ones should still work)
-- No changes to RLS policies are strictly needed as they are based on user_id,
-- but we ensure they are in place.
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Re-affirming policies for clarity (no actual change)
CREATE POLICY "Users can view their own calls" ON public.calls
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own calls" ON public.calls
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own calls" ON public.calls
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own calls" ON public.calls
    FOR DELETE USING (auth.uid() = user_id);

-- Display a confirmation message
SELECT 'Enhanced calls table migration completed successfully.';
