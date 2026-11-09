function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function uid() {
  return `at_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function auditKey(scope) {
  const s = String(scope || 'global');
  return `matheta:auditTrail:${s}`;
}

export function listAuditEntries(scope) {
  const raw = localStorage.getItem(auditKey(scope));
  const parsed = safeJsonParse(raw);
  const list = Array.isArray(parsed) ? parsed : [];
  // Newest first.
  return list.slice().sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')));
}

export function appendAuditEntry(scope, entry) {
  const nowIso = new Date().toISOString();
  const next = {
    id: uid(),
    at: nowIso,
    ...entry,
  };

  const existing = listAuditEntries(scope);
  const trimmed = [next, ...existing].slice(0, 200);
  localStorage.setItem(auditKey(scope), JSON.stringify(trimmed));
  return next;
}

export function clearAuditEntries(scope) {
  localStorage.removeItem(auditKey(scope));
}
