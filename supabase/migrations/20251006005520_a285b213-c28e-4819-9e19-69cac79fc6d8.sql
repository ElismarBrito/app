-- Add automatic cleanup for old calls (older than 30 days)
-- This prevents the database from growing indefinitely

-- Function to clean up old calls
CREATE OR REPLACE FUNCTION cleanup_old_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create a function to be called via pg_cron (if available) or manually
-- For now, we'll add a trigger that runs cleanup periodically when new calls are added

-- Create a table to track last cleanup time
CREATE TABLE IF NOT EXISTS call_cleanup_tracker (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_cleanup TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial row
INSERT INTO call_cleanup_tracker (id, last_cleanup)
VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;

-- Function to check and run cleanup if needed (once per day)
CREATE OR REPLACE FUNCTION maybe_cleanup_calls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Trigger to run cleanup check on new calls
DROP TRIGGER IF EXISTS trigger_cleanup_old_calls ON calls;
CREATE TRIGGER trigger_cleanup_old_calls
  AFTER INSERT ON calls
  FOR EACH STATEMENT
  EXECUTE FUNCTION maybe_cleanup_calls();

-- Add index to improve cleanup performance
CREATE INDEX IF NOT EXISTS idx_calls_cleanup 
ON calls (status, start_time) 
WHERE status IN ('ended', 'ringing', 'answered');