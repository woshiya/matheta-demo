import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createSocket } from '../../lib/realtime';

export default function LiveSessionSummary() {
  const { sessionId } = useParams();
  const socketRef = useRef(null);
  const [update, setUpdate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onSessionUpdate = (payload) => {
      if (payload?.sessionId !== sessionId) return;
      setUpdate(payload);
    };
    socket.on('session_update', onSessionUpdate);

    // Join to fetch final snapshot even if session already ended.
    const user = JSON.parse(localStorage.getItem('user'));
    socket.emit(
      'teacher_join_session',
      { sessionId, teacherId: user?.id, timestamp: Date.now() },
      (ack) => {
        if (!ack?.ok) setError(ack?.error || 'Failed to load session summary');
      }
    );

    return () => {
      socket.off('session_update', onSessionUpdate);
      socket.disconnect();
    };
  }, [sessionId]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Session Summary</h1>
          <p className="text-sm text-gray-600 mt-1">
            Aggregated snapshot for session <span className="font-mono text-xs">{sessionId}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/teacher/live/reports/${sessionId}`}
            className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm hover:bg-gray-800"
          >
            View Report
          </Link>
          <Link
            to="/teacher/live"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Start New Session
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {!update ? (
          <div className="text-sm text-gray-500">Loading summary...</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-gray-500">Status</div>
              <div className="text-lg font-semibold text-gray-900">{update.status}</div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs text-gray-500">Active Students</div>
                  <div className="text-xl font-semibold">{update.activeStudents}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs text-gray-500">Raised Hands</div>
                  <div className="text-xl font-semibold">{update.raisedHandCount}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs text-gray-500">Struggling</div>
                  <div className="text-xl font-semibold">{update.strugglingCount}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs text-gray-500">Inactive</div>
                  <div className="text-xl font-semibold">{update.inactiveCount}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-900">Difficult Questions</div>
              <div className="mt-3">
                {(update.lowAccuracyQuestions || []).length === 0 ? (
                  <div className="text-sm text-gray-500">None flagged.</div>
                ) : (
                  <div className="space-y-2">
                    {(update.lowAccuracyQuestions || []).map((q) => (
                      <div key={q.questionId} className="flex items-center justify-between text-sm">
                        <div className="text-gray-800">Question {q.questionId}</div>
                        <div className="font-medium text-amber-700">{q.accuracy}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 text-sm font-semibold text-gray-900">Question Stats</div>
              <div className="mt-3">
                {(update.questionStats || []).length === 0 ? (
                  <div className="text-sm text-gray-500">No attempts recorded.</div>
                ) : (
                  <div className="space-y-2">
                    {(update.questionStats || []).map((q) => (
                      <div key={q.questionId} className="grid grid-cols-4 gap-2 text-sm">
                        <div className="text-gray-800">Q{q.questionId}</div>
                        <div className="text-gray-600">A: {q.attempts}</div>
                        <div className="text-gray-600">C: {q.correct}</div>
                        <div className="font-medium text-gray-900">{q.accuracy}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
