-- Maths domains/topics taxonomy (normalized)

CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS domains_subject_idx ON domains(subject_id);

CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (domain_id, key),
  UNIQUE (domain_id, name)
);

CREATE INDEX IF NOT EXISTS topics_domain_idx ON topics(domain_id);

-- Extend questions to support topic tagging + difficulty metadata
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10) NOT NULL DEFAULT 'medium'
  CHECK (difficulty IN ('easy','medium','hard'));

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual'
  CHECK (source IN ('ai','manual'));

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS questions_topic_idx ON questions(topic_id);
CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON questions(difficulty);
CREATE INDEX IF NOT EXISTS questions_source_idx ON questions(source);
CREATE INDEX IF NOT EXISTS questions_created_by_idx ON questions(created_by);
