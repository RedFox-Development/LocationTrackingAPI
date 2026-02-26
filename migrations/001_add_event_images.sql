-- Migration: Add image storage to events table
-- Run this migration on existing databases to add image and logo support
-- Date: 2026-02-26

-- Drop old URL columns if they exist
ALTER TABLE events DROP COLUMN IF EXISTS image_url;
ALTER TABLE events DROP COLUMN IF EXISTS logo_url;

-- Add image_data column to events table (stores base64 encoded image)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS image_data TEXT;

-- Add image_mime_type column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(50);

-- Add logo_data column to events table (stores base64 encoded logo)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS logo_data TEXT;

-- Add logo_mime_type column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS logo_mime_type VARCHAR(50);

-- Add comments
COMMENT ON COLUMN events.image_data IS 'Base64 encoded event image data';
COMMENT ON COLUMN events.image_mime_type IS 'MIME type of event image (e.g., image/png, image/jpeg)';
COMMENT ON COLUMN events.logo_data IS 'Base64 encoded organization logo data';
COMMENT ON COLUMN events.logo_mime_type IS 'MIME type of logo (e.g., image/png, image/jpeg)';
