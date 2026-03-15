-- Migration: Add view_keycode for read-only map access
-- Purpose: Support separate management and view-only access credentials

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS view_keycode VARCHAR(255);

UPDATE events
SET view_keycode = UPPER(SUBSTRING(MD5(RANDOM()::text || clock_timestamp()::text) FROM 1 FOR 8))
WHERE view_keycode IS NULL OR view_keycode = '';

UPDATE events
SET view_keycode = UPPER(view_keycode)
WHERE view_keycode <> UPPER(view_keycode);

ALTER TABLE events
  ALTER COLUMN view_keycode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_name_view_keycode_key'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_name_view_keycode_key UNIQUE(name, view_keycode);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_name_view_keycode ON events(name, view_keycode);
