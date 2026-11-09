import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { httpFetch } from "../../lib/http";

export default function TeacherAssignments() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [status, setStatus] = useState("idle");
  const [publishingId, setPublishingId] = useState(null);
  const [publishError, setPublishError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const user = JSON.parse(localStorage.getItem("user"));
  const teacherId = user?.id;

  const classId = searchParams.get("classId") || "";
  const type = searchParams.get("type") || "all"; // all | hw | cw

  useEffect(() => {
    async function loadClasses() {
      if (!teacherId) return;
      try {
        const res = await httpFetch(`/api/teachers/${teacherId}/classes`);
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setClasses(list);

        // Default class selection
        if (!classId && list.length > 0) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("classId", String(list[0].id));
            return next;
          }, { replace: true });
        }
      } catch {
        setClasses([]);
      }
    }
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  useEffect(() => {
    async function loadAssignments() {
      if (!classId) return;
      setStatus("loading");
      setPublishError(null);
      setDeleteError(null);
      try {
        const typeQuery = type === "hw" || type === "cw" ? `?type=${type}` : "";
        const res = await httpFetch(`/api/classes/${classId}/assignments${typeQuery}`);
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const data = await res.json();
        setAssignments(Array.isArray(data) ? data : []);
        setStatus("loaded");
      } catch {
        setStatus("error");
      }
    }
    loadAssignments();
  }, [classId, type]);

  async function deleteAssignment(a) {
    const assignmentId = a?.id;
    if (!assignmentId) return;

    if (String(a?.title || "").toLowerCase().includes("demo")) {
      window.alert("This cannot be deleted - its for demo");
      return;
    }

    if (String(a?.status) === "published") {
      const typed = window.prompt(
        "This assignment is published. Type DELETE to confirm deletion. This cannot be undone."
      );
      if (typed !== "DELETE") return;
    } else {
      const ok = window.confirm("Are you sure you want to delete this assignment? This cannot be undone.");
      if (!ok) return;
    }

    setDeletingId(assignmentId);
    setDeleteError(null);
    try {
      const res = await httpFetch(`/api/assignments/${assignmentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        const msg = ct.includes("application/json")
          ? (await res.json().catch(() => null))?.error
          : await res.text().catch(() => "");
        setDeleteError(msg || "Failed to delete assignment.");
        return;
      }

      // Reload list.
      const typeQuery = type === "hw" || type === "cw" ? `?type=${type}` : "";
      const listRes = await httpFetch(`/api/classes/${classId}/assignments${typeQuery}`);
      if (listRes.ok) {
        const data = await listRes.json();
        setAssignments(Array.isArray(data) ? data : []);
      }
    } catch {
      setDeleteError("Failed to delete assignment.");
    } finally {
      setDeletingId(null);
    }
  }

  async function publishAssignment(assignmentId) {
    if (!assignmentId) return;
    setPublishingId(assignmentId);
    setPublishError(null);
    try {
      const res = await httpFetch(`/api/assignments/${assignmentId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setPublishError("Failed to publish assignment.");
        return;
      }

      // Reload to pick up updated status + recipient/submission counts.
      const typeQuery = type === "hw" || type === "cw" ? `?type=${type}` : "";
      const listRes = await httpFetch(`/api/classes/${classId}/assignments${typeQuery}`);
      if (listRes.ok) {
        const data = await listRes.json();
        setAssignments(Array.isArray(data) ? data : []);
      }
    } catch {
      setPublishError("Failed to publish assignment.");
    } finally {
      setPublishingId(null);
    }
  }

  const selectedClassLabel = useMemo(() => {
    const c = classes.find((x) => String(x.id) === String(classId));
    if (!c) return "";
    const subjects = Array.isArray(c.subjects) && c.subjects.length > 0 ? ` - ${c.subjects.join(", ")}` : "";
    return `${c.name}${subjects}`;
  }, [classes, classId]);

  function setParam(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
  }

  function statusBadge(statusValue) {
    const s = String(statusValue || "draft").toLowerCase();
    const isPublished = s === "published";
    const label = isPublished ? "Published" : s === "closed" ? "Closed" : "Draft";
    const className =
      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border " +
      (isPublished
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : s === "closed"
          ? "bg-gray-100 text-gray-700 border-gray-200"
          : "bg-amber-50 text-amber-700 border-amber-200");
    return <span className={className}>{label}</span>;
  }

  function canPublishAssignment(a) {
    if (!a) return false;
    if (String(a.status) === "published") return false;
    const count = Number(a.question_count ?? 0);
    return Number.isFinite(count) && count > 0;
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Assignments</h1>
          <p className="text-sm text-gray-600 mt-1">
            View homework and classwork by class.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
            onClick={() => navigate(`/teacher/assignments/new?type=hw${classId ? `&classId=${classId}` : ""}`)}
          >
            Create HW
          </button>
          <button
            className="px-3 py-2 rounded-md text-sm font-medium text-gray-900 bg-gray-100 hover:bg-gray-200"
            onClick={() => navigate(`/teacher/assignments/new?type=cw${classId ? `&classId=${classId}` : ""}`)}
          >
            Create CW
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <label className="text-sm text-gray-700">
            <span className="mr-2 font-medium">Class</span>
            <select
              value={classId}
              onChange={(e) => setParam("classId", e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              {classes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Type</span>
            {[
              { id: "all", label: "All" },
              { id: "hw", label: "HW" },
              { id: "cw", label: "CW" },
            ].map((t) => (
              <button
                key={t.id}
                className={
                  "px-3 py-1.5 rounded-md text-sm font-medium border " +
                  (type === t.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50")
                }
                onClick={() => setParam("type", t.id === "all" ? "all" : t.id)}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-500">{selectedClassLabel}</div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
          Assignment List
        </div>

        {publishError ? (
          <div className="px-4 py-3 border-b border-gray-100 text-sm text-red-600">{publishError}</div>
        ) : null}

        {deleteError ? (
          <div className="px-4 py-3 border-b border-gray-100 text-sm text-red-600">{deleteError}</div>
        ) : null}

        {status === "loading" && <div className="p-4 text-sm text-gray-600">Loading...</div>}
        {status === "error" && <div className="p-4 text-sm text-red-600">Failed to load assignments.</div>}

        {status === "loaded" && assignments.length === 0 && (
          <div className="p-4 text-sm text-gray-600">No assignments yet.</div>
        )}

        {status === "loaded" && assignments.length > 0 && (
          <div className="divide-y divide-gray-100">
            {assignments.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 flex items-start gap-2">
                    <span className="break-words">{a.title}</span>
                    {statusBadge(a.status)}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="mr-2">{a.type === "hw" ? "HW" : "CW"}</span>
                    {a.due_at ? <span className="mr-2">Due {formatDate(a.due_at)}</span> : null}
                    {a.scheduled_at ? <span className="mr-2">On {formatDate(a.scheduled_at)}</span> : null}
                    <span>
                      {Number(a.completed_count ?? 0)}/{Number(a.assigned_count ?? 0)} completed
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  {String(a.status) !== "published" ? (
                    <button
                      type="button"
                      className={
                        "text-sm font-medium px-3 py-1.5 rounded-md border " +
                        (publishingId === a.id || !canPublishAssignment(a)
                          ? "text-gray-400 bg-white border-gray-200 opacity-60 cursor-not-allowed"
                          : "text-white bg-gray-900 border-gray-900 hover:bg-gray-800")
                      }
                      disabled={publishingId === a.id || !canPublishAssignment(a)}
                      onClick={() => publishAssignment(a.id)}
                      title={!canPublishAssignment(a) ? "Add at least 1 question before publishing." : "Publish this draft"}
                    >
                      {publishingId === a.id ? "Publishing..." : "Publish"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={
                      "text-sm font-medium px-3 py-1.5 rounded-md border " +
                      (deletingId === a.id
                        ? "text-gray-400 bg-white border-gray-200 opacity-60 cursor-not-allowed"
                        : "text-red-700 bg-white border-red-200 hover:bg-red-50")
                    }
                    disabled={deletingId === a.id}
                    onClick={() => deleteAssignment(a)}
                    title="Delete this assignment"
                  >
                    {deletingId === a.id ? "Deleting..." : "Delete"}
                  </button>
                  <button
                    className="text-sm font-medium text-gray-900 hover:underline"
                    onClick={() => navigate(`/teacher/assignments/${a.id}?classId=${encodeURIComponent(classId)}`)}
                  >
                    Open Assignment
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
