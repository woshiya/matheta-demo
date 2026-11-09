import React, { useMemo } from 'react';

function StepCard({ title, subtitle, active }) {
  return (
    <div
      className={
        'rounded-xl border p-3 ' +
        (active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-900')
      }
    >
      <div className={'text-sm font-semibold ' + (active ? 'text-white' : 'text-gray-900')}>{title}</div>
      {subtitle ? (
        <div className={'mt-1 text-[11px] ' + (active ? 'text-white/80' : 'text-gray-600')}>{subtitle}</div>
      ) : null}
    </div>
  );
}

export default function AIStudioPanel({
  context,
  actor,
  decision,
  setDecision,
  reason,
  setReason,
  onSave,
}) {
  const steps = useMemo(
    () => [
      { id: 'topic', title: 'Topic', subtitle: context?.topicLabel || 'Not set' },
      { id: 'classData', title: 'Class Data', subtitle: context?.useClassData ? 'On' : 'Off' },
      { id: 'rules', title: 'Rules', subtitle: context?.rulesLabel || 'HKDSE-aligned' },
      { id: 'generate', title: 'Generate', subtitle: context?.difficultyLabel || 'Medium' },
      { id: 'check', title: 'Check', subtitle: 'HKDSE style' },
      { id: 'review', title: 'Review', subtitle: 'Teacher' },
    ],
    [context]
  );

  const plainEnglish = useMemo(() => {
    const t = context?.topicLabel ? ` on ${context.topicLabel}` : '';
    const d = context?.difficultyLabel ? ` (${context.difficultyLabel})` : '';
    const c = context?.useClassData ? ' It will use class weakness data.' : '';
    return `The AI will create${d} question${t}. It will follow HKDSE style.${c} Teacher approval is required.`;
  }, [context]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="p-4 border-b border-gray-100">
        <div className="text-sm font-semibold text-gray-900">AI Studio</div>
        <div className="mt-1 text-xs text-gray-600">How AI will create this question (transparent + teacher-controlled).</div>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-gray-700">AI Workflow Overview</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {steps.map((s, idx) => (
              <StepCard key={s.id} title={s.title} subtitle={s.subtitle} active={idx === 5} />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs font-semibold text-gray-700">Teacher</div>
          <div className="mt-1 text-sm text-gray-900">{actor?.name || actor?.email || actor?.id || 'Unknown'}</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold text-gray-700">Plain-English Summary</div>
          <div className="mt-2 text-sm text-gray-900">{plainEnglish}</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold text-gray-700">Prompt Preview</div>
          <pre className="mt-2 rounded-lg border border-gray-200 bg-gray-900 text-gray-100 p-3 text-xs overflow-auto whitespace-pre-wrap">
{String(context?.promptPreview || 'No prompt preview available.')}
          </pre>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold text-gray-700">Teacher Override</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { id: 'approve', label: 'Approve', cls: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
              { id: 'edit', label: 'Edit', cls: 'border-amber-200 bg-amber-50 text-amber-900' },
              { id: 'reject', label: 'Reject', cls: 'border-red-200 bg-red-50 text-red-900' },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setDecision?.(b.id)}
                className={
                  'rounded-lg border px-2 py-2 text-sm font-semibold ' +
                  b.cls +
                  (decision === b.id ? ' ring-2 ring-gray-900/20' : '')
                }
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <div className="text-xs text-gray-600">Override reason (saved to audit trail)</div>
            <textarea
              value={reason}
              onChange={(e) => setReason?.(e.target.value)}
              placeholder="Why are you approving/editing/rejecting this?"
              className="mt-2 w-full min-h-[88px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              Current decision: <span className="font-medium text-gray-800">{decision}</span>
            </div>
            <button
              type="button"
              onClick={() => onSave?.({ decision, reason: String(reason || '').trim() })}
              className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-gray-800"
            >
              Save Audit Entry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
