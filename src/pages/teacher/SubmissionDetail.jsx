import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../lib/api";

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function badge(label, tone) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border";
  const color =
    tone === "green"
      ? " bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "blue"
        ? " bg-blue-50 text-blue-700 border-blue-200"
        : tone === "red"
          ? " bg-red-50 text-red-700 border-red-200"
          : " bg-gray-100 text-gray-700 border-gray-200";
  return <span className={base + color}>{label}</span>;
}

export default function SubmissionDetail() {
  const { submissionId } = useParams();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("assignmentId") || "";

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const user = useMemo(() => safeParseJson(localStorage.getItem("user")), []);
  const teacherId = user?.id;

  const id = useMemo(() => {
    const n = Number(submissionId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [submissionId]);

  async function load() {
    if (!teacherId) {
      setStatus("error");
      setError("Missing teacher login");
      return;
    }
    if (!id) {
      setStatus("error");
      setError("Missing submission id");
      return;
    }

    setStatus("loading");
    setError(null);
    try {
      const res = await apiFetch(`/api/submissions/${id}?teacherId=${encodeURIComponent(String(teacherId))}`);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to load submission");
      }
      const json = await res.json();
      setData(json);
      setStatus("loaded");
    } catch (err) {
      setStatus("error");
      setError(String(err?.message || err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, teacherId]);

  async function saveGrade(questionId, maxPoints, pointsAwarded, feedback) {
    if (!teacherId || !id) return;
    const key = `${id}:${questionId}`;
    setSavingKey(key);
    setSaveError(null);
    try {
      const res = await apiFetch(`/api/submissions/${id}/questions/${questionId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId,
          pointsAwarded,
          feedback,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to save grade");
      }

      // Reload to reflect updated totals.
      await load();
    } catch (err) {
      setSaveError(String(err?.message || err));
    } finally {
      setSavingKey(null);
    }
  }

  if (status === "loading") {
    return <div className="text-sm text-gray-600">Loading...</div>;
  }

  if (status === "error") {
    return (
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Mark Submission</h1>
          <Link
            className="text-sm font-medium text-gray-900 hover:underline"
            to={assignmentId ? `/teacher/assignments/${assignmentId}` : "/teacher/assignments"}
          >
            Back
          </Link>
        </div>
        <div className="text-sm text-red-600">{error || "Something went wrong."}</div>
      </div>
    );
  }

  const submission = data?.submission || null;
  const answers = Array.isArray(data?.answers) ? data.answers : [];
  const gradingMode = String(submission?.grading_mode || "manual");

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mark Submission</h1>
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            {gradingMode === "manual" ? badge("Manual marking", "blue") : badge("Auto marking", "green")}
            {submission?.status ? badge(`Status: ${submission.status}`, "gray") : null}
            {submission?.score !== null && submission?.score !== undefined ? (
              <span className="text-xs text-gray-600">Score: {Number(submission.score)} / {Number(submission.max_score || 0)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50"
            to={assignmentId ? `/teacher/assignments/${assignmentId}` : "/teacher/assignments"}
          >
            Back
          </Link>
        </div>
      </div>

      {saveError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>
      ) : null}

      <div className="space-y-4">
        {answers.map((a, idx) => {
          const questionId = a.question_id;
          const maxPoints = Number(a.max_points ?? 1);
          const currentPts = a.teacher_points_awarded !== null && a.teacher_points_awarded !== undefined
            ? Number(a.teacher_points_awarded)
            : a.points_awarded !== null && a.points_awarded !== undefined
              ? Number(a.points_awarded)
              : null;

          const key = `${id}:${questionId}`;
          const saving = savingKey === key;

          return (
            <QuestionMarkCard
              key={String(questionId ?? idx)}
              index={idx}
              prompt={a.prompt}
              workings={a.workings}
              finalAnswer={a.final_answer}
              expectedAnswer={a.correct_answer}
              isCorrect={a.is_correct}
              maxPoints={maxPoints}
              initialPoints={currentPts}
              initialFeedback={a.teacher_feedback || ""}
              mode={gradingMode}
              saving={saving}
              onSave={(pointsAwarded, feedback) => saveGrade(questionId, maxPoints, pointsAwarded, feedback)}
            />
          );
        })}

        {answers.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
            No answers found for this submission yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QuestionMarkCard({
  index,
  prompt,
  workings,
  finalAnswer,
  expectedAnswer,
  isCorrect,
  maxPoints,
  initialPoints,
  initialFeedback,
  mode,
  saving,
  onSave,
}) {
  const [pointsAwarded, setPointsAwarded] = useState(initialPoints);
  const [feedback, setFeedback] = useState(initialFeedback);

  useEffect(() => {
    setPointsAwarded(initialPoints);
  }, [initialPoints]);

  useEffect(() => {
    setFeedback(initialFeedback);
  }, [initialFeedback]);

  const badgeEl =
    mode === "manual"
      ? badge("Manual", "blue")
      : isCorrect === true
        ? badge("Correct", "green")
        : isCorrect === false
          ? badge("Wrong", "red")
          : badge("Not marked", "gray");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Q{index + 1}. {prompt}</div>
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            {badgeEl}
            <span className="text-xs text-gray-600">Max points: {maxPoints}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-gray-700">Student workings</div>
          <pre className="mt-2 w-full min-h-[160px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap">
            {workings || "(no workings)"}
          </pre>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-700">Final answer</div>
          <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
            {finalAnswer || "(blank)"}
          </div>

          {expectedAnswer !== null && expectedAnswer !== undefined ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-700">Expected answer (teacher only)</div>
              <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                {String(expectedAnswer)}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold text-gray-700">Points awarded</div>
              <input
                value={pointsAwarded === null || pointsAwarded === undefined ? "" : String(pointsAwarded)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v.trim()) {
                    setPointsAwarded(null);
                    return;
                  }
                  const n = Number(v);
                  setPointsAwarded(Number.isFinite(n) ? n : null);
                }}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder={`0 - ${maxPoints}`}
                disabled={saving}
              />
            </div>
            <div className="flex items-end">
              <button
                className="w-full rounded-lg bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                onClick={() => onSave(pointsAwarded, feedback)}
                disabled={saving}
                type="button"
              >
                {saving ? "Saving..." : "Save mark"}
              </button>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-700">Teacher feedback</div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="mt-2 w-full min-h-[90px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              placeholder="Write feedback for the student..."
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
