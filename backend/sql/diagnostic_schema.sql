-- Diagnostic sessions + attempts + answers + per-domain scores

CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '45 minutes'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS diagnostic_sessions_class_status_idx
  ON diagnostic_sessions(class_id, status);

CREATE TABLE IF NOT EXISTS diagnostic_attempts (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','submitted','expired')),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP,
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS diagnostic_attempts_session_idx
  ON diagnostic_attempts(session_id);
CREATE INDEX IF NOT EXISTS diagnostic_attempts_student_idx
  ON diagnostic_attempts(student_id);

CREATE TABLE IF NOT EXISTS diagnostic_answers (
  attempt_id INTEGER NOT NULL REFERENCES diagnostic_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  selected_option TEXT,
  is_correct BOOLEAN,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS diagnostic_answers_attempt_idx
  ON diagnostic_answers(attempt_id);

CREATE TABLE IF NOT EXISTS diagnostic_domain_scores (
  attempt_id INTEGER NOT NULL REFERENCES diagnostic_attempts(id) ON DELETE CASCADE,
  domain_key TEXT NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, domain_key)
);

CREATE INDEX IF NOT EXISTS diagnostic_domain_scores_attempt_idx
  ON diagnostic_domain_scores(attempt_id);
