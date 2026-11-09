import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Eye,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react';

function toneClasses(tone) {
  if (tone === 'blue') return { border: 'border-sky-500/50', text: 'text-sky-200' };
  if (tone === 'green') return { border: 'border-emerald-500/50', text: 'text-emerald-200' };
  if (tone === 'amber') return { border: 'border-amber-500/50', text: 'text-amber-200' };
  if (tone === 'purple') return { border: 'border-violet-500/50', text: 'text-violet-200' };
  if (tone === 'red') return { border: 'border-rose-500/50', text: 'text-rose-200' };
  return { border: 'border-slate-500/40', text: 'text-slate-200' };
}

function StepCard({ title, subtitle, tone = 'slate', Icon, active, onClick }) {
  const t = toneClasses(tone);
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-left rounded-xl border px-3 py-3 bg-slate-900/60 transition ' +
        (active ? 'ring-2 ring-white/10 ' : 'hover:bg-slate-900/80 ') +
        t.border
      }
    >
      <div className="flex items-center gap-2">
        {Icon ? (
          <span className={'inline-flex items-center justify-center h-7 w-7 rounded-lg border bg-slate-950/40 ' + t.border}>
            <Icon size={16} className={t.text} />
          </span>
        ) : null}
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle ? (
            <div className={'mt-0.5 text-[11px] ' + t.text}>{subtitle}</div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function StepDetail({ step, context, overrides, setOverrides }) {
  const title = step?.title || 'Step';
  const subtitle = step?.subtitle || '';
  const id = step?.id || '';
  const fieldCls =
    'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/40';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-white">{title} Details</div>
          <div className="mt-1 text-[11px] text-white/70">{subtitle || 'Edit how this step influences the AI prompt.'}</div>
        </div>
      </div>

      {id === 'topic' ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-white/80">Topic</div>
          <input
            value={String(overrides?.topicLabel ?? context?.topicLabel ?? '')}
            onChange={(e) => setOverrides((p) => ({ ...p, topicLabel: e.target.value }))}
            className={fieldCls}
            placeholder="e.g. Algebra - Linear Equations"
          />
          <div className="mt-2 text-[11px] text-white/60">This is shown in the Prompt Preview and summary.</div>
        </div>
      ) : null}

      {id === 'classData' ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-white/80">Use Class Weakness Data</div>
          <div className="mt-2 flex items-center gap-2">
            {[{ id: true, label: 'On' }, { id: false, label: 'Off' }].map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                onClick={() => setOverrides((p) => ({ ...p, useClassData: opt.id }))}
                className={
                  'rounded-lg border px-3 py-2 text-sm font-semibold ' +
                  (Boolean(overrides?.useClassData ?? context?.useClassData) === opt.id
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-slate-700 bg-slate-950/40 text-white/70 hover:bg-slate-900/60')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-white/60">
            Demo: toggling this changes the prompt preview line "Use class weakness data".
          </div>
        </div>
      ) : null}

      {id === 'rules' ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-white/80">Rules / Style</div>
          <input
            value={String(overrides?.rulesLabel ?? context?.rulesLabel ?? 'HKDSE-aligned')}
            onChange={(e) => setOverrides((p) => ({ ...p, rulesLabel: e.target.value }))}
            className={fieldCls}
            placeholder="e.g. HKDSE-aligned; show clear steps"
          />
          <div className="mt-2 text-[11px] text-white/60">This represents policy and formatting constraints.</div>
        </div>
      ) : null}

      {id === 'generate' ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-white/80">Generation Controls</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-white/70">Difficulty label</div>
              <input
                value={String(overrides?.difficultyLabel ?? context?.difficultyLabel ?? '')}
                onChange={(e) => setOverrides((p) => ({ ...p, difficultyLabel: e.target.value }))}
                className={fieldCls}
                placeholder="easy"
              />
            </div>
            <div>
              <div className="text-[11px] text-white/70">Marks</div>
              <input
                inputMode="numeric"
                value={String(overrides?.marks ?? '')}
                onChange={(e) => setOverrides((p) => ({ ...p, marks: e.target.value }))}
                className={fieldCls}
                placeholder="2"
              />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/60">These settings should explain what the model is being asked to produce.</div>
        </div>
      ) : null}

      {id === 'check' ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-white/80">Checks (Guardrails)</div>
          <textarea
            value={String(overrides?.checks ?? 'HKDSE style; correct math; clear working; no trick wording.')}
            onChange={(e) => setOverrides((p) => ({ ...p, checks: e.target.value }))}
            className={fieldCls}
            rows={3}
          />
          <div className="mt-2 text-[11px] text-white/60">These are the quality rules the AI must satisfy.</div>
        </div>
      ) : null}

      {id === 'review' ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-white/80">Teacher Review</div>
          <textarea
            value={String(overrides?.reviewNotes ?? '')}
            onChange={(e) => setOverrides((p) => ({ ...p, reviewNotes: e.target.value }))}
            className={fieldCls}
            rows={3}
            placeholder="Optional notes for why you approve/edit/reject."
          />
          <div className="mt-2 text-[11px] text-white/60">This is separate from the audit reason below, but can be included in the prompt preview.</div>
        </div>
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
  onApplyPrompt,
  onGenerateQuestions,
  canGenerateQuestions,
  generateQuestionsDisabledReason,
  generatingQuestions,
}) {
  const [activeStepId, setActiveStepId] = useState('topic');
  const [overrides, setOverrides] = useState({
    topicLabel: undefined,
    useClassData: undefined,
    rulesLabel: undefined,
    difficultyLabel: undefined,
    marks: '',
    checks: 'HKDSE style; correct math; clear working; no trick wording.',
    reviewNotes: '',
  });

  useEffect(() => {
    // Keep the panel feeling responsive when question/topic changes.
    setActiveStepId('topic');
  }, [context?.topicLabel, context?.difficultyLabel]);

  const steps = useMemo(
    () => [
      { id: 'topic', title: 'Topic', subtitle: context?.topicLabel || 'Not set', tone: 'blue', Icon: BookOpen },
      { id: 'classData', title: 'Class Data', subtitle: context?.useClassData ? 'On' : 'Off', tone: 'green', Icon: Users },
      { id: 'rules', title: 'Rules', subtitle: context?.rulesLabel || 'HKDSE-aligned', tone: 'amber', Icon: SlidersHorizontal },
      { id: 'generate', title: 'Generate', subtitle: context?.difficultyLabel || 'Medium', tone: 'purple', Icon: Sparkles },
      { id: 'check', title: 'Check', subtitle: 'HKDSE style', tone: 'red', Icon: ShieldCheck },
      { id: 'review', title: 'Review', subtitle: 'Teacher', tone: 'slate', Icon: Eye },
    ],
    [context]
  );

  const activeStep = useMemo(() => steps.find((s) => s.id === activeStepId) || steps[0], [steps, activeStepId]);

  const effective = useMemo(() => {
    const topicLabel = String(overrides.topicLabel ?? context?.topicLabel ?? '').trim();
    const useClassData = Boolean(overrides.useClassData ?? context?.useClassData);
    const rulesLabel = String(overrides.rulesLabel ?? context?.rulesLabel ?? 'HKDSE-aligned').trim();
    const difficultyLabel = String(overrides.difficultyLabel ?? context?.difficultyLabel ?? '').trim();
    const marks = String(overrides.marks || '').trim();
    const checks = String(overrides.checks || '').trim();
    const reviewNotes = String(overrides.reviewNotes || '').trim();
    return { topicLabel, useClassData, rulesLabel, difficultyLabel, marks, checks, reviewNotes };
  }, [context, overrides]);

  const computedPromptPreview = useMemo(() => {
    // If parent gives a promptPreview string, treat it as the base template and
    // append the step details to make the process visible.
    const base = String(context?.promptPreview || '').trim();
    const blocks = [];
    if (base) blocks.push(base);
    blocks.push(
      [
        '---',
        'Workflow Inputs (editable demo):',
        `Topic: ${effective.topicLabel || '-'}`,
        `Use class weakness data: ${effective.useClassData ? 'Yes' : 'No'}`,
        `Rules: ${effective.rulesLabel || '-'}`,
        `Difficulty: ${effective.difficultyLabel || '-'}`,
        `Marks: ${effective.marks || '-'}`,
        effective.checks ? `Checks: ${effective.checks}` : null,
        effective.reviewNotes ? `Teacher notes: ${effective.reviewNotes}` : null,
      ].filter(Boolean).join('\n')
    );
    return blocks.join('\n\n');
  }, [context?.promptPreview, effective]);

  const suggestedTeacherPrompt = useMemo(() => {
    // This is meant to be the teacher's additional instruction (stored on the question),
    // not the entire system prompt. Topic/difficulty/points are handled elsewhere.
    const parts = [];
    if (effective.rulesLabel) parts.push(effective.rulesLabel);
    if (effective.marks) parts.push(`Worth ${effective.marks} marks.`);
    if (effective.checks) parts.push(`Checks: ${effective.checks}`);
    if (effective.reviewNotes) parts.push(`Teacher note: ${effective.reviewNotes}`);
    return parts.join('\n');
  }, [effective]);

  const plainEnglish = useMemo(() => {
    const t = effective.topicLabel ? ` on ${effective.topicLabel}` : '';
    const d = effective.difficultyLabel ? ` (${effective.difficultyLabel})` : '';
    const c = effective.useClassData ? ' It will use class weakness data.' : '';
    const r = effective.rulesLabel ? ` It will follow: ${effective.rulesLabel}.` : '';
    const m = effective.marks ? ` Target marks: ${effective.marks}.` : '';
    return `The AI will create${d} question${t}.${r}${m}${c} Teacher approval is required.`;
  }, [effective]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">AI Studio</div>
            <div className="mt-1 text-xs text-gray-600">How AI will create this question.</div>
          </div>
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            Transparent
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-white">AI Workflow Overview</div>
              <div className="mt-1 text-[11px] text-white/70">Click any step to edit it (demo).</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {steps.map((s, idx) => (
              <StepCard
                key={s.id}
                title={s.title}
                subtitle={s.subtitle}
                tone={s.tone}
                Icon={s.Icon}
                active={s.id === activeStepId}
                onClick={() => setActiveStepId(s.id)}
              />
            ))}
          </div>
        </div>

        <StepDetail step={activeStep} context={context} overrides={overrides} setOverrides={setOverrides} />

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
 {computedPromptPreview || 'No prompt preview available.'}
          </pre>

          <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            <button
              type="button"
              className="w-full sm:w-auto sm:min-w-[160px] rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-semibold hover:bg-violet-500 whitespace-nowrap"
              onClick={() => {
                setActiveStepId('generate');
                onApplyPrompt?.(suggestedTeacherPrompt);
              }}
            >
              Generate Prompt
            </button>
            <button
              type="button"
              disabled={Boolean(generatingQuestions) || !canGenerateQuestions}
              title={!canGenerateQuestions ? String(generateQuestionsDisabledReason || '') : ''}
              className={
                'w-full sm:w-auto sm:min-w-[160px] rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap ' +
                (Boolean(generatingQuestions) || !canGenerateQuestions
                  ? 'bg-gray-300 text-gray-700 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-800')
              }
              onClick={() => {
                setActiveStepId('review');
                onGenerateQuestions?.();
              }}
            >
              {generatingQuestions ? 'Generating...' : 'Generate Questions'}
            </button>
            <div className="text-[11px] text-gray-500 sm:ml-1">
              Demo: Generate Prompt writes into the selected question. Generate Questions triggers generation.
            </div>
          </div>
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
