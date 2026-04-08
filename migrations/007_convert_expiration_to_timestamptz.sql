-- Convert expiration columns to timestamptz and normalize to end-of-day UTC
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events'
      AND column_name = 'expiration_date'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE events
    ALTER COLUMN expiration_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN expiration_date IS NULL THEN NULL
      ELSE (expiration_date::timestamp + time '23:59:59') AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events'
      AND column_name = 'start_date'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE events
    ALTER COLUMN start_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN start_date IS NULL THEN NULL
      ELSE start_date AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events'
      AND column_name = 'end_date'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE events
    ALTER COLUMN end_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN end_date IS NULL THEN NULL
      ELSE end_date AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'teams'
      AND column_name = 'expiration_date'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE teams
    ALTER COLUMN expiration_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN expiration_date IS NULL THEN NULL
      ELSE (expiration_date::timestamp + time '23:59:59') AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

-- Force all non-null expiration values to 23:59:59 UTC on their calendar day.
UPDATE events
SET expiration_date = date_trunc('day', expiration_date AT TIME ZONE 'UTC') + interval '23 hours 59 minutes 59 seconds'
WHERE expiration_date IS NOT NULL;

UPDATE teams
SET expiration_date = date_trunc('day', expiration_date AT TIME ZONE 'UTC') + interval '23 hours 59 minutes 59 seconds'
WHERE expiration_date IS NOT NULL;

-- Default event timeframe end to 7 days before event expiration when missing.
UPDATE events
SET end_date = expiration_date - interval '7 days'
WHERE expiration_date IS NOT NULL
  AND end_date IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_end_not_after_expiration'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_end_not_after_expiration
    CHECK (expiration_date IS NULL OR end_date IS NULL OR end_date <= expiration_date);
  END IF;
END $$;
