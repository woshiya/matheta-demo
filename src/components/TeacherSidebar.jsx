import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  BookOpen,
  PlayCircle,
  BarChart3,
  Stethoscope,
  LogOut,
} from "lucide-react";

function TeacherSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const navItem = (path, label, Icon, highlight = false) => (
    <button
      onClick={() => navigate(path)}
      className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg mb-2 transition ${
        isActive(path)
          ? highlight
            ? "bg-green-200 text-green-800"
            : "bg-purple-200 text-purple-800"
          : "hover:bg-gray-200"
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="w-72 min-h-screen bg-gray-100 p-6 flex flex-col justify-between">

      {/* Top Section */}
      <div>
        {/* Logo */}
        <div className="flex items-center gap-2 text-2xl font-bold mb-8">
          <GraduationCap className="text-purple-600" />
          Mathēta
        </div>

        <p className="text-xs uppercase text-gray-500 mb-3">
          Teaching Panel
        </p>

        {/* Dashboard */}
        {navItem("/teacher", "Dashboard", LayoutDashboard)}

        {/* Classes */}
        {navItem("/teacher/classes", "Classes", Users)}

        {/* Assignments */}
        {navItem("/teacher/assignments", "Assignments", BookOpen)}

        {/* ✅ Core Feature */}
        <div className="mt-4">
          <p className="text-xs uppercase text-gray-500 mb-2">
            Live Teaching
          </p>

          {navItem(
            "/teacher/live-session",
            "Start Live Session",
            PlayCircle,
            true
          )}
        </div>

        {/* Insights */}
        <div className="mt-6">
          <p className="text-xs uppercase text-gray-500 mb-2">
            Analytics
          </p>

          {navItem("/teacher/insights", "Insights", BarChart3)}
          {navItem("/teacher/diagnostics", "Diagnostic Centre", Stethoscope)}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => {
          localStorage.removeItem("user");
          navigate("/");
        }}
        className="flex items-center gap-2 border px-4 py-2 rounded-lg hover:bg-gray-200 transition"
      >
        <LogOut size={16} />
        Logout
      </button>
    </div>
  );
}

export default TeacherSidebar;
