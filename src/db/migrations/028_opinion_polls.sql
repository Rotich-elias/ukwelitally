-- Opinion polls.
--
-- A candidate account or an administrator can create a poll, add options and
-- share a public link. Anyone with the link can vote once per browser. Polls
-- are deliberately separate from the election result tables: they are
-- opinion, not tallied votes, and are never mixed into the published results.

CREATE TABLE IF NOT EXISTS opinion_polls (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(140) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opinion_polls_creator ON opinion_polls(created_by);
CREATE INDEX IF NOT EXISTS idx_opinion_polls_candidate ON opinion_polls(candidate_id);
CREATE INDEX IF NOT EXISTS idx_opinion_polls_status ON opinion_polls(status);

CREATE TABLE IF NOT EXISTS opinion_poll_options (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES opinion_polls(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opinion_poll_options_poll
  ON opinion_poll_options(poll_id, sort_order);

CREATE TABLE IF NOT EXISTS opinion_poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES opinion_polls(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES opinion_poll_options(id) ON DELETE CASCADE,
  voter_fingerprint VARCHAR(64) NOT NULL,
  ip_hash VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, voter_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_opinion_poll_votes_poll ON opinion_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_opinion_poll_votes_option ON opinion_poll_votes(option_id);

COMMENT ON TABLE opinion_polls IS
  'Candidate or administrator created opinion polls. Separate from election results.';
COMMENT ON TABLE opinion_poll_votes IS
  'One row per browser fingerprint and poll. The fingerprint is a hash and no raw IP address is stored.';

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES (
  'database_migration',
  'schema',
  28,
  '{"migration": "opinion_polls"}'
);
