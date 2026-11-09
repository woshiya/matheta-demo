// Student dashboard endpoints (MVP)
//
// Goals:
// - Show student classes
// - Per-class assignment stats (hw/cw, upcoming)
// - Lightweight insights for last 3 assignments (rank/percentile-ish + weak/strong topics)

module.exports = function attachStudentDashboardRoutes(app, pool) {
  // Per-class card stats for the student dashboard.
  // Returns one row per class with:
  // - hwCount, cwCount
  // - upcomingCount (next 14 days) + upcomingAssignments (name + due)
  // - missedCount (past due, not submitted) + missedAssignments (name + due)
  app.get('/api/students/:studentId/class-cards', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

    try {
      const hasSubmissions = await pool.query(
        "SELECT to_regclass('public.assignment_submissions') IS NOT NULL AS exists"
      );
      const submissionsExist = Boolean(hasSubmissions.rows?.[0]?.exists);

      // Base stats per class
      const base = await pool.query(
        `WITH my_classes AS (
           SELECT cm.class_id
           FROM class_memberships cm
           WHERE cm.user_id = $1 AND cm.membership_type = 'student'
         ),
         my_assignments AS (
           SELECT a.*
           FROM assignments a
           JOIN my_classes mc ON mc.class_id = a.class_id
           WHERE a.status <> 'draft'
         )
         SELECT
           a.class_id,
           COUNT(*) FILTER (WHERE a.type = 'hw')::int AS hw_count,
           COUNT(*) FILTER (WHERE a.type = 'cw')::int AS cw_count,
           COUNT(*) FILTER (
             WHERE a.due_at IS NOT NULL
               AND a.due_at > NOW()
               AND a.due_at <= (NOW() + INTERVAL '14 days')
           )::int AS upcoming_count,
           COUNT(*) FILTER (
             WHERE $2::boolean
               AND a.due_at IS NOT NULL
               AND a.due_at < NOW()
               AND COALESCE(s.status, 'not_started') NOT IN ('submitted','graded')
           )::int AS missed_count
         FROM my_assignments a
         LEFT JOIN assignment_submissions s
           ON $2::boolean
          AND s.assignment_id = a.id
          AND s.student_id = $1
         GROUP BY a.class_id
         ORDER BY a.class_id`,
        [studentId, submissionsExist]
      );

      const classIds = base.rows.map((r) => r.class_id);
      if (classIds.length === 0) return res.json([]);

      // Upcoming assignments (limit 3 per class)
      const upcoming = await pool.query(
        `WITH rows AS (
           SELECT
             a.class_id,
             a.id AS assignment_id,
             a.title,
             a.type,
             a.due_at,
             ROW_NUMBER() OVER (PARTITION BY a.class_id ORDER BY a.due_at ASC) AS rn
           FROM assignments a
           WHERE a.class_id = ANY($1::int[])
             AND a.status <> 'draft'
             AND a.due_at IS NOT NULL
             AND a.due_at > NOW()
             AND a.due_at <= (NOW() + INTERVAL '14 days')
         )
         SELECT class_id, assignment_id, title, type, due_at
         FROM rows
         WHERE rn <= 3
         ORDER BY class_id, due_at ASC`,
        [classIds]
      );

      // Missed assignments (limit 3 per class). Requires submissions.
      const missed = submissionsExist
        ? await pool.query(
            `WITH rows AS (
               SELECT
                 a.class_id,
                 a.id AS assignment_id,
                 a.title,
                 a.type,
                 a.due_at,
                 COALESCE(s.status, 'not_started') AS my_status,
                 ROW_NUMBER() OVER (PARTITION BY a.class_id ORDER BY a.due_at DESC) AS rn
               FROM assignments a
               LEFT JOIN assignment_submissions s
                 ON s.assignment_id = a.id
                AND s.student_id = $1
               WHERE a.class_id = ANY($2::int[])
                 AND a.status <> 'draft'
                 AND a.due_at IS NOT NULL
                 AND a.due_at < NOW()
                 AND COALESCE(s.status, 'not_started') NOT IN ('submitted','graded')
            )
            SELECT class_id, assignment_id, title, type, due_at, my_status
            FROM rows
            WHERE rn <= 3
            ORDER BY class_id, due_at DESC`,
            [studentId, classIds]
          )
        : { rows: [] };

      const upcomingByClass = Object.create(null);
      for (const r of upcoming.rows || []) {
        const k = String(r.class_id);
        if (!upcomingByClass[k]) upcomingByClass[k] = [];
        upcomingByClass[k].push({
          assignmentId: r.assignment_id,
          title: r.title,
          type: r.type,
          dueAt: r.due_at,
        });
      }
      const missedByClass = Object.create(null);
      for (const r of missed.rows || []) {
        const k = String(r.class_id);
        if (!missedByClass[k]) missedByClass[k] = [];
        missedByClass[k].push({
          assignmentId: r.assignment_id,
          title: r.title,
          type: r.type,
          dueAt: r.due_at,
          myStatus: r.my_status,
        });
      }

      res.json(
        base.rows.map((r) => ({
          ...r,
          upcoming_assignments: upcomingByClass[String(r.class_id)] || [],
          missed_assignments: missedByClass[String(r.class_id)] || [],
        }))
      );
    } catch (err) {
      console.error('[GET] Student class-cards error:', err);
      res.status(500).json({ error: 'Failed to fetch class cards' });
    }
  });

  // Upcoming + missed assignments list for the student (dashboard tiles).
  app.get('/api/students/:studentId/assignments/alerts', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
    const upcomingDays = req.query.upcomingDays ? Number(req.query.upcomingDays) : 14;
    const limit = req.query.limit ? Number(req.query.limit) : 6;

    try {
      const r = await pool.query(
        `WITH my_classes AS (
           SELECT cm.class_id
           FROM class_memberships cm
           WHERE cm.user_id = $1 AND cm.membership_type = 'student'
         ),
         my_assignments AS (
           SELECT a.id, a.class_id, a.title, a.due_at
           FROM assignments a
           JOIN my_classes mc ON mc.class_id = a.class_id
           WHERE a.status <> 'draft'
         ),
         my_status AS (
           SELECT assignment_id, status
           FROM assignment_submissions
           WHERE student_id = $1
         )
         SELECT
           a.id AS assignment_id,
           a.title,
           a.due_at,
           a.class_id,
           c.name AS class_name,
           COALESCE(s.status, 'not_started') AS my_status,
           CASE
             WHEN a.due_at IS NOT NULL
              AND a.due_at > NOW()
              AND a.due_at <= (NOW() + ($2::int * INTERVAL '1 day'))
             THEN true ELSE false
           END AS is_upcoming,
           CASE
             WHEN a.due_at IS NOT NULL
              AND a.due_at < NOW()
              AND COALESCE(s.status, 'not_started') NOT IN ('submitted','graded')
             THEN true ELSE false
           END AS is_missed
         FROM my_assignments a
         JOIN classes c ON c.id = a.class_id
         LEFT JOIN my_status s ON s.assignment_id = a.id
         WHERE a.due_at IS NOT NULL
         ORDER BY a.due_at ASC`,
        [studentId, Math.max(1, Math.min(60, Math.floor(upcomingDays)))]
      );

      const rows = r.rows || [];
      const upcoming = rows.filter((x) => x.is_upcoming).slice(0, limit);
      const missed = rows.filter((x) => x.is_missed).slice(0, limit);
      res.json({ upcoming, missed });
    } catch (err) {
      console.error('[GET] Student alerts error:', err);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  // Per-class assignment summary for a specific student.
  // Returns counts for HW/CW and upcoming HW (due soon) based on assignment due_at.
  app.get('/api/students/:studentId/class-summary', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

    try {
      // Ensure the submissions tables exist; the main server already uses these in analytics.
      // We keep this endpoint tolerant: if tables aren't present, return empty stats.
      const result = await pool.query(
        `WITH my_classes AS (
           SELECT cm.class_id
           FROM class_memberships cm
           WHERE cm.user_id = $1 AND cm.membership_type = 'student'
         )
         SELECT
           a.class_id,
           a.type,
           COUNT(DISTINCT a.id)::int AS assignments_count,
           COUNT(*) FILTER (
             WHERE a.type = 'hw'
               AND a.due_at IS NOT NULL
               AND a.due_at > NOW()
               AND a.due_at <= (NOW() + INTERVAL '7 days')
           )::int AS upcoming_hw_count
         FROM assignments a
         JOIN my_classes mc ON mc.class_id = a.class_id
         WHERE a.status IN ('published','draft')
         GROUP BY a.class_id, a.type
         ORDER BY a.class_id, a.type`,
        [studentId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error('[GET] Student class-summary error:', err);
      res.status(500).json({ error: 'Failed to fetch class summary' });
    }
  });

  // Student insights for last 3 assignments across all their classes.
  // Keeps it simple: returns recent assignments + the student's accuracy and class average accuracy.
  app.get('/api/students/:studentId/insights/recent', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

    try {
      const recentAssignments = await pool.query(
        `WITH my_classes AS (
           SELECT cm.class_id
           FROM class_memberships cm
           WHERE cm.user_id = $1 AND cm.membership_type = 'student'
         )
         SELECT a.id, a.class_id, a.type, a.title, a.created_at
         FROM assignments a
         JOIN my_classes mc ON mc.class_id = a.class_id
         WHERE a.status = 'published'
         ORDER BY a.created_at DESC
         LIMIT 3`,
        [studentId]
      );

      const assignmentIds = recentAssignments.rows.map((a) => a.id);
      if (assignmentIds.length === 0) return res.json({ assignments: [] });

      // Student accuracy per assignment
      const studentAcc = await pool.query(
        `SELECT
           s.assignment_id,
           COUNT(sa.*)::int AS attempts,
           SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM assignment_submissions s
         JOIN submission_answers sa ON sa.submission_id = s.id
         WHERE s.student_id = $1
           AND s.assignment_id = ANY($2::int[])
         GROUP BY s.assignment_id`,
        [studentId, assignmentIds]
      );
      const studentByAssignment = Object.create(null);
      for (const r of studentAcc.rows) studentByAssignment[String(r.assignment_id)] = r;

      // Class average accuracy per assignment
      const classAcc = await pool.query(
        `SELECT
           s.assignment_id,
           COUNT(sa.*)::int AS attempts,
           SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM assignment_submissions s
         JOIN submission_answers sa ON sa.submission_id = s.id
         WHERE s.assignment_id = ANY($1::int[])
         GROUP BY s.assignment_id`,
        [assignmentIds]
      );
      const classByAssignment = Object.create(null);
      for (const r of classAcc.rows) classByAssignment[String(r.assignment_id)] = r;

      // Weak/strong topics for the student across those recent assignments (top 3 each)
      const topicAcc = await pool.query(
        `WITH ans AS (
           SELECT
             sa.is_correct,
             q.topic_id,
             t.name AS topic_name
           FROM assignment_submissions s
           JOIN submission_answers sa ON sa.submission_id = s.id
           JOIN questions q ON q.id = sa.question_id
           LEFT JOIN topics t ON t.id = q.topic_id
           WHERE s.student_id = $1
             AND s.assignment_id = ANY($2::int[])
         )
         SELECT
           topic_id,
           COALESCE(topic_name, 'Unknown') AS topic_name,
           COUNT(*)::int AS attempts,
           SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM ans
         GROUP BY topic_id, topic_name
         HAVING COUNT(*) >= 3
         ORDER BY (SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::float / COUNT(*)) ASC`,
        [studentId, assignmentIds]
      );

      const topics = topicAcc.rows.map((r) => {
        const accuracy = r.attempts ? Math.round((r.correct / r.attempts) * 100) : 0;
        return { topicId: r.topic_id, topicName: r.topic_name, accuracy, attempts: r.attempts };
      });
      const weakAreas = topics.slice(0, 3);
      const strongAreas = [...topics].reverse().slice(0, 3);

      const assignments = recentAssignments.rows.map((a) => {
        const s = studentByAssignment[String(a.id)] || { attempts: 0, correct: 0 };
        const c = classByAssignment[String(a.id)] || { attempts: 0, correct: 0 };
        const studentAccuracy = s.attempts ? Math.round((s.correct / s.attempts) * 100) : null;
        const classAccuracy = c.attempts ? Math.round((c.correct / c.attempts) * 100) : null;
        return {
          assignmentId: a.id,
          classId: a.class_id,
          type: a.type,
          title: a.title,
          createdAt: a.created_at,
          studentAccuracy,
          classAccuracy,
        };
      });

      res.json({ assignments, weakAreas, strongAreas });
    } catch (err) {
      console.error('[GET] Student recent insights error:', err);
      res.status(500).json({ error: 'Failed to fetch insights' });
    }
  });

  // Student upcoming/missed assignments (per student across all their classes).
  // Upcoming: published assignments due in the future.
  // Missed: published assignments past due where student has not submitted/graded.
  app.get('/api/students/:studentId/assignments/alerts', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

    const now = new Date();
    const upcomingDays = req.query?.upcomingDays !== undefined && req.query?.upcomingDays !== null && !isNaN(+req.query.upcomingDays)
      ? Math.max(1, Math.min(60, parseInt(String(req.query.upcomingDays), 10)))
      : 14;
    const limit = req.query?.limit !== undefined && req.query?.limit !== null && !isNaN(+req.query.limit)
      ? Math.max(1, Math.min(50, parseInt(String(req.query.limit), 10)))
      : 10;

    try {
      // Upcoming assignments (future due date) in student's classes.
      const upcomingRes = await pool.query(
        `WITH my_classes AS (
           SELECT cm.class_id
           FROM class_memberships cm
           WHERE cm.user_id = $1 AND cm.membership_type = 'student'
         )
         SELECT
           a.id AS assignment_id,
           a.class_id,
           c.name AS class_name,
           a.type,
           a.title,
           a.due_at
         FROM assignments a
         JOIN my_classes mc ON mc.class_id = a.class_id
         JOIN classes c ON c.id = a.class_id
         WHERE a.status = 'published'
           AND a.due_at IS NOT NULL
           AND a.due_at > NOW()
           AND a.due_at <= (NOW() + make_interval(days => $2))
         ORDER BY a.due_at ASC
         LIMIT $3`,
        [studentId, upcomingDays, limit]
      );

      // Missed assignments: past due and either no submission row or not submitted/graded.
      const missedRes = await pool.query(
        `WITH my_classes AS (
           SELECT cm.class_id
           FROM class_memberships cm
           WHERE cm.user_id = $1 AND cm.membership_type = 'student'
         )
         SELECT
           a.id AS assignment_id,
           a.class_id,
           c.name AS class_name,
           a.type,
           a.title,
           a.due_at,
           COALESCE(s.status, 'not_started') AS submission_status
         FROM assignments a
         JOIN my_classes mc ON mc.class_id = a.class_id
         JOIN classes c ON c.id = a.class_id
         LEFT JOIN assignment_submissions s
           ON s.assignment_id = a.id AND s.student_id = $1
         WHERE a.status = 'published'
           AND a.due_at IS NOT NULL
           AND a.due_at < NOW()
           AND COALESCE(s.status, 'not_started') NOT IN ('submitted','graded')
         ORDER BY a.due_at DESC
         LIMIT $2`,
        [studentId, limit]
      );

      return res.json({
        now,
        upcomingDays,
        upcoming: upcomingRes.rows || [],
        missed: missedRes.rows || [],
      });
    } catch (err) {
      console.error('[GET] Student assignment alerts error:', err);
      return res.status(500).json({ error: 'Failed to fetch assignment alerts' });
    }
  });
};
