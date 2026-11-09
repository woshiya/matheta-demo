import { useNavigate } from "react-router-dom";

export default function StudentDiagnosticRoute() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Diagnostic Test</h1>
      <p className="text-sm text-gray-600 mt-1">
        Take a teacher-started diagnostic for your class.
      </p>

      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
        <button
          type="button"
          onClick={() => navigate("/student/diagnostic/setup")}
          className="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
        >
          Find Active Session
        </button>
      </div>
    </div>
  );
}
