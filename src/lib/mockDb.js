// Static demo dataset used when running as a purely-static site (no backend).
// Keep this intentionally small but representative.

export const DEMO_USERS = {
  teacher: {
    id: 101,
    name: 'Demo Teacher',
    email: 'teacher@demo.com',
    role: 'teacher',
  },
  student: {
    id: 201,
    name: 'Student One',
    email: 'student1@demo.com',
    role: 'student',
  },
};

export const DEMO_CLASSES = [
  {
    id: 1,
    name: '3A - Maths',
    subjects: ['Mathematics'],
  },
  {
    id: 2,
    name: '4C - Maths',
    subjects: ['Mathematics'],
  },
];

export const DEMO_ASSIGNMENTS = [
  {
    id: 1001,
    class_id: 1,
    type: 'cw',
    title: 'Algebra Linear Equations - Demo',
    description: 'A short demo classwork assignment (static showcase).',
    status: 'published',
    answers_visible: true,
    due_at: null,
    scheduled_at: null,
    created_by: DEMO_USERS.teacher.id,
    created_at: '2026-01-10T09:00:00.000Z',
  },
  {
    id: 1002,
    class_id: 1,
    type: 'hw',
    title: 'Number Bonds Homework - Demo',
    description: 'A short demo homework assignment (static showcase).',
    status: 'draft',
    answers_visible: false,
    due_at: null,
    scheduled_at: null,
    created_by: DEMO_USERS.teacher.id,
    created_at: '2026-01-08T15:00:00.000Z',
  },
];

export const DEMO_SUBMISSIONS = [
  {
    id: 9001,
    assignment_id: 1001,
    student_id: DEMO_USERS.student.id,
    status: 'submitted',
    submitted_at: '2026-01-10T09:12:00.000Z',
    score: 8,
    max_score: 10,
  },
];

export const DEMO_LIVE_SESSIONS = [
  {
    sessionId: 'DEMO-SESSION-1',
    classId: 1,
    teacherId: DEMO_USERS.teacher.id,
    startedAt: '2026-01-10T10:00:00.000Z',
    endedAt: '2026-01-10T10:30:00.000Z',
    summary: {
      pace: 'normal',
      participationRate: 0.68,
      commonMisconceptions: ['sign errors in transposition', 'dropping negatives'],
    },
  },
];
