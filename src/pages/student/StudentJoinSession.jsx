import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSocket } from '../../lib/realtime';

export default function StudentJoinSession() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [form, setForm] = useState({ sessionId: '', name: '' });
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => setError(String(err?.message || err));

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

  async function join(e) {
    e.preventDefault();
    setError(null);
    const socket = socketRef.current;
    if (!socket) return;

    const studentId = `s_${Math.random().toString(16).slice(2)}`;
    const payload = {
      sessionId: form.sessionId.trim(),
      studentId,
      name: form.name.trim(),
      timestamp: Date.now(),
    };

    const ack = await new Promise((resolve) => {
      socket.emit('student_join', payload, resolve);
    });

    if (!ack?.ok) {
      setError(ack?.error || 'Failed to join');
      return;
    }

    // Persist for the live worksheet page
    sessionStorage.setItem(
      `matheta:student:${payload.sessionId}`,
      JSON.stringify({ studentId: payload.studentId, name: payload.name })
    );

    navigate(`/student/session/${payload.sessionId}`);
  }

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Join Live Session</h1>
            <p className="text-sm text-gray-600 mt-1">Enter the session code and your name.</p>
          </div>
          <span
            className={`inline-flex items-center px-2 py-1 rounded border ${
              connected ? 'bg-green-50 text-green-800 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <form onSubmit={join} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Session code</span>
            <input
              value={form.sessionId}
              onChange={(e) => setForm((f) => ({ ...f, sessionId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              placeholder="paste session id"
              required
            />
          </label>

          <label className="block mt-4">
            <span className="block text-sm font-medium text-gray-700">Your name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. Student One"
              required
            />
          </label>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="mt-6">
            <button
              type="submit"
              disabled={!connected}
              className="inline-flex items-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
