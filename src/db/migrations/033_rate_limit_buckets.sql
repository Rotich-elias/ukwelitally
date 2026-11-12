-- Shared rate limit counters.
--
-- The in-memory rate limiter counts per server instance. On Vercel each
-- instance has its own counters and they reset on a cold start, so the
-- effective limit for login and the public endpoints was several times the
-- configured one. These rows hold a fixed-window counter per key, shared by
-- every instance.
--
-- The key is a SHA-256 hash of the limiter key, so no email address or IP
-- address is stored.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key_hash CHAR(64) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INTEGER NOT NULL DEFAULT 0
);

-- Old windows are deleted in the background by the limiter.
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window_start
  ON rate_limit_buckets (window_start);

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 33, '{"migration": "rate_limit_buckets"}');
