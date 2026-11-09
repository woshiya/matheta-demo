// Default: demo mode (no backend) so the site can be hosted as static-only (e.g. Netlify).
// If you later deploy a backend, set VITE_API_BASE_URL to point at it.
import { httpFetch } from './http';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// Back-compat for existing code in this repo.
// Prefer using `httpFetch()` in new code.

export async function apiFetch(path, options) {
  return httpFetch(path, options);
}
