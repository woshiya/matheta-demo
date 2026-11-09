import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

import { DIAGNOSTIC_QUESTIONS } from "../lib/diagnosticQuestions";

const questions = DIAGNOSTIC_QUESTIONS;

function DiagnosticTest({ onFinish, classId: classIdProp, sessionId: sessionIdProp }) {
  const navigate = useNavigate();
  const params = useParams();
  const outletCtx = useOutletContext?.() || {};
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  })();

  const classId = classIdProp || params.classId || outletCtx.classId || null;
  const sessionId = sessionIdProp || params.sessionId || outletCtx.sessionId || null;

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [sessionState, setSessionState] = useState({ status: "loading", ended: false, error: null });

  // Poll session status so students get kicked out when teacher ends the test.
  // We poll the active-session endpoint so this works even if the server doesn't expose
  // a direct GET by session id.
  useEffect(() => {
    if (!classId || !sessionId) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await apiFetch(
          `/api/classes/${encodeURIComponent(classId)}/diagnostic-sessions/active`
        );
        if (!res.ok) throw new Error("Failed to fetch active session");
        const data = await res.json();
        const s = data?.session || null;
        const ended = !s || String(s.id) !== String(sessionId);
        if (!cancelled) {
          setSessionState({ status: "loaded", ended, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          // If we can't confirm, don't kick the student out.
          setSessionState({ status: "error", ended: false, error: String(err?.message || err) });
        }
      }
    }

    tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [classId, sessionId]);

  // When teacher ends the test, force the "Test Ended" view.
  useEffect(() => {
    if (sessionState.ended && !finished) {
      // Keep the student's progress, but stop the test UI.
      // They'll be able to compute/submit results from the ended screen.
      setFinished(false);
    }
  }, [sessionState.ended, finished]);

  // Create/resume attempt on mount for session-based diagnostics.
  useEffect(() => {
    if (!classId || !sessionId || !user?.id) return;
    let cancelled = false;
    async function ensureAttempt() {
      try {
        const res = await apiFetch(
          `/api/classes/${encodeURIComponent(classId)}/diagnostic-sessions/${encodeURIComponent(sessionId)}/attempts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: user.id }),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAttemptId(data?.attempt?.id || null);
      } catch {
        // ignore
      }
    }
    ensureAttempt();
    return () => {
      cancelled = true;
    };
  }, [classId, sessionId, user?.id]);

  const handleSelect = (option) => {
    setAnswers({ ...answers, [current]: option });
  };

  // Persist each answer (best-effort) so teacher can see partial results if ended.
  useEffect(() => {
    if (!classId || !sessionId || !attemptId || !user?.id) return;
    const q = questions[current];
    const selected = answers[current];
    if (!q || selected === undefined) return;

    apiFetch(
      `/api/classes/${encodeURIComponent(classId)}/diagnostic-sessions/${encodeURIComponent(sessionId)}/attempts/${encodeURIComponent(
        attemptId
      )}/answer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: user.id,
          questionId: q.id,
          selectedOption: selected,
        }),
      }
    ).catch(() => {
      // ignore
    });
  }, [answers, attemptId, classId, current, sessionId, user?.id]);

  async function calculateResults() {
    const domainScores = {};

    questions.forEach((q, index) => {
      if (!domainScores[q.domain]) {
        domainScores[q.domain] = { correct: 0, total: 0 };
      }

      domainScores[q.domain].total += 1;

      if (answers[index] === q.answer) {
        domainScores[q.domain].correct += 1;
      }
    });

    const percentages = {};
    Object.keys(domainScores).forEach((domain) => {
      percentages[domain] = Math.round(
        (domainScores[domain].correct / domainScores[domain].total) * 100
      );
    });

    setResults(percentages);
    setFinished(true);

    if (onFinish) onFinish(percentages);

    // Session-based submit (only if launched via class/session routes)
    if (classId && sessionId && user?.id) {
      setSaving(true);
      setSaveError(null);
      try {
        const effectiveAttemptId = attemptId;
        if (!effectiveAttemptId) throw new Error("Missing attempt id");

        // 2) Submit (backend computes authoritative scores)
        const submitRes = await apiFetch(
          `/api/classes/${encodeURIComponent(classId)}/diagnostic-sessions/${encodeURIComponent(sessionId)}/attempts/${encodeURIComponent(
            effectiveAttemptId
          )}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: user.id,
              // Keep sending these for now, but backend will recompute and store authoritative values.
              domainScores: Object.entries(domainScores).map(([domainKey, v]) => ({
                domainKey,
                correct: v.correct,
                total: v.total,
                percent: Math.round((v.correct / v.total) * 100),
              })),
            }),
          }
        );
        if (!submitRes.ok) throw new Error("Failed to submit attempt");
      } catch (err) {
        setSaveError(String(err?.message || err));
      } finally {
        setSaving(false);
      }
    }
  };

  if (finished) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Diagnostic Results</h1>
        {saving ? (
          <p className="text-sm text-gray-600 mb-2">Saving your results...</p>
        ) : saveError ? (
          <p className="text-sm text-red-600 mb-2">{saveError}</p>
        ) : null}
        {Object.entries(results).map(([domain, score]) => (
          <p key={domain} className="mb-2">
            {domain}: <strong>{score}%</strong>
          </p>
        ))}

        {classId ? (
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-gray-900 text-white rounded"
          >
            Back
          </button>
        ) : null}
      </div>
    );
  }

  if (classId && sessionId && sessionState.ended) {
    return (
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        <div className="max-w-xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-2xl font-semibold text-gray-900">Test Ended</h1>
          <p className="text-sm text-gray-600 mt-2">
            Your teacher ended the test.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => calculateResults()}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
            >
              See Your Results
            </button>
            <button
              onClick={() => navigate("/student/diagnostic/setup")}
              className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[current];

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <h2 className="text-xl font-semibold mb-4">
        Question {current + 1} of {questions.length}
      </h2>

      <div className="bg-white p-6 rounded shadow mb-4">
        <p className="mb-4">{question.question}</p>

        {question.options.map((option) => (
          <button
            key={option}
            onClick={() => handleSelect(option)}
            className={`block w-full text-left p-2 mb-2 rounded border ${
              answers[current] === option
                ? "bg-blue-100 border-blue-500"
                : "hover:bg-gray-100"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          disabled={current === 0}
          onClick={() => setCurrent(current - 1)}
          className="px-4 py-2 bg-gray-300 rounded"
        >
          Previous
        </button>

        {current < questions.length - 1 ? (
          <button
            onClick={() => setCurrent(current + 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Next
          </button>
        ) : (
          <button
            onClick={calculateResults}
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}

export default DiagnosticTest;
