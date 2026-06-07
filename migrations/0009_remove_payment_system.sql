UPDATE payment_plans
SET is_active = 0;

PRAGMA foreign_keys = off;

DROP INDEX IF EXISTS idx_comments_issue_created;
DROP INDEX IF EXISTS idx_comment_reports_comment_reporter;
DROP INDEX IF EXISTS idx_comment_report_reviews_comment;

ALTER TABLE comment_report_reviews RENAME TO comment_report_reviews_legacy;
ALTER TABLE comment_reports RENAME TO comment_reports_legacy;
ALTER TABLE comments RENAME TO comments_paid_legacy;

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted', 'reported')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  idempotency_key TEXT
);

CREATE TABLE comment_reports (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comment_report_reviews (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE REFERENCES comments(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('hide', 'restore', 'dismiss')),
  note TEXT,
  reviewer_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO comments
  (id, issue_id, user_id, content, cost_amount, currency_code, status, created_at, deleted_at, idempotency_key)
SELECT
  id,
  issue_id,
  user_id,
  content,
  0,
  currency_code,
  status,
  created_at,
  deleted_at,
  NULL
FROM comments_paid_legacy;

INSERT INTO comment_reports
  (id, comment_id, reporter_session_id, reason, created_at)
SELECT
  id,
  comment_id,
  reporter_session_id,
  reason,
  created_at
FROM comment_reports_legacy;

INSERT INTO comment_report_reviews
  (id, comment_id, action, note, reviewer_label, created_at)
SELECT
  id,
  comment_id,
  action,
  note,
  reviewer_label,
  created_at
FROM comment_report_reviews_legacy;

DROP TABLE comment_report_reviews_legacy;
DROP TABLE comment_reports_legacy;
DROP TABLE comments_paid_legacy;

CREATE INDEX IF NOT EXISTS idx_comments_issue_created ON comments(issue_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_user_idempotency
  ON comments(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reports_comment_reporter
  ON comment_reports(comment_id, reporter_session_id);
CREATE INDEX IF NOT EXISTS idx_comment_report_reviews_comment
  ON comment_report_reviews(comment_id, created_at DESC);

PRAGMA foreign_keys = on;
