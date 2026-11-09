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

// Extra named students for richer teacher-facing demo screens.
export const DEMO_EXTRA_STUDENTS = {
  student3A: {
    id: 202,
    name: 'Student 3A',
    email: 'student3a@demo.com',
    role: 'student',
  },
  student4C: {
    id: 203,
    name: 'Student 4C',
    email: 'student4c@demo.com',
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

export const DEMO_CLASS_STUDENTS = {
  // Class id -> list of student user objects.
  1: [DEMO_EXTRA_STUDENTS.student3A],
  2: [DEMO_EXTRA_STUDENTS.student4C],
};

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
    assignmentId: 1001,
    assignmentTitle: 'Algebra Linear Equations - Demo',
    startedAt: '2026-01-10T10:00:00.000Z',
    endedAt: '2026-01-10T10:30:00.000Z',
    students: [
      { studentId: 202, name: 'Student 3A' },
    ],
    summary: {
      activeStudents: 1,
      raisedHandCount: 1,
      strugglingCount: 1,
      inactiveCount: 0,
      lowAccuracyQuestions: [
        { questionId: 2, accuracy: 33 },
      ],
    },
    perQuestion: [
      {
        questionId: 1,
        text: 'Solve: 2x + 3 = 11',
        attempts: 1,
        correct: 1,
        wrong: 0,
        accuracy: 100,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: { minSeconds: 22, meanSeconds: 22, maxSeconds: 22, count: 1 },
      },
      {
        questionId: 2,
        text: 'Solve: 5x - 10 = 0',
        attempts: 3,
        correct: 1,
        wrong: 2,
        accuracy: 33,
        raisedHands: 1,
        raisedHandStudentIds: [202],
        raisedHandHistoryStudentIds: [202],
        difficultMarks: 1,
        difficultMarkStudentIds: [202],
        slowCount: 1,
        slowStudentIds: [202],
        solveTime: { minSeconds: 35, meanSeconds: 78, maxSeconds: 120, count: 1 },
      },
      {
        questionId: 3,
        text: 'Solve: x/3 = 4',
        attempts: 1,
        correct: 1,
        wrong: 0,
        accuracy: 100,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: { minSeconds: 18, meanSeconds: 18, maxSeconds: 18, count: 1 },
      },
    ],
  },
  {
    sessionId: 'DEMO-SESSION-2',
    classId: 2,
    teacherId: DEMO_USERS.teacher.id,
    assignmentId: 1001,
    assignmentTitle: 'Algebra Linear Equations - Demo',
    startedAt: '2026-02-03T09:00:00.000Z',
    endedAt: '2026-02-03T09:24:00.000Z',
    students: [
      { studentId: 203, name: 'Student 4C' },
    ],
    summary: {
      activeStudents: 1,
      raisedHandCount: 0,
      strugglingCount: 0,
      inactiveCount: 0,
      lowAccuracyQuestions: [],
    },
    perQuestion: [
      {
        questionId: 1,
        text: 'Solve: 2x + 3 = 11',
        attempts: 1,
        correct: 1,
        wrong: 0,
        accuracy: 100,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: { minSeconds: 20, meanSeconds: 20, maxSeconds: 20, count: 1 },
      },
      {
        questionId: 2,
        text: 'Solve: 5x - 10 = 0',
        attempts: 1,
        correct: 1,
        wrong: 0,
        accuracy: 100,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: { minSeconds: 28, meanSeconds: 28, maxSeconds: 28, count: 1 },
      },
    ],
  },
];
