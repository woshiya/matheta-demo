import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/login";
import StudentLayout from "./layouts/StudentLayout";
import TeacherLayout from "./layouts/TeacherLayout";

import StudentJoinSession from "./pages/student/StudentJoinSession";
import StudentLiveWorksheet from "./pages/student/StudentLiveWorksheet";
import StudentDashboardRoute from "./pages/student/StudentDashboardRoute";
import StudentDiagnosticRoute from "./pages/student/StudentDiagnosticRoute";
import StudentDiagnosticSetupRoute from "./pages/student/StudentDiagnosticSetupRoute";
import StudentDiagnosticSessionRoute from "./pages/student/StudentDiagnosticSessionRoute";
import StudentClassAssignmentsRoute from "./pages/student/StudentClassAssignmentsRoute";
import StudentAssignmentPage from "./pages/student/StudentAssignmentPage";
import StudentPractice from "./pages/student/StudentPractice";
import StudentPracticeSetup from "./pages/student/StudentPracticeSetup";

import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import ClassDetail from "./pages/teacher/ClassDetail";
import NewAssignment from "./pages/teacher/NewAssignment";
import TeacherAssignments from "./pages/teacher/TeacherAssignments";
import AssignmentDetail from "./pages/teacher/AssignmentDetail";
import SubmissionDetail from "./pages/teacher/SubmissionDetail";
import LiveSessionSetup from "./pages/teacher/LiveSessionSetup";
import LiveSessionRoom from "./pages/teacher/LiveSessionRoom";
import LiveSessionSummary from "./pages/teacher/LiveSessionSummary";
import LiveSessionReport from "./pages/teacher/LiveSessionReport";
import DiagnosticCentre from "./pages/teacher/DiagnosticCentre";
import ProductPage from "./pages/ProductPage";
// import Homework from "./pages/teacher/Homework";

function ProtectedRoute({ children, role }) {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Product landing */}
        <Route path="/product" element={<ProductPage />} />

        {/* Demo entry */}
        <Route path="/" element={<Navigate to="/teacher" replace />} />
        <Route path="/login" element={<Login />} />

        {/* ✅ Student Routes */}
        <Route
          path="/student"
          element={
            <ProtectedRoute role="student">
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<StudentDashboardRoute />} />
          <Route path="join" element={<StudentJoinSession />} />
          <Route path="session/:sessionId" element={<StudentLiveWorksheet />} />
          <Route path="diagnostic" element={<StudentDiagnosticRoute />} />
          <Route path="diagnostic/setup" element={<StudentDiagnosticSetupRoute />} />
          <Route path="diagnostic/:classId/:sessionId" element={<StudentDiagnosticSessionRoute />} />
          <Route path="class/:classId" element={<StudentClassAssignmentsRoute />} />
          <Route path="class/:classId/practice" element={<StudentPractice />} />
          <Route path="class/:classId/practice/:topicId" element={<StudentPracticeSetup />} />
          <Route path="assignments/:assignmentId" element={<StudentAssignmentPage />} />
        </Route>

        {/* ✅ Teacher Routes */}
        <Route
          path="/teacher"
          element={
            <ProtectedRoute role="teacher">
              <TeacherLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard (Manage + Insights tabs live here) */}
          <Route index element={<TeacherDashboard />} />

          {/* Student Performance Page */}
          <Route path="class/:id" element={<ClassDetail />} />

          {/* Assignments */}
          <Route path="assignments" element={<TeacherAssignments />} />
          <Route path="assignments/new" element={<NewAssignment />} />
          <Route path="assignments/:assignmentId" element={<AssignmentDetail />} />
          <Route path="submissions/:submissionId" element={<SubmissionDetail />} />

          {/* Live Session MVP */}
          <Route path="live" element={<LiveSessionSetup />} />
          <Route path="live/:sessionId" element={<LiveSessionRoom />} />
          <Route path="live/:sessionId/summary" element={<LiveSessionSummary />} />
          <Route path="live/reports/:sessionId" element={<LiveSessionReport />} />

          {/* Future Deep Pages */}
          <Route path="diagnostics" element={<DiagnosticCentre />} />
          {/* <Route path="homework" element={<Homework />} /> */}

        </Route>

        {/* ✅ Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
