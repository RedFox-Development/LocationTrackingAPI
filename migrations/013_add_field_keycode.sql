-- Migration 013: Add field_keycode for field organizer access
-- Adds a separate keycode for field organizers to access field-mode on mobile browsers

-- Add field_keycode column
ALTER TABLE events ADD COLUMN field_keycode VARCHAR(8) UNIQUE;

-- Backfill existing events with generated keycodes
-- Uses a combination of MD5 hash with random/timestamp/id for uniqueness
UPDATE events SET field_keycode = 
  UPPER(SUBSTRING(MD5(RANDOM()::text || NOW()::text || id::text), 1, 8))
WHERE field_keycode IS NULL;

-- Make column NOT NULL after backfill
ALTER TABLE events ALTER COLUMN field_keycode SET NOT NULL;

-- Add unique constraint
ALTER TABLE events ADD CONSTRAINT field_keycode_unique UNIQUE (field_keycode);

-- Create index for fast lookups
CREATE INDEX idx_events_field_keycode ON events(field_keycode);
