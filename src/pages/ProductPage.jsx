import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function LogoMark({ className = "" }) {
  return (
    <div className={"flex items-center gap-2 " + className}>
      <div
        className="h-9 w-9 rounded-xl bg-gradient-to-b from-slate-900 to-slate-800 shadow-sm ring-1 ring-slate-200/60"
        aria-hidden="true"
      >
        <div className="h-full w-full grid place-items-center">
          <div className="h-4 w-4 rotate-90 rounded-sm bg-gradient-to-b from-sky-500 to-indigo-600" />
        </div>
      </div>
      <div className="leading-none">
        <div className="text-sm font-semibold text-slate-900">Matheta</div>
        <div className="text-[11px] font-medium text-slate-500">AI-assisted classroom intelligence</div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, className = "", type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={
        "inline-flex items-center justify-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-600/40 whitespace-nowrap " +
        className
      }
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 whitespace-nowrap " +
        className
      }
    >
      {children}
    </button>
  );
}

function BrowserFrame({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="min-w-0 text-[11px] font-medium text-slate-500 truncate">{title}</div>
        <div className="w-[44px]" />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function PlaceholderBadge() {
  // Kept for layout compatibility (but the label is hidden in UI).
  return null;
}

function Check({ children }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-[6px] h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] font-semibold tracking-widest text-sky-700">
      {String(children || "").toUpperCase()}
    </div>
  );
}

function FAQRow({ q, a, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left rounded-2xl border border-slate-200 bg-white px-5 py-4 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm font-semibold text-slate-900">{q}</div>
        <div className="text-slate-400 text-xs font-semibold">{open ? "−" : "+"}</div>
      </div>
      {open ? (
        <div className="mt-3 text-sm text-slate-700 leading-relaxed">{a}</div>
      ) : null}
    </button>
  );
}

export default function ProductPage() {
  const navigate = useNavigate();
  const [faqOpen, setFaqOpen] = useState(0);

  const faqs = useMemo(
    () => [
      {
        q: "Who is Matheta designed for?",
        a: "Hong Kong secondary schools, with an initial focus on HKDSE Mathematics.",
      },
      {
        q: "Does AI make the final decision?",
        a: "No. Teachers review, edit, approve or reject suggestions before use.",
      },
      {
        q: "What classroom data does it use?",
        a: "Attempts, accuracy, response time, repeated mistakes, inactivity and diagnostic results.",
      },
      {
        q: "How can schools deploy it?",
        a: "The proposed model is a web-based platform with per-school subscription licensing.",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link to="/product" className="shrink-0" aria-label="Matheta">
              <LogoMark />
            </Link>

            <div className="flex items-center gap-2">
              <PrimaryButton onClick={() => navigate("/login")}>Try Demo →</PrimaryButton>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-white" aria-hidden="true" />
        <div className="absolute -top-24 right-[-180px] h-[520px] w-[520px] rounded-full bg-sky-200/40 blur-3xl" aria-hidden="true" />
        <div className="absolute top-[420px] left-[-160px] h-[460px] w-[460px] rounded-full bg-teal-200/30 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-widest text-slate-700">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-600" aria-hidden="true" />
                AI-ASSISTED CLASSROOM ANALYTICS
              </div>

              <h1 className="mt-5 text-balance text-4xl md:text-5xl font-semibold leading-[1.06] text-slate-900">
                Turn classroom signals into <span className="text-sky-700">confident teaching</span> decisions.
              </h1>

              <p className="mt-4 max-w-xl text-balance text-sm md:text-base text-slate-700 leading-relaxed">
                Identify learning gaps, understand the evidence, and deliver targeted maths support with teachers in
                control.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <PrimaryButton onClick={() => navigate("/login")} className="sm:min-w-[160px]">
                  Try Demo
                </PrimaryButton>
                <SecondaryButton
                  className="sm:min-w-[160px]"
                  onClick={() => {
                    const el = document.getElementById("features");
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Explore features
                </SecondaryButton>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {["Explainable", "Teacher-controlled", "HKDSE maths focus"].map((x) => (
                  <span
                    key={x}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-700"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-600" aria-hidden="true" />
                    {x}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-r from-sky-200/50 via-indigo-200/40 to-teal-200/40 blur-2xl" aria-hidden="true" />
              <BrowserFrame title="Student signal table">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Student signal table</div>
                    <div className="mt-1 text-xs text-slate-600">Live classroom signals with evidence attached.</div>
                  </div>
                  {/* Screenshot slot: intentionally empty until real screenshots are added. */}
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-700">Signals (sample)</div>
                      <div className="text-[11px] font-semibold text-slate-500">Topic: Linear Equations</div>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="grid grid-cols-[1fr_auto] gap-0 border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <div className="px-3 py-2">Student</div>
                        <div className="px-3 py-2 text-right whitespace-nowrap">Attempts · Accuracy</div>
                      </div>
                      {[
                        { s: "Emma", a: 7, acc: "15%" },
                        { s: "Andy", a: 6, acc: "8%" },
                        { s: "Iris", a: 5, acc: "20%" },
                      ].map((r) => (
                        <div
                          key={r.s}
                          className="grid grid-cols-[1fr_auto] items-center text-[12px] text-slate-800 border-b last:border-b-0 border-slate-100"
                        >
                          <div className="px-3 py-2 font-semibold">{r.s}</div>
                          <div className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                            <span className="text-slate-700">{r.a}</span>
                            <span className="text-slate-400"> · </span>
                            <span className="text-rose-700">{r.acc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-700">Red flag snapshot</div>
                        <div className="mt-1 text-[11px] text-slate-500">Explainable recommendation preview.</div>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-800 border border-amber-200 bg-amber-50 rounded-full px-2 py-0.5">
                        Teacher reviews
                      </span>
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-700">Reasoning</div>
                      <div className="mt-2 text-sm text-slate-700 leading-relaxed">
                        Latest CW results show Emma (15%) and Andy (8%) accuracy. Suggest individual feedback before the
                        next checkpoint.
                      </div>
                    </div>
                  </div>
                </div>
              </BrowserFrame>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-white/70">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {[
                { t: "Live classroom insights", d: "Understand realtime learning signals." },
                { t: "Curriculum-aligned analytics", d: "HKDSE-focused domain and topic views." },
                { t: "Human-in-the-loop decisions", d: "Evidence shown before action." },
              ].map((x, idx) => (
                <div
                  key={x.t}
                  className={
                    "p-5 " +
                    (idx === 1 ? "md:border-x md:border-slate-200" : "") +
                    (idx > 0 ? "border-t md:border-t-0 border-slate-200" : "")
                  }
                >
                  <div className="text-sm font-semibold text-slate-900">{x.t}</div>
                  <div className="mt-1 text-sm text-slate-700">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="text-center">
            <SectionLabel>See the gaps. Act earlier.</SectionLabel>
            <h2 className="mt-3 text-2xl md:text-4xl font-semibold text-slate-900">
              Every student needs direction. Every teacher needs clarity.
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-sm font-semibold text-slate-900">For teachers</div>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <Check>Spot topic weaknesses in busy classes</Check>
                <Check>Reduce routine analysis and differentiated-practice workload</Check>
                <Check>Make decisions with visible evidence and constraints</Check>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-sm font-semibold text-slate-900">For students</div>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <Check>Get timely, personalised follow-up</Check>
                <Check>Address learning gaps before they compound</Check>
                <Check>Build confidence with scaffolded support</Check>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-sky-50 p-6">
            <div className="text-sm font-semibold text-slate-900">How it works: From live activity to targeted support.</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  n: "01",
                  t: "Live signals",
                  d: "Attempts, accuracy, response time and inactivity",
                },
                {
                  n: "02",
                  t: "Analytics engine",
                  d: "Find topic-level patterns and learning gaps",
                },
                {
                  n: "03",
                  t: "Teacher decision",
                  d: "Review, edit, approve or reject",
                },
                {
                  n: "04",
                  t: "Student follow-up",
                  d: "Deliver practice, scaffolding and feedback",
                },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold text-slate-500">{s.n}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{s.t}</div>
                  <div className="mt-1 text-xs text-slate-600">{s.d}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[11px] text-slate-600">
              AI supports teacher judgement. It does not replace it.
            </div>
          </div>
        </div>
      </section>

      {/* 01 Live analytics */}
      <section id="faq" className="mx-auto max-w-6xl px-4 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="rounded-3xl border border-slate-200 bg-sky-50 p-6">
            <BrowserFrame title="Live analytics · Student signals">
              {/* Screenshot slot: intentionally empty until real screenshots are added. */}
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-700">Signal table</div>
                <div className="mt-2 text-sm text-slate-600">
                  Live per-student indicators, grouped by topic.
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                Learning signals inform judgement; they are not a diagnosis on their own.
              </div>
            </BrowserFrame>
          </div>

          <div>
            <SectionLabel>01 / Live Classroom Analytics</SectionLabel>
            <h3 className="mt-3 text-2xl md:text-3xl font-semibold text-slate-900">Spot learning gaps while learning happens.</h3>
            <p className="mt-4 text-sm md:text-base text-slate-700 leading-relaxed">
              Track attempts, accuracy, response time, repeated mistakes and inactivity. See who may need support across
              students, groups and the class.
            </p>
            <div className="mt-5 space-y-2">
              <Check>Real-time learning indicators</Check>
              <Check>Topic-level patterns</Check>
              <Check>Evidence for timely support</Check>
            </div>
            <div className="mt-4 text-[11px] text-slate-500">
              Learning signals inform judgement; they are not a diagnosis on their own.
            </div>
          </div>
        </div>
      </section>

      {/* 02 Diagnostic */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <SectionLabel>02 / Diagnostic Centre</SectionLabel>
            <h3 className="mt-3 text-2xl md:text-3xl font-semibold text-slate-900">See strengths. Find the gaps.</h3>
            <p className="mt-4 text-sm md:text-base text-slate-700 leading-relaxed">
              Visualise performance across Number, Algebra, Measures, Shape and Space, and Data Handling. Compare
              individual results with class-level patterns.
            </p>
            <div className="mt-5 space-y-2">
              <Check>Domain and topic radar charts</Check>
              <Check>HKDSE mathematics mapping</Check>
              <Check>Adjustable mastery thresholds</Check>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <BrowserFrame title="Diagnostic centre · Radar">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Diagnostic overview</div>
                  <div className="mt-1 text-xs text-slate-600">Domains mapped to HKDSE-aligned categories.</div>
                </div>
                {/* Screenshot slot: intentionally empty until real screenshots are added. */}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-700">Radar chart preview</div>
                <div className="mt-2 text-sm text-slate-600">
                  In the interactive demo, this is a real chart (not shown here).
                </div>
              </div>
            </BrowserFrame>
          </div>
        </div>
      </section>

      {/* 03 AI Studio */}
      <section className="bg-gradient-to-b from-sky-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <SectionLabel>03 / AI Studio</SectionLabel>
          <h3 className="mt-3 text-2xl md:text-4xl font-semibold text-slate-900">No black box. A process you can understand.</h3>
          <p className="mt-4 max-w-2xl text-sm md:text-base text-slate-700 leading-relaxed">
            See how questions are generated. Review and edit AI instructions before generation, then check the questions
            before use.
          </p>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BrowserFrame title="AI Studio · Workflow overview">
              {/* Screenshot slot: intentionally empty until real screenshots are added. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["Topic", "Algebra - Linear Equations"],
                  ["Class Data", "On"],
                  ["Rules", "HKDSE-aligned"],
                  ["Generate", "easy · 2 marks"],
                  ["Check", "HKDSE style"],
                  ["Review", "Teacher"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-slate-200 bg-slate-950 p-3">
                    <div className="text-[11px] font-semibold text-white/70">{k}</div>
                    <div className="mt-1 text-sm font-semibold text-white">{v}</div>
                  </div>
                ))}
              </div>
            </BrowserFrame>

            <BrowserFrame title="AI Studio · Prompt review">
              {/* Screenshot slot: intentionally empty until real screenshots are added. */}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-950 p-4 text-white">
                <div className="text-[11px] font-semibold text-white/70">Prompt Preview</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-white/90 leading-relaxed font-mono">
                  Create one easy short answer question (2 marks).{"\n\n"}
                  Topic: Algebra - Linear Equations{"\n"}
                  Use class weakness data: Yes{"\n"}
                  HKDSE style: Yes{"\n"}
                  Include worked solution: Yes{"\n\n"}
                  Extra teacher instruction:{"\n"}
                  Create HKDSE aligned questions worth 2 marks for easy level for Algebra - Linear Equations.
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">Topic</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">Class data</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">Rules</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">Generate</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">Check</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">Teacher review</span>
              </div>
              <div className="mt-3 text-[11px] text-slate-500 text-center">
                Build AI and prompt literacy through a visible, editable process.
              </div>
            </BrowserFrame>
          </div>
        </div>
      </section>

      {/* 04 Interventions */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <BrowserFrame title="Intervention recommendations">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Intervention Recommendations</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Review trigger signal, students affected and reasoning before acting.
                  </div>
                </div>
                {/* Screenshot slot: intentionally empty until real screenshots are added. */}
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">AI Reasoning Summary</div>
                <div className="mt-2 text-sm text-slate-700">
                  Latest CW results show Emma (15%) and Andy (8%) accuracy on this topic. Suggest individual feedback or a
                  scaffolded question before the next checkpoint.
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Extra practice", "Scaffolded questions", "Review lessons", "Group support", "Individual feedback"].map(
                  (c) => (
                    <span
                      key={c}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                    >
                      {c}
                    </span>
                  )
                )}
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                Recommendations support professional judgement, not automatic decisions.
              </div>
            </BrowserFrame>
          </div>

          <div>
            <SectionLabel>04 / Targeted Interventions</SectionLabel>
            <h3 className="mt-3 text-2xl md:text-3xl font-semibold text-slate-900">The right support starts with the evidence.</h3>
            <p className="mt-4 text-sm md:text-base text-slate-700 leading-relaxed">
              Review the trigger signal, affected topic, students involved and reasoning summary before deciding what to do
              next.
            </p>
            <div className="mt-5 text-sm text-slate-700">
              <div className="flex flex-wrap gap-2">
                {["Extra practice", "Scaffolded questions", "Review lessons", "Group support", "Individual feedback"].map(
                  (x) => (
                    <span key={x} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">
                      {x}
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="mt-4 text-[11px] text-slate-500">
              Recommendations support professional judgement, not automatic decisions.
            </div>
          </div>
        </div>
      </section>

      {/* 05 Teacher control */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="rounded-3xl bg-slate-950 p-8 md:p-10 text-white relative overflow-hidden">
          <div className="absolute -top-40 right-[-160px] h-[420px] w-[420px] rounded-full bg-sky-700/25 blur-3xl" aria-hidden="true" />
          <div className="absolute bottom-[-220px] left-[-180px] h-[520px] w-[520px] rounded-full bg-indigo-700/25 blur-3xl" aria-hidden="true" />
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <SectionLabel>05 / Teacher Control</SectionLabel>
              <h3 className="mt-3 text-3xl md:text-4xl font-semibold">AI suggests. You decide.</h3>
              <p className="mt-4 text-sm md:text-base text-white/80 leading-relaxed">
                Approve, edit or reject AI suggestions before use. Keep decisions transparent with records of what changed,
                who changed it, when and why.
              </p>
              <div className="mt-6 space-y-2">
                <div className="text-sm text-white/90 font-semibold">Teacher preview</div>
                <div className="text-sm text-white/90 font-semibold">Teacher override</div>
                <div className="text-sm text-white/90 font-semibold">Transparent audit trail</div>
              </div>
            </div>

            <div>
              <BrowserFrame title="Teacher override · Approve / Edit / Reject">
                {/* Screenshot slot: intentionally empty until real screenshots are added. */}
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold text-slate-700">Teacher Override</div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-900 text-center">
                      Approve
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900 text-center">
                      Edit
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-900 text-center">
                      Reject
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-700">Override reason</div>
                    <div className="mt-2 text-sm text-slate-700">
                      “Align to HKDSE style and keep it confidence-building.”
                    </div>
                  </div>
                </div>
              </BrowserFrame>
            </div>
          </div>
        </div>
      </section>

      {/* More than maths */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="rounded-3xl border border-slate-200 bg-white p-8">
          <h3 className="text-2xl md:text-3xl font-semibold text-slate-900">More than a maths tool.</h3>
          <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-700">
            A platform for clearer teaching decisions and stronger AI and data literacy.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { t: "Interpret data patterns", d: "Identify signals that need attention, without guessing." },
              { t: "Understand AI instructions", d: "See inputs and constraints so prompts stay teachable." },
              { t: "Evaluate recommendations", d: "Review evidence and reasoning before acting." },
              { t: "Keep decisions accountable", d: "Record what changed and why in an audit trail." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-900">{c.t}</div>
                <div className="mt-2 text-sm text-slate-700">{c.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h3 className="text-2xl md:text-3xl font-semibold text-slate-900">Your questions, answered.</h3>
        <div className="mt-6 space-y-3">
          {faqs.map((row, idx) => (
            <FAQRow
              key={row.q}
              q={row.q}
              a={row.a}
              open={faqOpen === idx}
              onToggle={() => setFaqOpen((p) => (p === idx ? -1 : idx))}
            />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-sky-50">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute -top-20 right-[-120px] h-[340px] w-[340px] rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute bottom-[-140px] left-[-180px] h-[420px] w-[420px] rounded-full bg-sky-200/50 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <div className="rounded-3xl border border-slate-200 bg-white p-10">
            <h3 className="text-2xl md:text-4xl font-semibold text-slate-900">Make classroom data meaningful.</h3>
            <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-700">
              Explore transparent analytics and teacher-led AI support with Matheta.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <PrimaryButton onClick={() => navigate("/login")} className="sm:min-w-[220px]">
                Try Demo →
              </PrimaryButton>
              <div className="text-[11px] text-slate-500 flex items-center">Transparent demo flow</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
            <div>
              <LogoMark />
              <div className="mt-3 text-sm text-slate-700">Classroom intelligence. Teacher-led decisions.</div>
              <div className="mt-2 text-xs text-slate-500">Waiva Oshiya · THEi</div>
            </div>

            <div className="flex items-center gap-6 text-sm font-semibold text-slate-700">
              <a className="hover:text-slate-900" href="#features">
                Features
              </a>
              <a className="hover:text-slate-900" href="#faq">
                FAQ
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
