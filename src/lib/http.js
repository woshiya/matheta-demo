import { API_BASE_URL } from './api';
import { demoFetch } from './demoApi';

// One place to route HTTP calls.
// If no backend is configured, we fall back to a deterministic read-only demo API.
export async function httpFetch(path, options) {
  if (!API_BASE_URL) {
    return demoFetch(path, options);
  }
  return fetch(`${API_BASE_URL}${path}`, options);
}
