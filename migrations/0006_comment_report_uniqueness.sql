CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reports_comment_reporter
  ON comment_reports(comment_id, reporter_session_id);
