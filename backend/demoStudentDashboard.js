// Helpers for student dashboard (upcoming + missed assignments)

module.exports = function attachDemoStudentDashboardRoutes(app, pool) {
  // Create a few due dates so the dashboard can show upcoming/missed lists.
  // Body: { classId?, upcomingDays?, missedDays?, count?, studentId? }
  app.post('/api/seed-student-dashboard', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Disabled in production' });
    }

    const classIdIn = req.body?.classId;
    const classId = classIdIn !== undefined && classIdIn !== null && String(classIdIn).trim() !== ''
      ? parseInt(String(classIdIn), 10)
      : null;
    const upcomingDays = req.body?.upcomingDays !== undefined ? Number(req.body.upcomingDays) : 5;
    const missedDays = req.body?.missedDays !== undefined ? Number(req.body.missedDays) : 3;
    const count = req.body?.count !== undefined ? Number(req.body.count) : 2;
    const studentId = req.body?.studentId !== undefined ? parseInt(String(req.body.studentId), 10) : 2;

    if (classIdIn !== undefined && !classId) return res.status(400).json({ error: 'Invalid classId' });

    try {
      // Pick candidate assignments in the student's classes (or a specific class)
      const assignmentsRes = await pool.query(
        `WITH my_classes AS (
           SELECT cm.class_id
           FROM class_memberships cm
           WHERE cm.user_id = $1 AND cm.membership_type = 'student'
         )
         SELECT a.id, a.class_id
         FROM assignments a
         JOIN my_classes mc ON mc.class_id = a.class_id
         WHERE a.status <> 'draft'
           AND ($2::int IS NULL OR a.class_id = $2)
         ORDER BY a.created_at DESC`,
        [studentId, classId]
      );

      const ids = (assignmentsRes.rows || []).map((r) => r.id);
      if (ids.length === 0) {
        return res.json({ ok: true, message: 'No assignments found to seed due dates for' });
      }

      // Take some ids to become upcoming and missed. Prefer assignments that already have a submission row
      // so the dashboard can detect "missed" based on assignment_submissions.
      const withSubmissionRes = await pool.query(
        `SELECT s.assignment_id
         FROM assignment_submissions s
         WHERE s.student_id = $1
           AND s.assignment_id = ANY($2::int[])`,
        [studentId, ids]
      );
      const withSubmission = new Set((withSubmissionRes.rows || []).map((r) => Number(r.assignment_id)));
      const idsWith = ids.filter((id) => withSubmission.has(Number(id)));
      const idsWithout = ids.filter((id) => !withSubmission.has(Number(id)));
      const orderedForMissed = [...idsWith, ...idsWithout];

      const upcomingIds = ids.slice(0, Math.max(0, Math.min(count, ids.length)));
      const missedIds = orderedForMissed.slice(Math.max(0, count), Math.max(0, Math.min(count * 2, orderedForMissed.length)));

      for (let i = 0; i < upcomingIds.length; i++) {
        await pool.query(
          `UPDATE assignments
           SET due_at = NOW() + ($2::int * INTERVAL '1 day'), status='published', updated_at = NOW()
           WHERE id = $1`,
          [upcomingIds[i], Math.max(1, Math.floor(upcomingDays + i))]
        );
      }
      for (let i = 0; i < missedIds.length; i++) {
        await pool.query(
          `UPDATE assignments
           SET due_at = NOW() - ($2::int * INTERVAL '1 day'), status='published', updated_at = NOW()
           WHERE id = $1`,
          [missedIds[i], Math.max(1, Math.floor(missedDays + i))]
        );
      }

      // Ensure assignment_submissions rows exist so "missed" can be computed.
      await pool.query(
        `INSERT INTO assignment_submissions (assignment_id, student_id, status)
         SELECT a.id, $1, 'not_started'
         FROM assignments a
         WHERE a.id = ANY($2::int[])
         ON CONFLICT (assignment_id, student_id) DO NOTHING`,
        [studentId, missedIds]
      );

      // If a submission already exists (seeded or previous testing), force it back to not_started
      // so the item shows up as "missed".
      await pool.query(
        `UPDATE assignment_submissions
         SET status = 'not_started', submitted_at = NULL, graded_at = NULL
         WHERE student_id = $1
           AND assignment_id = ANY($2::int[])`,
        [studentId, missedIds]
      );

      return res.json({
        ok: true,
        seeded: {
          upcomingAssignmentIds: upcomingIds,
          missedAssignmentIds: missedIds,
        },
      });
    } catch (err) {
      console.error('[POST] seed-student-dashboard error:', err);
      return res.status(500).json({ error: 'Failed to seed student dashboard data' });
    }
  });
};
