import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

function clampInt(value, min, max, fallback) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function makeStubQuestions({ topicName, easyCount, mediumCount, hardCount }) {
  const out = [];
  let idx = 1;

  function push(count, difficulty) {
    for (let i = 0; i < count; i++) {
      const n1 = difficulty === "easy" ? 6 + i : difficulty === "medium" ? 12 + i * 2 : 30 + i * 3;
      const n2 = difficulty === "easy" ? 2 + i : difficulty === "medium" ? 5 + i : 9 + i;
      const op = (i % 3) === 0 ? "+" : (i % 3) === 1 ? "-" : "×";
      const question = `${topicName}: Q${idx} (${difficulty})\nCompute: ${n1} ${op} ${n2}`;
      const answer = op === "+" ? String(n1 + n2) : op === "-" ? String(n1 - n2) : String(n1 * n2);
      out.push({
        id: `stub_${difficulty}_${idx}`,
        difficulty,
        question,
        answer,
      });
      idx++;
    }
  }

  push(easyCount, "easy");
  push(mediumCount, "medium");
  push(hardCount, "hard");
  return out;
}

export default function StudentPracticeSetup() {
  const navigate = useNavigate();
  const { classId, topicId } = useParams();
  const [searchParams] = useSearchParams();

  const topicName = searchParams.get("topicName") || `Topic ${topicId}`;
  const domainName = searchParams.get("domainName") || "";

  const [easyCount, setEasyCount] = useState(5);
  const [mediumCount, setMediumCount] = useState(5);
  const [hardCount, setHardCount] = useState(0);

  const [generated, setGenerated] = useState([]);
  const [showAnswerById, setShowAnswerById] = useState(() => ({}));
  const [answerById, setAnswerById] = useState(() => ({}));
  const [submitSummary, setSubmitSummary] = useState(null);

  const promptPreview = useMemo(() => {
    const parts = [];
    if (easyCount) parts.push(`${easyCount} easy`);
    if (mediumCount) parts.push(`${mediumCount} medium`);
    if (hardCount) parts.push(`${hardCount} hard`);
    const counts = parts.join(", ") || "some";
    return `Give me ${counts} questions for ${topicName} using different operations. Return a question and answer list.`;
  }, [easyCount, mediumCount, hardCount, topicName]);

  function generateStub() {
    const e = clampInt(easyCount, 0, 20, 0);
    const m = clampInt(mediumCount, 0, 20, 0);
    const h = clampInt(hardCount, 0, 20, 0);
    const qs = makeStubQuestions({ topicName, easyCount: e, mediumCount: m, hardCount: h });
    setGenerated(qs);
    setShowAnswerById({});
    setAnswerById({});
    setSubmitSummary(null);
  }

  function submit() {
    if (generated.length === 0) return;
    const rows = generated.map((q) => {
      const studentAnswer = String(answerById[q.id] ?? "").trim();
      const correct = String(q.answer ?? "").trim();
      const isCorrect = studentAnswer !== "" && studentAnswer === correct;
      return { id: q.id, difficulty: q.difficulty, isCorrect, attempted: studentAnswer !== "" };
    });
    const attempted = rows.filter((r) => r.attempted).length;
    const correct = rows.filter((r) => r.isCorrect).length;
    setSubmitSummary({ attempted, correct, total: rows.length });
  }

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-5xl">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Practice: {topicName}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {domainName ? `${domainName} · ` : ""}Choose how many questions and difficulty.
            </p>
          </div>
          <button
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => navigate(`/student/class/${encodeURIComponent(String(classId))}/practice`)}
          >
            Back
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-gray-900">Setup</div>
          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Easy questions</span>
              <input
                type="number"
                min={0}
                max={20}
                value={easyCount}
                onChange={(e) => setEasyCount(e.target.value)}
                className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Medium questions</span>
              <input
                type="number"
                min={0}
                max={20}
                value={mediumCount}
                onChange={(e) => setMediumCount(e.target.value)}
                className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Hard questions</span>
              <input
                type="number"
                min={0}
                max={20}
                value={hardCount}
                onChange={(e) => setHardCount(e.target.value)}
                className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4">
            <div className="text-xs text-gray-500">Simulated AI prompt</div>
            <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 whitespace-pre-wrap">
              {promptPreview}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={generateStub}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
            >
              Generate Practice
            </button>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-gray-900">Questions</div>
          {generated.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">Generate a set to begin.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {generated.map((q, idx) => {
                const show = Boolean(showAnswerById[q.id]);
                return (
                  <div key={q.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-gray-900">Q{idx + 1}</div>
                      <div className="text-xs text-gray-500">{q.difficulty}</div>
                    </div>
                    <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{q.question}</div>

                    <div className="mt-4">
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Your answer</span>
                        <input
                          value={answerById[q.id] ?? ""}
                          onChange={(e) =>
                            setAnswerById((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          placeholder="Type your answer"
                        />
                      </label>
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-gray-900 hover:underline"
                        onClick={() =>
                          setShowAnswerById((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                        }
                      >
                        {show ? "Hide answer" : "Show answer"}
                      </button>
                    </div>
                    {show ? (
                      <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        <div className="text-xs font-semibold text-emerald-900">Answer</div>
                        <div className="mt-1 font-mono">{q.answer}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <div className="pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    className="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
                  >
                    Submit
                  </button>
                  {submitSummary ? (
                    <div className="text-sm text-gray-700">
                      Score: <span className="font-semibold">{submitSummary.correct}</span> / {submitSummary.total}
                      <span className="text-gray-500"> (attempted {submitSummary.attempted})</span>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-gray-500">Answers are checked locally and not saved.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
