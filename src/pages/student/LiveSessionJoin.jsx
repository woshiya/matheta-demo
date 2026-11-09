import React, { useEffect, useRef, useState } from 'react';
import { createSocket } from '../../lib/realtime';

function buildStudentId(user) {
  // Your login returns { id, role }.
  // Student role uses numeric ids; we normalize to string.
  if (user?.id !== undefined && user?.id !== null) return String(user.id);
  // Fallback id (not expected if login is used)
  return `student_${Math.random().toString(16).slice(2)}`;
}

export default function LiveSessionJoin() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [joinedSessionId, setJoinedSessionId] = useState(null);
  const [status, setStatus] = useState({ error: null, info: null });

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => setStatus((s) => ({ ...s, error: String(err?.message || err) }));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.disconnect();
    };
  }, []);

  async function joinSession(e) {
    e.preventDefault();
    setStatus({ error: null, info: null });

    const socket = socketRef.current;
    if (!socket) return;

    const user = JSON.parse(localStorage.getItem('user'));
    const studentId = buildStudentId(user);

    const res = await new Promise((resolve) => {
      socket.emit(
        'student_join',
        { sessionId, studentId, timestamp: Date.now() },
        resolve
      );
    });

    if (!res?.ok) {
      setStatus({ error: res?.error || 'Failed to join session', info: null });
      return;
    }

    setJoinedSessionId(sessionId);
    setStatus({ error: null, info: 'Joined session. Sending activity heartbeat every 20 seconds.' });
  }

  // Heartbeat
  useEffect(() => {
    if (!joinedSessionId) return;
    const socket = socketRef.current;
    const user = JSON.parse(localStorage.getItem('user'));
    const studentId = buildStudentId(user);

    const t = setInterval(() => {
      socket?.emit('student_activity', {
        sessionId: joinedSessionId,
        studentId,
        timestamp: Date.now(),
      });
    }, 20_000);
    return () => clearInterval(t);
  }, [joinedSessionId]);

  function sendWrongAttempt() {
    const socket = socketRef.current;
    const user = JSON.parse(localStorage.getItem('user'));
    const studentId = buildStudentId(user);
    socket?.emit('student_wrong_attempt', {
      sessionId: joinedSessionId,
      studentId,
      questionId: 1,
      timestamp: Date.now(),
    });
  }

  function sendCorrect() {
    const socket = socketRef.current;
    const user = JSON.parse(localStorage.getItem('user'));
    const studentId = buildStudentId(user);
    socket?.emit('student_answered', {
      sessionId: joinedSessionId,
      studentId,
      questionId: 1,
      timestamp: Date.now(),
    });
  }

  function raiseHand() {
    const socket = socketRef.current;
    const user = JSON.parse(localStorage.getItem('user'));
    const studentId = buildStudentId(user);
    socket?.emit('student_raised_hand', {
      sessionId: joinedSessionId,
      studentId,
      timestamp: Date.now(),
    });
  }

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Join Live Session</h1>
            <p className="text-sm text-gray-600 mt-1">Enter the session ID provided by your teacher.</p>
          </div>
          <span
            className={`inline-flex items-center px-2 py-1 rounded border ${
              connected ? 'bg-green-50 text-green-800 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            {connected ? 'Socket connected' : 'Socket disconnected'}
          </span>
        </div>

        <form onSubmit={joinSession} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Session ID</span>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              placeholder="paste session id"
              required
            />
          </label>

          {status.error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {status.error}
            </div>
          )}
          {status.info && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {status.info}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="submit"
              disabled={!connected}
              className="inline-flex items-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Join
            </button>
            {joinedSessionId && (
              <span className="text-xs text-gray-600">Joined: <span className="font-mono">{joinedSessionId}</span></span>
            )}
          </div>
        </form>

        {joinedSessionId && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Student Actions</h2>
            <p className="text-xs text-gray-500 mt-1">
              These buttons send events to the server. Only the teacher sees the aggregated updates.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={sendWrongAttempt} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
                Wrong Attempt (Q1)
              </button>
              <button onClick={sendCorrect} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
                Correct Answer (Q1)
              </button>
              <button onClick={raiseHand} className="rounded-lg bg-amber-500 text-white px-3 py-2 text-sm hover:bg-amber-600">
                Raise Hand
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
