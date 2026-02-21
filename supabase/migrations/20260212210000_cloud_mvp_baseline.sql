-- Historical marker for remote migration version 20260212210000.
-- Baseline bootstrap SQL now runs at:
--   20260208000000_cloud_mvp_baseline_bootstrap.sql
-- Keep this version as a no-op to preserve migration history continuity.
DO $$ BEGIN
  NULL;
END $$;
