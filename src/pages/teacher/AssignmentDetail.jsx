import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../lib/api";

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export default function AssignmentDetail() {
  const { assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get("classId") || "";
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  }, []);
  const teacherId = user?.id;

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [toggleStatus, setToggleStatus] = useState("idle");
  const [publishStatus, setPublishStatus] = useState("idle");
  const [deleteStatus, setDeleteStatus] = useState("idle");
  const [gradingModeStatus, setGradingModeStatus] = useState("idle");

  const [renameStatus, setRenameStatus] = useState("idle");
  const [renameTitle, setRenameTitle] = useState("");

  const id = useMemo(() => {
    const n = Number(assignmentId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [assignmentId]);

  useEffect(() => {
    async function load() {
      if (!id) {
        setStatus("error");
        setError("Missing assignment id");
        return;
      }
      setStatus("loading");
      setError(null);
      try {
        const res = await apiFetch(`/api/assignments/${id}`);
        if (!res.ok) {
          setStatus("error");
          setError("Failed to load assignment");
          return;
        }
        const data = await res.json();
        setAssignment(data.assignment || null);
        setRenameTitle(String(data.assignment?.title || ""));
        setQuestions(Array.isArray(data.questions) ? data.questions : []);

        // Optional: load submissions for marking.
        if (teacherId) {
          const sRes = await apiFetch(
            `/api/assignments/${id}/submissions?teacherId=${encodeURIComponent(String(teacherId))}`
          );
          if (sRes.ok) {
            const sData = await sRes.json();
            setSubmissions(Array.isArray(sData?.submissions) ? sData.submissions : []);
          } else {
            setSubmissions([]);
          }
        }

        setStatus("loaded");
      } catch {
        setStatus("error");
        setError("Failed to load assignment");
      }
    }
    load();
  }, [id, teacherId]);

  async function setGradingMode(mode) {
    if (!id) return;
    setGradingModeStatus("saving");
    setError(null);
    try {
      const res = await apiFetch(`/api/assignments/${id}/grading-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradingMode: mode }),
      });
      if (!res.ok) {
        setGradingModeStatus("error");
        setError("Failed to update grading mode");
        return;
      }
      const updated = await res.json();
      setAssignment((prev) => (prev ? { ...prev, grading_mode: updated?.grading_mode || mode } : prev));
      setGradingModeStatus("saved");
      setTimeout(() => setGradingModeStatus("idle"), 800);
    } catch {
      setGradingModeStatus("error");
      setError("Failed to update grading mode");
    }
  }

  async function publishAnswersToStudents() {
    if (!id) return;
    if (assignment?.answers_visible) return;
    const ok = window.confirm(
      "Publish answers to students? This cannot be undone in the UI."
    );
    if (!ok) return;

    setToggleStatus("saving");
    setError(null);
    try {
      const res = await apiFetch(`/api/assignments/${id}/answers-visible`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answersVisible: true }),
      });
      if (!res.ok) {
        setToggleStatus("error");
        setError("Failed to update answer visibility");
        return;
      }
      const updated = await res.json();
      setAssignment(updated);
      setToggleStatus("saved");
    } catch {
      setToggleStatus("error");
      setError("Failed to update answer visibility");
    }
  }

  async function publish() {
    if (!id) return;
    setPublishStatus("saving");
    setError(null);
    try {
      const res = await apiFetch(`/api/assignments/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setPublishStatus("error");
        setError("Failed to publish assignment");
        return;
      }
      const updated = await res.json();
      setAssignment(updated);
      setPublishStatus("saved");
    } catch {
      setPublishStatus("error");
      setError("Failed to publish assignment");
    }
  }

  const canPublish = useMemo(() => {
    if (String(assignment?.status) === "published") return false;
    return Array.isArray(questions) && questions.length > 0;
  }, [assignment?.status, questions]);

  async function deleteThis() {
    if (!id) return;

    if (String(assignment?.title || "").toLowerCase().includes("demo")) {
      setDeleteStatus("error");
      setError("This cannot be deleted - its for demo");
      return;
    }

    if (String(assignment?.status) === "published") {
      const typed = window.prompt(
        "This assignment is published. Type DELETE to confirm deletion. This cannot be undone."
      );
      if (typed !== "DELETE") return;
    } else {
      const ok = window.confirm("Are you sure you want to delete this assignment? This cannot be undone.");
      if (!ok) return;
    }

    setDeleteStatus("saving");
    setError(null);
    try {
      const res = await apiFetch(`/api/assignments/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setDeleteStatus("error");
        setError("Failed to delete assignment");
        return;
      }
      setDeleteStatus("saved");
      navigate(`/teacher/assignments${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`, { replace: true });
    } catch {
      setDeleteStatus("error");
      setError("Failed to delete assignment");
    }
  }

  async function rename() {
    if (!id) return;
    if (!teacherId) return;
    const next = String(renameTitle || "").trim();
    if (!next) {
      setError("Title cannot be empty");
      return;
    }

    setRenameStatus("saving");
    setError(null);
    try {
      const res = await apiFetch(`/api/assignments/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, title: next }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setRenameStatus("error");
        setError(t || "Failed to rename assignment");
        return;
      }
      const json = await res.json().catch(() => null);
      const updatedTitle = json?.assignment?.title || next;
      setAssignment((prev) => (prev ? { ...prev, title: updatedTitle } : prev));
      setRenameTitle(String(updatedTitle));
      setRenameStatus("saved");
      setTimeout(() => setRenameStatus("idle"), 800);
    } catch {
      setRenameStatus("error");
      setError("Failed to rename assignment");
    }
  }

  if (status === "loading") {
    return <div className="text-sm text-gray-600">Loading...</div>;
  }

  if (status === "error") {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Assignment</h1>
          <button className="text-sm font-medium text-gray-900 hover:underline" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
        <div className="text-sm text-red-600">{error || "Something went wrong."}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{assignment?.title || "Assignment"}</h1>
          <div className="text-xs text-gray-600 mt-1">
            <span className="mr-2">{assignment?.type === "cw" ? "CW" : "HW"}</span>
            {assignment?.due_at ? <span className="mr-2">Due {formatDate(assignment.due_at)}</span> : null}
            {assignment?.scheduled_at ? <span className="mr-2">On {formatDate(assignment.scheduled_at)}</span> : null}
            <span className="mr-2">{assignment?.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {String(assignment?.status) !== "published" ? (
            <button
              type="button"
              className={
                "px-3 py-2 rounded-md text-sm font-medium " +
                (publishStatus === "saving" || !canPublish
                  ? "text-white bg-gray-400 opacity-70 cursor-not-allowed"
                  : "text-white bg-gray-900 hover:bg-gray-800")
              }
              onClick={publish}
              disabled={publishStatus === "saving" || !canPublish}
              title={!canPublish ? "Add at least 1 saved question before publishing." : "Publish this assignment"}
            >
              {publishStatus === "saving" ? "Publishing..." : "Publish"}
            </button>
          ) : null}
          <button
            type="button"
            className={
              "px-3 py-2 rounded-md text-sm font-medium border " +
              (deleteStatus === "saving"
                ? "text-gray-400 bg-white border-gray-200 opacity-60 cursor-not-allowed"
                : "text-red-700 bg-white border-red-200 hover:bg-red-50")
            }
            onClick={deleteThis}
            disabled={deleteStatus === "saving"}
            title="Delete this assignment"
          >
            {deleteStatus === "saving" ? "Deleting..." : "Delete"}
          </button>
          <button
            type="button"
            className={
              "px-3 py-2 rounded-md text-sm font-medium border " +
              (assignment?.answers_visible
                ? "text-white bg-gray-900 border-gray-900 hover:bg-gray-800"
                : "text-gray-900 bg-white border-gray-200 hover:bg-gray-50")
            }
            onClick={publishAnswersToStudents}
            disabled={toggleStatus === "saving" || Boolean(assignment?.answers_visible)}
            title={
              assignment?.answers_visible
                ? "Answers are published to students"
                : "Publish answers to students"
            }
          >
            {toggleStatus === "saving"
              ? "Saving..."
              : assignment?.answers_visible
                ? "Answers: Published to Students"
                : "Answers: Publish to Students"}
          </button>
          <button
            className="text-sm font-medium text-gray-900 hover:underline"
            onClick={() => navigate(`/teacher/assignments${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`)}
          >
            View list
          </button>
          <button className="text-sm font-medium text-gray-900 hover:underline" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>

      {assignment?.description ? (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="text-xs font-semibold text-gray-700">Description</div>
          <div className="text-sm text-gray-900 whitespace-pre-wrap mt-2">{assignment.description}</div>
        </div>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="text-xs font-semibold text-gray-700">Rename</div>
        <div className="text-sm text-gray-600 mt-1">Update the assignment title (teacher only).</div>
        <div className="mt-3 flex flex-col md:flex-row gap-2 md:items-center">
          <input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="Assignment title"
          />
          <button
            type="button"
            onClick={rename}
            disabled={!teacherId || renameStatus === "saving"}
            className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
          >
            {renameStatus === "saving" ? "Saving..." : renameStatus === "saved" ? "Saved" : "Rename"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-700">Marking mode</div>
            <div className="text-sm text-gray-600 mt-1">
              Choose whether this assignment is marked automatically (final answers) or manually by the teacher.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={
                "px-3 py-2 rounded-md text-sm font-medium border " +
                (String(assignment?.grading_mode) === "auto"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50")
              }
              onClick={() => setGradingMode("auto")}
              disabled={gradingModeStatus === "saving"}
            >
              Auto
            </button>
            <button
              type="button"
              className={
                "px-3 py-2 rounded-md text-sm font-medium border " +
                (String(assignment?.grading_mode) === "manual"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50")
              }
              onClick={() => setGradingMode("manual")}
              disabled={gradingModeStatus === "saving"}
            >
              Manual
            </button>
          </div>
        </div>

        {gradingModeStatus === "saving" ? (
          <div className="mt-2 text-xs text-gray-500">Saving...</div>
        ) : gradingModeStatus === "saved" ? (
          <div className="mt-2 text-xs text-emerald-700">Saved.</div>
        ) : gradingModeStatus === "error" ? (
          <div className="mt-2 text-xs text-red-700">Failed to save.</div>
        ) : null}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Submissions</div>
        {submissions.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No submissions yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {submissions.map((s) => (
              <div key={String(s.id)} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{s.student_name || `Student ${s.student_id}`}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="mr-2">Status: {s.status || ""}</span>
                    {s.submitted_at ? <span className="mr-2">Submitted {new Date(s.submitted_at).toLocaleString()}</span> : null}
                    {s.score !== null && s.score !== undefined ? (
                      <span>Score: {Number(s.score)} / {Number(s.max_score || 0)}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
                    onClick={() => navigate(`/teacher/submissions/${s.id}?assignmentId=${encodeURIComponent(String(id))}`)}
                  >
                    Mark
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Questions</div>
        {questions.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No questions saved for this assignment yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {questions.map((q, idx) => (
              <div key={q.id ?? idx} className="p-4">
                <div className="text-sm font-semibold text-gray-900">Q{idx + 1}</div>
                {q.domain_name || q.topic_name ? (
                  <div className="text-xs text-gray-600 mt-1">
                    {q.domain_name ? <span className="mr-2">{q.domain_name}</span> : null}
                    {q.topic_name ? <span className="mr-2">{q.topic_name}</span> : null}
                    {q.difficulty ? <span className="mr-2">{q.difficulty}</span> : null}
                  </div>
                ) : null}
                {(q.image_data_url || q.image_url) ? (
                  <div className="mt-3">
                    <img
                      src={q.image_data_url || q.image_url}
                      alt="Question diagram"
                      className="max-w-full rounded-md border border-gray-200"
                    />
                  </div>
                ) : null}
                <div className="text-sm text-gray-900 whitespace-pre-wrap mt-2">{q.prompt}</div>
                <div className="text-xs text-gray-500 mt-2">
                  <span className="mr-2">{q.question_type}</span>
                  {q.points !== undefined && q.points !== null ? <span className="mr-2">{q.points} pts</span> : null}
                </div>
                {q.correct_answer ? (
                  <div className="mt-3 rounded-md bg-gray-50 border border-gray-200 p-3">
                    <div className="text-xs font-semibold text-gray-700">Answer</div>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap mt-1">{q.correct_answer}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
