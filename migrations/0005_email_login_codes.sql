CREATE TABLE IF NOT EXISTS email_login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'KR',
  code_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_login_codes_email_created
  ON email_login_codes(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_login_codes_expires
  ON email_login_codes(expires_at);
