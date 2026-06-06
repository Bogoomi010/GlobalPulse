CREATE TABLE IF NOT EXISTS comment_report_reviews (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE REFERENCES comments(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('hide', 'restore', 'dismiss')),
  note TEXT,
  reviewer_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comment_report_reviews_comment
  ON comment_report_reviews(comment_id, created_at DESC);
