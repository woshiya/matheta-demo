import { io } from 'socket.io-client';
import { API_BASE_URL } from './api';

// Keep socket URL separate from REST API base.
export const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_BASE_URL ||
  API_BASE_URL ||
  'http://localhost:5000';

export function createSocket() {
  return io(SOCKET_BASE_URL, {
    // Do not force websocket only; allow polling fallback for stability.
    autoConnect: true,
  });
}
