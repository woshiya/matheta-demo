import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import StudentSidebar from "../components/StudentSidebar";
import { httpFetch } from "../lib/http";

function StudentLayout() {
  const [classes, setClasses] = useState([]);
  const [showClasses, setShowClasses] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function loadStudentClasses() {
      const user = JSON.parse(localStorage.getItem("user"));
      const studentId = user?.id;
      if (!studentId) return;
      try {
        const res = await httpFetch(`/api/students/${studentId}/classes`);
        if (!res.ok) {
          setClasses([]);
          return;
        }
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch {
        setClasses([]);
      }
    }
    loadStudentClasses();
  }, []);

  function handleLogout() {
    localStorage.removeItem("user");
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div
        className={
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 " +
          (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <StudentSidebar
          classes={classes}
          showClasses={showClasses}
          setShowClasses={setShowClasses}
          onLogout={handleLogout}
          onNavigate={() => setSidebarOpen(false)}
        />
      </div>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 bg-gray-50/90 backdrop-blur border-b border-gray-200 md:hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
              onClick={() => setSidebarOpen(true)}
            >
              Menu
            </button>
            <div className="text-sm font-semibold text-gray-800">Student</div>
            <div className="w-[64px]" />
          </div>
        </div>
        <Outlet context={{ classes }} />
      </main>
    </div>
  );
}

export default StudentLayout;
