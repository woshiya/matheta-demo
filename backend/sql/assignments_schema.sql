-- Assignments schema (HW/CW) + recipients + submissions + question mapping

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('hw','cw')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  -- Teachers control if students can see answer keys.
  answers_visible BOOLEAN NOT NULL DEFAULT FALSE,
  -- Teachers choose between auto marking and manual marking.
  grading_mode VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (grading_mode IN ('auto','manual')),
  due_at TIMESTAMP,
  scheduled_at TIMESTAMP,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Safe migration for existing DBs.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS answers_visible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS assignments_class_id_idx ON assignments(class_id);
CREATE INDEX IF NOT EXISTS assignments_created_by_idx ON assignments(created_by);
CREATE INDEX IF NOT EXISTS assignments_type_status_idx ON assignments(type, status);

CREATE TABLE IF NOT EXISTS assignment_recipients (
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS assignment_recipients_student_idx ON assignment_recipients(student_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','submitted','graded','missing')),
  started_at TIMESTAMP,
  submitted_at TIMESTAMP,
  graded_at TIMESTAMP,
  score NUMERIC(8,2),
  max_score NUMERIC(8,2),
  feedback TEXT,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS assignment_submissions_assignment_idx ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_student_idx ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_status_idx ON assignment_submissions(status);

-- Minimal question bank + which questions were included
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  question_type VARCHAR(20) NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','short','long')),
  correct_answer TEXT,
  solution_text TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS questions_subject_idx ON questions(subject_id);

CREATE TABLE IF NOT EXISTS assignment_questions (
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  points NUMERIC(8,2) NOT NULL DEFAULT 1,
  PRIMARY KEY (assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS assignment_questions_assignment_pos_idx
  ON assignment_questions(assignment_id, position);

CREATE TABLE IF NOT EXISTS submission_answers (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  answer TEXT,
  workings TEXT,
  is_correct BOOLEAN,
  points_awarded NUMERIC(8,2),
  teacher_points_awarded NUMERIC(8,2),
  teacher_feedback TEXT,
  teacher_marked_at TIMESTAMP,
  ai_mark_json JSONB,
  ai_marked_at TIMESTAMP,
  response_time_ms INTEGER,
  answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS submission_answers_submission_idx ON submission_answers(submission_id);
