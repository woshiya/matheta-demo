import React, { useEffect, useMemo, useState } from 'react';
import { httpFetch } from '../../lib/http';

function safeString(x) {
  if (x === null || x === undefined) return '';
  return String(x);
}

export default function LiveSessionAssignmentTab({
  assignmentId,
  onEndSession,
  variant = 'page', // page | embedded
  pacingMode = 'student_paced',
  currentQuestionIndex = 0,
  onBlackboardChange,
  blackboard,
}) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [workingText, setWorkingText] = useState('');

  useEffect(() => {
    async function load() {
      if (!assignmentId) {
        setStatus('error');
        setError('Missing assignmentId');
        return;
      }
      setStatus('loading');
      setError(null);
      try {
        const res = await httpFetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) throw new Error('Failed to load assignment');
        const json = await res.json();
        setData(json);
        setStatus('loaded');
      } catch (err) {
        setStatus('error');
        setError(String(err?.message || err));
      }
    }
    load();
  }, [assignmentId]);

  if (status === 'loading') {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-sm text-gray-600">Loading assignment...</div>;
  }
  if (status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm text-sm text-red-800">
        {error || 'Failed to load assignment'}
      </div>
    );
  }

  const assignment = data?.assignment;
  const questions = Array.isArray(data?.questions) ? data.questions : [];

  const isTeacherLed = String(pacingMode) === 'teacher_led';
  const idx = Math.max(0, Math.min(questions.length - 1, Number(currentQuestionIndex) || 0));
  const current = questions[idx] || null;

  // Keep local UI in sync with the session's blackboard state.
  useEffect(() => {
    if (!isTeacherLed) return;
    setShowAnswer(Boolean(blackboard?.showAnswer));
    setWorkingText(safeString(blackboard?.workingText));
  }, [isTeacherLed, blackboard?.showAnswer, blackboard?.workingText]);

  const currentPrompt = useMemo(() => safeString(current?.prompt), [current?.prompt]);
  const currentAnswer = useMemo(() => safeString(current?.correct_answer), [current?.correct_answer]);
  const currentSolution = useMemo(() => safeString(current?.solution_text), [current?.solution_text]);

  const isEmbedded = String(variant) === 'embedded';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-gray-900">{assignment?.title || 'Assignment'}</div>
          {isEmbedded ? null : (
            <div className="text-xs text-gray-500 mt-1">Teacher view: shows prompts + correct answers.</div>
          )}
        </div>
        {!isEmbedded && onEndSession ? (
          <button
            onClick={onEndSession}
            className="rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-medium hover:bg-red-700"
          >
            End Live Session
          </button>
        ) : null}
      </div>

      {isTeacherLed ? (
        <div className="mt-6 grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4">
            {current ? (
              <>
                <div className="text-xs text-gray-500">Current question</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">Q{idx + 1}. {currentPrompt}</div>

                <div className="mt-3 flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={showAnswer}
                      onChange={(e) => {
                        const next = Boolean(e.target.checked);
                        setShowAnswer(next);
                        onBlackboardChange?.({
                          questionId: String(current.id),
                          showAnswer: next,
                          workingText,
                        });
                      }}
                    />
                    Show answer
                  </label>
                </div>

                {showAnswer ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs font-semibold text-emerald-900">Answer</div>
                    <div className="mt-1 text-sm text-emerald-900 whitespace-pre-wrap">{currentAnswer || 'No answer provided.'}</div>
                    {currentSolution ? (
                      <>
                        <div className="mt-3 text-xs font-semibold text-emerald-900">Working</div>
                        <div className="mt-1 text-sm text-emerald-900 whitespace-pre-wrap">{currentSolution}</div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-gray-600">No questions.</div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Blackboard</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">Teacher working</div>
            <textarea
              value={workingText}
              onChange={(e) => {
                const next = e.target.value;
                setWorkingText(next);
                if (current) {
                  onBlackboardChange?.({
                    questionId: String(current.id),
                    showAnswer,
                    workingText: next,
                  });
                }
              }}
              placeholder="Type your working here (will show to students like a blackboard)"
              className="mt-3 w-full min-h-[220px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
            />
            <div className="mt-2 text-xs text-gray-500">Tip: keep it short and step-by-step.</div>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {questions.length === 0 ? (
            <div className="text-sm text-gray-600">No questions.</div>
          ) : (
            questions.map((q, idx) => (
              <div key={q.id} className="rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Q{idx + 1}. {q.prompt}</div>
                <div className="mt-2 text-sm text-gray-700">
                  <span className="text-gray-500">Answer:</span> {q.correct_answer ?? 'Hidden'}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
