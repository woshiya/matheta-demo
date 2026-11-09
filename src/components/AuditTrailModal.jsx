import React, { useMemo } from 'react';
import { clearAuditEntries, listAuditEntries } from '../lib/auditTrail';

function pill(text) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
      {text}
    </span>
  );
}

export default function AuditTrailModal({ open, onClose, scope = 'global' }) {
  const entries = useMemo(() => (open ? listAuditEntries(scope) : []), [open, scope]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl rounded-xl bg-white border border-gray-200 shadow-lg">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Audit Trail</div>
            <div className="mt-1 text-xs text-gray-600">Records what changed, who changed it, when, and why.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm('Clear audit trail entries for this demo?');
                if (!ok) return;
                clearAuditEntries(scope);
                onClose?.();
              }}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-5 max-h-[70vh] overflow-auto">
          {entries.length === 0 ? (
            <div className="text-sm text-gray-600">No audit entries yet.</div>
          ) : (
            <div className="space-y-3">
              {entries.map((e) => (
                <div key={e.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {pill(String(e.action || 'action'))}
                      {e.entityType ? pill(String(e.entityType)) : null}
                      {e.entityId ? pill(`#${String(e.entityId)}`) : null}
                    </div>
                    <div className="text-xs text-gray-500">{e.at ? new Date(e.at).toLocaleString() : ''}</div>
                  </div>

                  <div className="mt-2 text-sm text-gray-900">
                    <span className="font-medium">Who:</span>{' '}
                    {e.actor?.name || e.actor?.email || e.actor?.id || 'Unknown'}
                  </div>

                  {e.summary ? (
                    <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{String(e.summary)}</div>
                  ) : null}

                  {e.reason ? (
                    <div className="mt-2 text-sm text-gray-800">
                      <span className="font-medium">Why:</span> {String(e.reason)}
                    </div>
                  ) : null}

                  {e.before || e.after ? (
                    <div className="mt-3 grid md:grid-cols-2 gap-3">
                      {e.before ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <div className="text-xs font-semibold text-gray-700">Before</div>
                          <div className="mt-1 text-xs text-gray-700 whitespace-pre-wrap">{String(e.before)}</div>
                        </div>
                      ) : null}
                      {e.after ? (
                        <div className="rounded-lg border border-gray-200 bg-emerald-50 p-3">
                          <div className="text-xs font-semibold text-emerald-900">After</div>
                          <div className="mt-1 text-xs text-emerald-900 whitespace-pre-wrap">{String(e.after)}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
