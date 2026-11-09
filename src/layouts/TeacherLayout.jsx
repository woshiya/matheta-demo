import React, { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { httpFetch } from "../lib/http";
import AuditTrailModal from "../components/AuditTrailModal";

export default function TeacherLayout() {
  const [classes, setClasses] = useState([]);
  const [showClasses, setShowClasses] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Load classes for the logged-in teacher from the backend
  useEffect(() => {
    // Demo convenience: ensure the demo teacher is a member of all classes.
    // This prevents "Not a teacher of this class" on seeded demo data.
    async function ensureTeacherMembership(teacherId) {
      try {
        await httpFetch(`/api/assign-teacher-all-classes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId }),
        });
      } catch {
        // ignore
      }
    }

    async function loadClasses() {
      const user = JSON.parse(localStorage.getItem("user"));
      const teacherId = user?.id;
      if (!teacherId) return;

      // Demo mode doesn't need DB membership checks.
      if (String(user?.email || "").endsWith("@demo.com")) await ensureTeacherMembership(teacherId);
      try {
        const res = await httpFetch(`/api/teachers/${teacherId}/classes`);
        if (!res.ok) return;
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch {
        setClasses([]);
      }
    }
    loadClasses();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.href = "/";
  };

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

      {/* ✅ Sidebar */}
      <aside
        className={
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col justify-between bg-purple-900 border-r border-purple-800 transform transition md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 " +
          (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >

        <div>

          {/* Logo */}
          <div className="p-6">
            <div className="text-2xl font-semibold tracking-wide text-white">
              MATHETA
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
              Teacher Panel
            </div>
          </div>

          {/* Navigation */}
          <nav className="px-4 pb-6 space-y-2 text-sm">

            {/* Dashboard */}
            <NavLink
              to="/teacher"
              end
              className={({ isActive }) =>
                `block px-4 py-2 rounded-xl border transition ${
                  isActive
                    ? "bg-white/15 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/90 hover:bg-white/10"
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              Dashboard
            </NavLink>

            {/* ✅ Classes Section */}
            <div>

              <button
                onClick={() => setShowClasses(!showClasses)}
                className="w-full text-left px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/90 hover:bg-white/10 transition"
              >
                Classes
              </button>

              {showClasses && (
                <div className="ml-4 mt-2 space-y-1">
                  {classes.map((cls) => (
                    <NavLink
                      key={cls.id}
                      to={`/teacher/class/${cls.id}`}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `block px-4 py-2 rounded-xl text-sm border transition ${
                          isActive
                            ? "bg-white/15 border-white/20 text-white"
                            : "bg-white/0 border-transparent text-white/80 hover:bg-white/10 hover:border-white/10"
                        }`
                      }
                    >
                      <span className="break-words">{cls.name}</span>
                      {Array.isArray(cls.subjects) && cls.subjects.length > 0 ? (
                        <span className="text-white/60">{` - ${cls.subjects.join(", ")}`}</span>
                      ) : null}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            {/* Assignments */}
            <NavLink
              to="/teacher/assignments"
              className={({ isActive }) =>
                `block px-4 py-2 rounded-xl border transition ${
                  isActive
                    ? "bg-white/15 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/90 hover:bg-white/10"
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              Assignments
            </NavLink>

            {/* Live Session */}
            <NavLink
              to="/teacher/live"
              className={({ isActive }) =>
                `block px-4 py-2 rounded-xl border transition ${
                  isActive
                    ? "bg-white/15 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/90 hover:bg-white/10"
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              Live Session
            </NavLink>

            {/* Diagnostic */}
            <NavLink
              to="/teacher/diagnostics"
              className={({ isActive }) =>
                `block px-4 py-2 rounded-xl border transition ${
                  isActive
                    ? "bg-white/15 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/90 hover:bg-white/10"
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              Diagnostic Centre
            </NavLink>

          </nav>
        </div>

        {/* Logout */}
        <div className="p-4">
          <button
            onClick={() => setAuditOpen(true)}
            className="w-full text-left text-sm text-white/80 hover:text-white hover:underline"
          >
            Audit Trail
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-white/80 hover:text-white hover:underline"
          >
            Logout
          </button>
        </div>

      </aside>

      {/* ✅ Main Content */}
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
            <div className="text-sm font-semibold text-gray-800">Teacher</div>
            <div className="w-[64px]" />
          </div>
        </div>

        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>

      <AuditTrailModal open={auditOpen} onClose={() => setAuditOpen(false)} scope="teacher" />

    </div>
  );
}
