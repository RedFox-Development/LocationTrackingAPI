# Database Migrations

This folder contains database migration scripts for schema updates.

## Running Migrations

Migrations need to be run manually on your PostgreSQL database. You can run them using:

```bash
psql -h <host> -U <user> -d <database> -f migrations/001_add_event_images.sql
```

Or using a PostgreSQL client of your choice.

## Migration History

### 001_add_event_images.sql (2026-02-26)
- Adds `image_data` column to `events` table (stores base64 encoded image)
- Adds `image_mime_type` column to `events` table (stores MIME type like image/png)
- Adds `logo_data` column to `events` table (stores base64 encoded logo)
- Adds `logo_mime_type` column to `events` table (stores MIME type)
- Removes old `image_url` and `logo_url` columns if they exist
- All fields are optional (nullable)

**Important**: Images are now stored in the database as base64 data rather than external URLs

## Notes

- The API's `_init.js` automatically creates tables with the latest schema for new deployments
- These migration files are for existing databases that were created with earlier schemas
- Always backup your database before running migrations
- Migrations use `IF NOT EXISTS` where possible to be safe to run multiple times
