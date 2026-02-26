-- Migration: Add image_url and logo_url to events table
-- Run this migration on existing databases to add image and logo support
-- Date: 2026-02-26

-- Add image_url column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add logo_url column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add comments
COMMENT ON COLUMN events.image_url IS 'URL of the event image shown in mobile app';
COMMENT ON COLUMN events.logo_url IS 'URL of the organization logo for QR codes';
