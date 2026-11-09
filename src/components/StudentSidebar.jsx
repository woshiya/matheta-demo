import { NavLink } from "react-router-dom";

function StudentSidebar({
  classes,
  showClasses,
  setShowClasses,
  onLogout,
  onNavigate,
}) {
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  })();

  const navClass = ({ isActive }) =>
    `block px-4 py-2 rounded-xl border transition ${
      isActive
        ? "bg-white/15 border-white/20 text-white"
        : "bg-white/5 border-white/10 text-white/90 hover:bg-white/10"
    }`;

  const firstClassId = (classes || [])[0]?.id ? String((classes || [])[0].id) : null;

  return (
    <aside className="h-full bg-blue-900 border-r border-blue-800 flex flex-col justify-between">
      <div>
        <div className="p-6">
          <div className="text-2xl font-semibold tracking-wide text-white">MATHETA</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
            Student Panel
          </div>
          <div className="mt-4">
            <div className="text-sm text-white/90 break-words">{user?.name || "Student"}</div>
            {user?.email ? (
              <div className="text-xs text-white/60 mt-0.5 break-all">{user.email}</div>
            ) : null}
          </div>
        </div>

        <nav className="px-4 pb-6 space-y-2 text-sm">
          <NavLink to="/student" end className={navClass} onClick={onNavigate}>
            Dashboard
          </NavLink>

          {/* Practice corner is class-scoped; default to the first class. */}
          <NavLink
            to={firstClassId ? `/student/class/${firstClassId}/practice` : "/student"}
            className={navClass}
            onClick={onNavigate}
          >
            Practice Corner
          </NavLink>

          <NavLink to="/student/join" className={navClass} onClick={onNavigate}>
            Join Live Session
          </NavLink>

          <div>
            <button
              type="button"
              onClick={() => setShowClasses(!showClasses)}
              className="w-full text-left px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/90 hover:bg-white/10 transition"
            >
              My Classes
            </button>

            {showClasses && (
              <div className="ml-4 mt-2 space-y-1">
                {(classes || []).length === 0 ? (
                  <div className="px-4 py-2 text-sm text-white/60">No classes yet.</div>
                ) : (
                  classes.map((cls) => (
                    <NavLink
                      key={cls.id}
                      to={`/student/class/${cls.id}`}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `block px-4 py-2 rounded-xl text-sm border transition ${
                          isActive
                            ? "bg-white/15 border-white/20 text-white"
                            : "bg-white/0 border-transparent text-white/80 hover:bg-white/10 hover:border-white/10"
                        }`
                      }
                      title={
                        Array.isArray(cls.subjects) && cls.subjects.length > 0
                          ? `${cls.name} - ${cls.subjects.join(", ")}`
                          : cls.name
                      }
                    >
                      <span className="break-words">{cls.name}</span>
                      {Array.isArray(cls.subjects) && cls.subjects.length > 0
                        ? ` - ${cls.subjects.join(", ")}`
                        : ""}
                    </NavLink>
                  ))
                )}
              </div>
            )}
          </div>

          <NavLink to="/student/diagnostic" className={navClass} onClick={onNavigate}>
            Diagnostic Test
          </NavLink>
        </nav>
      </div>

      <div className="p-4">
        <button
          onClick={onLogout}
          className="w-full text-left text-sm text-white/80 hover:text-white hover:underline"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}

export default StudentSidebar;
