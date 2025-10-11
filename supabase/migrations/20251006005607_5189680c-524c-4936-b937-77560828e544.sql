-- Fix RLS for call_cleanup_tracker table
ALTER TABLE call_cleanup_tracker ENABLE ROW LEVEL SECURITY;

-- Only system can read/write to this table (used for internal cleanup)
CREATE POLICY "System only access"
ON call_cleanup_tracker
FOR ALL
USING (false);

-- Fix function search paths
CREATE OR REPLACE FUNCTION cleanup_old_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete calls older than 30 days that are ended
  DELETE FROM calls
  WHERE status = 'ended'
    AND start_time < NOW() - INTERVAL '30 days';
  
  -- Optionally, also clean up abandoned calls (ringing for more than 1 day)
  DELETE FROM calls
  WHERE status IN ('ringing', 'answered')
    AND start_time < NOW() - INTERVAL '1 day';
  
  RAISE LOG 'Cleaned up old calls';
END;
$$;

CREATE OR REPLACE FUNCTION maybe_cleanup_calls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_cleanup TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get last cleanup time
  SELECT call_cleanup_tracker.last_cleanup INTO last_cleanup
  FROM call_cleanup_tracker
  WHERE id = 1;
  
  -- If more than 24 hours since last cleanup, run it
  IF last_cleanup < NOW() - INTERVAL '24 hours' THEN
    PERFORM cleanup_old_calls();
    
    -- Update last cleanup time
    UPDATE call_cleanup_tracker
    SET last_cleanup = NOW()
    WHERE id = 1;
  END IF;
  
  RETURN NEW;
END;
$$;