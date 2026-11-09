-- Demo seed data for assignments (requires assignments_schema.sql and existing demo users/classes)

-- Find teacher and subject ids
WITH teacher AS (
  SELECT id AS teacher_id FROM users WHERE email = 'teacher@demo.com' LIMIT 1
),
math AS (
  SELECT id AS subject_id FROM subjects WHERE name = 'Mathematics' LIMIT 1
),
eng AS (
  SELECT id AS subject_id FROM subjects WHERE name = 'English' LIMIT 1
)
INSERT INTO assignments (class_id, subject_id, type, title, description, status, due_at, created_by)
SELECT 1, math.subject_id, 'hw', 'Algebra Practice 1', 'Solve the linear equations set.', 'published', NOW() + INTERVAL '3 days', teacher.teacher_id
FROM teacher, math
ON CONFLICT DO NOTHING;

WITH teacher AS (
  SELECT id AS teacher_id FROM users WHERE email = 'teacher@demo.com' LIMIT 1
),
math AS (
  SELECT id AS subject_id FROM subjects WHERE name = 'Mathematics' LIMIT 1
)
-- Removed: 'Warm-up Quiz' legacy demo seed (it caused noisy assignment lists).
-- The demo CW assignment is now handled in backend/server.js seedDemoCoreData
-- and is titled: 'Algebra Linear Equations AI Generated Qs - Demo'.

WITH teacher AS (
  SELECT id AS teacher_id FROM users WHERE email = 'teacher@demo.com' LIMIT 1
),
eng AS (
  SELECT id AS subject_id FROM subjects WHERE name = 'English' LIMIT 1
)
INSERT INTO assignments (class_id, subject_id, type, title, description, status, due_at, created_by)
SELECT 2, eng.subject_id, 'hw', 'Reading Comprehension', 'Read the passage and answer questions.', 'published', NOW() + INTERVAL '5 days', teacher.teacher_id
FROM teacher, eng
ON CONFLICT DO NOTHING;

-- Recipients + submissions (snapshot current roster)
INSERT INTO assignment_recipients (assignment_id, student_id)
SELECT a.id, cm.user_id
FROM assignments a
JOIN class_memberships cm ON cm.class_id = a.class_id
WHERE cm.membership_type = 'student'
  AND a.status = 'published'
ON CONFLICT DO NOTHING;

INSERT INTO assignment_submissions (assignment_id, student_id, status, started_at, submitted_at, score, max_score)
SELECT r.assignment_id, r.student_id,
       CASE WHEN (r.student_id % 2) = 0 THEN 'submitted' ELSE 'not_started' END,
       CASE WHEN (r.student_id % 2) = 0 THEN NOW() - INTERVAL '1 day' ELSE NULL END,
       CASE WHEN (r.student_id % 2) = 0 THEN NOW() - INTERVAL '10 hours' ELSE NULL END,
       CASE WHEN (r.student_id % 2) = 0 THEN 8 ELSE NULL END,
       10
FROM assignment_recipients r
ON CONFLICT (assignment_id, student_id) DO NOTHING;

-- Minimal questions + attach to first assignment
WITH math AS (SELECT id AS subject_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
INSERT INTO questions (subject_id, prompt, question_type, correct_answer)
SELECT math.subject_id, 'Solve: 2x + 3 = 11', 'short', '4'
FROM math
ON CONFLICT DO NOTHING;

INSERT INTO assignment_questions (assignment_id, question_id, position, points)
SELECT a.id, q.id, 1, 2
FROM assignments a
JOIN questions q ON q.prompt = 'Solve: 2x + 3 = 11'
WHERE a.title = 'Algebra Practice 1'
ON CONFLICT DO NOTHING;

-- Add an answer for any submitted submission for that assignment
INSERT INTO submission_answers (submission_id, question_id, answer, is_correct, points_awarded)
SELECT s.id, q.id,
       CASE WHEN (s.student_id % 4) = 0 THEN '4' ELSE '5' END,
       CASE WHEN (s.student_id % 4) = 0 THEN TRUE ELSE FALSE END,
       CASE WHEN (s.student_id % 4) = 0 THEN 2 ELSE 0 END
FROM assignment_submissions s
JOIN assignments a ON a.id = s.assignment_id
JOIN assignment_questions aq ON aq.assignment_id = a.id
JOIN questions q ON q.id = aq.question_id
WHERE a.title = 'Algebra Practice 1'
  AND s.status = 'submitted'
ON CONFLICT DO NOTHING;
