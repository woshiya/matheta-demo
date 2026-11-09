import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { normalizeGeneratedQuestions } from "../../lib/normalizeQuestions";
import { MATH_DOMAINS_AI_SAFE, MATH_DOMAINS_HKDSE_FULL } from "../../lib/mathTaxonomy";
import AIStudioModal from "../../components/AIStudioModal";
import { appendAuditEntry } from "../../lib/auditTrail";

const QUESTION_TYPES = [
  { id: "short", label: "Short" },
  { id: "long", label: "Long" },
];

const DIFFICULTIES = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

function makeEmptyQuestion(overrides = {}) {
  return {
    prompt: "",
    question: "",
    answer: "", // final answer (used for auto marking)
    solutionText: "", // worked solution / steps
    imageDataUrl: "", // preview only (data:image/png;base64,...)
    imageUrl: "", // persisted URL (future: Supabase)
    questionType: "short",
    difficulty: "medium",
    points: 1,
    ...overrides,
  };
}

export default function NewAssignment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetType = searchParams.get("type"); // hw | cw
  const presetClassId = searchParams.get("classId");

  const [classes, setClasses] = useState([]);
  const [status, setStatus] = useState("idle");
  const [createMode, setCreateMode] = useState("custom"); // custom | ai | mixed
  const [taxonomySource, setTaxonomySource] = useState("loading"); // loading | api | static
  const [domainKey, setDomainKey] = useState("algebra");
  const [topicKey, setTopicKey] = useState("linear_equations");
  const [domains, setDomains] = useState([]); // [{ id, key, name }]
  const [topics, setTopics] = useState([]); // [{ id, key, name }]
  const [questions, setQuestions] = useState([makeEmptyQuestion()]);

  const [generatingByIndex, setGeneratingByIndex] = useState(() => new Set());
  const [aiError, setAiError] = useState(null);
  const [aiStudioOpen, setAiStudioOpen] = useState(false);
  const [aiStudioCtx, setAiStudioCtx] = useState(null);

  const [form, setForm] = useState({
    type: presetType === "cw" ? "cw" : "hw",
    classId: presetClassId ? String(presetClassId) : "",
    title: "",
    dueDate: "",
    description: "",
  });

  const [gradingMode, setGradingMode] = useState("auto"); // auto | manual

  const aiSafeDomainKeys = useMemo(() => new Set(MATH_DOMAINS_AI_SAFE.map((d) => d.id)), []);
  const aiSafeTopicKeysByDomain = useMemo(() => {
    const map = new Map();
    for (const d of MATH_DOMAINS_AI_SAFE) {
      map.set(d.id, new Set((d.topics || []).map((t) => t.id)));
    }
    return map;
  }, []);

  const fullDomainKeys = useMemo(() => new Set(MATH_DOMAINS_HKDSE_FULL.map((d) => d.id)), []);
  const fullTopicKeysByDomain = useMemo(() => {
    const map = new Map();
    for (const d of MATH_DOMAINS_HKDSE_FULL) {
      map.set(d.id, new Set((d.topics || []).map((t) => t.id)));
    }
    return map;
  }, []);

  const uiDomains = createMode === "ai" ? MATH_DOMAINS_AI_SAFE : MATH_DOMAINS_HKDSE_FULL;
  const allowedDomainKeys = createMode === "ai" ? aiSafeDomainKeys : fullDomainKeys;
  const allowedTopicKeysByDomain = createMode === "ai" ? aiSafeTopicKeysByDomain : fullTopicKeysByDomain;

  const isAiSupportedSelection = useMemo(() => {
    if (!domainKey || !topicKey) return true;
    if (!aiSafeDomainKeys.has(domainKey)) return false;
    const allowTopics = aiSafeTopicKeysByDomain.get(domainKey);
    if (!allowTopics) return false;
    return allowTopics.has(topicKey);
  }, [domainKey, topicKey, aiSafeDomainKeys, aiSafeTopicKeysByDomain]);

  function setQuestionAt(index, patch) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  async function handleImagePick(index, file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) return;

    // Local preview only. We don't persist the bytes yet.
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });

      setQuestionAt(index, { imageDataUrl: dataUrl, imageUrl: "" });
    } catch {
      setAiError("Failed to load the image preview.");
    }
  }

  function clearQuestionImage(index) {
    setQuestionAt(index, { imageDataUrl: "", imageUrl: "" });
  }

  // Source of truth for class is the URL param.
  // Sync state when user navigates from a different class card.
  useEffect(() => {
    const nextType = presetType === "cw" ? "cw" : "hw";
    const nextClassId = presetClassId ? String(presetClassId) : "";

    setForm((prev) => {
      if (prev.type === nextType && prev.classId === nextClassId) return prev;
      return {
        type: nextType,
        classId: nextClassId,
        title: "",
        dueDate: "",
        description: "",
      };
    });
    setCreateMode("custom");
    setDomainKey("algebra");
    setTopicKey("linear_equations");
    setQuestions([makeEmptyQuestion()]);
    setAiError(null);
    setGeneratingByIndex(new Set());
    setGradingMode("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetType, presetClassId]);

  useEffect(() => {
    // Always flip to manual marking if the teacher includes any long questions.
    const hasLong = (questions || []).some((q) => String(q?.questionType) === "long");
    if (hasLong && gradingMode !== "manual") setGradingMode("manual");
  }, [questions, gradingMode]);

  // Domains/topics in UI:
  // - Custom/Mixed: always show the full HKDSE-aligned static list (exhaustive)
  // - AI mode: show a safe subset (and optionally pull from API if available)
  useEffect(() => {
    let cancelled = false;

    function applyStaticTaxonomy() {
      setTaxonomySource("static");
      const d = uiDomains.map((x) => ({ id: x.id, key: x.id, name: x.label }));
      setDomains(d);
      const firstDomainKey = domainKey || d[0]?.key || "algebra";
      const domain = uiDomains.find((x) => x.id === firstDomainKey) || uiDomains[0];
      const t = (domain?.topics || []).map((y) => ({ id: y.id, key: y.id, name: y.label }));
      setTopics(t);
      if (!topicKey && t[0]?.key) setTopicKey(t[0].key);
    }

    async function loadDomains() {
      // For Custom/Mixed, prefer the exhaustive static list regardless of backend state.
      if (createMode !== "ai") {
        applyStaticTaxonomy();
        return;
      }

      setTaxonomySource("loading");
      try {
        const res = await apiFetch("/api/domains");
        if (!res.ok) {
          applyStaticTaxonomy();
          return;
        }
        const data = await res.json();
        const list = (Array.isArray(data) ? data : []).filter((d) => allowedDomainKeys.has(d?.key));
        if (cancelled) return;

        if (list.length === 0) {
          applyStaticTaxonomy();
          return;
        }

        setTaxonomySource("api");
        setDomains(list);

        const nextDomainKey = domainKey && list.some((d) => d.key === domainKey) ? domainKey : list[0].key;
        setDomainKey(nextDomainKey);
      } catch {
        if (!cancelled) applyStaticTaxonomy();
      }
    }

    loadDomains();
    return () => {
      cancelled = true;
    };
  }, [createMode, uiDomains, allowedDomainKeys, domainKey, topicKey]);

  useEffect(() => {
    let cancelled = false;

    function applyStaticTopics() {
      const domain = uiDomains.find((x) => x.id === domainKey) || uiDomains[0];
      const t = (domain?.topics || []).map((y) => ({ id: y.id, key: y.id, name: y.label }));
      setTopics(t);
      const nextTopicKey = topicKey && t.some((x) => x.key === topicKey) ? topicKey : (t[0]?.key || "");
      if (nextTopicKey) setTopicKey(nextTopicKey);
    }

    async function loadTopics() {
      if (taxonomySource !== "api") {
        applyStaticTopics();
        return;
      }

      const domain = domains.find((d) => d.key === domainKey);
      if (!domain?.id) {
        applyStaticTopics();
        return;
      }

      try {
        const res = await apiFetch(`/api/domains/${domain.id}/topics`);
        if (!res.ok) {
          applyStaticTopics();
          return;
        }
        const data = await res.json();
        const allow = allowedTopicKeysByDomain.get(domainKey) || new Set();
        const list = (Array.isArray(data) ? data : []).filter((t) => allow.has(t?.key));
        if (cancelled) return;
        if (list.length === 0) {
          applyStaticTopics();
          return;
        }

        setTopics(list);
        const nextTopicKey = topicKey && list.some((t) => t.key === topicKey) ? topicKey : (list[0]?.key || "");
        if (nextTopicKey) setTopicKey(nextTopicKey);
      } catch {
        if (!cancelled) applyStaticTopics();
      }
    }

    loadTopics();
    return () => {
      cancelled = true;
    };
  }, [taxonomySource, domains, domainKey, topicKey, allowedTopicKeysByDomain, uiDomains]);

  useEffect(() => {
    // When switching modes, keep the selection valid for that mode's dropdown list.
    // If teacher moves to AI mode, we snap to the first AI-safe topic.
    const allowedDomains = allowedDomainKeys;
    const allowedTopics = allowedTopicKeysByDomain.get(domainKey) || new Set();

    if (!allowedDomains.has(domainKey)) {
      const first = uiDomains[0];
      if (first?.id) setDomainKey(first.id);
      if (first?.topics?.[0]?.id) setTopicKey(first.topics[0].id);
      return;
    }

    if (!allowedTopics.has(topicKey)) {
      const domain = uiDomains.find((d) => d.id === domainKey);
      const firstTopicId = domain?.topics?.[0]?.id;
      if (firstTopicId) setTopicKey(firstTopicId);
    }
  }, [createMode, allowedDomainKeys, allowedTopicKeysByDomain, uiDomains, domainKey, topicKey]);

  const selectedTopicLabel = useMemo(() => {
    const d = domains.find((x) => x.key === domainKey) || null;
    const t = topics.find((x) => x.key === topicKey) || null;
    if (d && t) return `${d.name} - ${t.name}`;
    return "";
  }, [domains, topics, domainKey, topicKey]);

  // For now, only Shape & Space topics default to diagram generation.
  // (The n8n layer can still decide to ignore/override image_mode.)
  const isDiagramTopic = useMemo(() => {
    return domainKey === "shape_space";
  }, [domainKey]);

  

  const selectedClass = useMemo(() => {
    if (!form.classId) return null;
    return classes.find((c) => String(c.id) === String(form.classId)) || null;
  }, [classes, form.classId]);

  const selectedClassLabel = useMemo(() => {
    if (!selectedClass) return "";
    const subjects = Array.isArray(selectedClass.subjects) && selectedClass.subjects.length > 0
      ? ` - ${selectedClass.subjects.join(", ")}`
      : "";
    return `${selectedClass.name}${subjects}`;
  }, [selectedClass]);

  useEffect(() => {
    async function loadClasses() {
      const user = JSON.parse(localStorage.getItem("user"));
      const teacherId = user?.id;
      if (!teacherId) return;
      try {
        const res = await apiFetch(`/api/teachers/${teacherId}/classes`);
        if (!res.ok) return;
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch {
        setClasses([]);
      }
    }
    loadClasses();
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const nonEmptyQuestionCount = useMemo(() => {
    return questions.filter((q) => String(q.question || "").trim().length > 0).length;
  }, [questions]);

  const canSaveDraft = useMemo(() => {
    return Boolean(form.classId) && Boolean(form.title);
  }, [form.classId, form.title]);

  const canPublish = useMemo(() => {
    return Boolean(form.classId) && Boolean(form.title) && nonEmptyQuestionCount > 0;
  }, [form.classId, form.title, nonEmptyQuestionCount]);

  const publishBlocker = useMemo(() => {
    if (!form.classId) return "Missing class (open this page from a class card).";
    if (!form.title) return "Title is required.";
    if (nonEmptyQuestionCount === 0) {
      return createMode === "custom"
        ? "Add at least one question before publishing."
        : "Generate or write at least one question before publishing.";
    }
    return "";
  }, [form.classId, form.title, nonEmptyQuestionCount, createMode]);

  async function createAssignmentWithQuestions(nextStatus) {
    setStatus("saving");
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      const createdBy = user?.id;

       if (nextStatus === "published" && nonEmptyQuestionCount === 0) {
        setStatus("error");
        return;
      }

      const descriptionParts = [];
      if (selectedTopicLabel) descriptionParts.push(`Topic: ${selectedTopicLabel}`);
      if (form.description?.trim()) descriptionParts.push(form.description.trim());
      const description = descriptionParts.length > 0 ? descriptionParts.join("\n\n") : null;

      const payload = {
        classId: form.classId,
        type: form.type,
        title: form.title,
        description,
        createdBy,
        status: "draft",
        gradingMode,
        dueAt: form.type === "hw" ? form.dueDate || null : null,
        scheduledAt: form.type === "cw" ? form.dueDate || null : null,
      };

      const res = await apiFetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const assignment = await res.json();

      const qPayload = {
        questions: questions
          .map((q, idx) => ({
            prompt: q.question,
            questionType: q.questionType,
            correctAnswer: q.answer, // final answer for marking
            solutionText: q.solutionText, // worked solution / steps
            points: Number(q.points) || 1,
            position: idx + 1,
            // Tagging for analytics (DB wiring later):
            domainId: domainKey,
            topicId: topicKey,
            difficulty: q.difficulty,
            source: createMode === "custom" ? "manual" : "ai",
             createdBy: JSON.parse(localStorage.getItem("user"))?.id,
             // For now: we only persist stable URLs. Base64 preview is not saved.
             imageUrl: q.imageUrl || null,
             imageDataUrl: q.imageDataUrl || null,
           }))
           .filter((q) => String(q.prompt || "").trim().length > 0),
       };

       if (qPayload.questions.length > 0) {
         const qRes = await apiFetch(`/api/assignments/${assignment.id}/questions`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify(qPayload),
         });
         if (!qRes.ok) {
           // Saving as draft can continue even if the backend hasn't been restarted
           // or the endpoint isn't deployed yet.
           // But publishing must not proceed unless questions are successfully saved.
           if (qRes.status === 404) {
             setAiError(
               nextStatus === "published"
                 ? "Backend endpoint for saving questions is missing (404). Restart the backend to publish assignments."
                 : "Backend endpoint for saving questions is missing (404). Restart the backend to enable question saving. Assignment will be saved without questions."
             );
             if (nextStatus === "published") {
               setStatus("error");
               return;
             }
           } else {
             setStatus("error");
             return;
           }
         }
       }

      if (nextStatus === "published") {
        const pubRes = await apiFetch(`/api/assignments/${assignment.id}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!pubRes.ok) {
          if (pubRes.status === 404) {
            setAiError("Backend endpoint for publishing assignments is missing (404). Restart the backend.");
          }
          setStatus("error");
          return;
        }
      }

      setStatus("saved");
      navigate(`/teacher/assignments?classId=${encodeURIComponent(form.classId)}&type=${encodeURIComponent(form.type)}`, {
        replace: true,
      });
    } catch {
      setStatus("error");
    }
  }

  function fallbackGenerateOne({ prompt, topic, difficulty, questionType }) {
    const cleanPrompt = (prompt || "").trim();
    const t = (topic || "Math").trim() || "Math";
    const d = difficulty || "medium";
    const qt = questionType || "short";

    const seed = Math.random().toString(16).slice(2, 8);
    const stem = cleanPrompt ? `(${cleanPrompt})` : "";

    const question = `${t} ${stem} [${d}/${qt}]\n\nCreate a practice question (seed: ${seed}).`;
    const answer = `Sample solution for seed ${seed}.`;
    return { question, answer };
  }

  async function handleGenerateOne(index) {
    if (createMode === "mixed" && !isAiSupportedSelection) {
      setAiError("Selected domain/topic is not supported by AI generation yet. Switch to a supported topic or write the question manually.");
      return;
    }
    setAiError(null);
    setGeneratingByIndex((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    try {
      const q = questions[index] || makeEmptyQuestion();
      const spec = [{ difficulty: q.difficulty, questionType: q.questionType }];

      // What we send to n8n should be self-contained: the user's prompt plus the
      // per-question constraints (difficulty/type/points).
      const enrichedPrompt = [
        String(q.prompt || "").trim(),
        "Constraints:",
        `- Difficulty: ${q.difficulty}`,
        `- Type: ${q.questionType}`,
        `- Points: ${Number(q.points) || 1}`,
      ]
        .filter((x) => String(x).trim().length > 0)
        .join("\n");

      const payload = {
        title: form.title,
        topic: selectedTopicLabel,
        domainKey,
        topicKey,
        // Let backend/n8n decide whether to run an image model.
        imageMode: isDiagramTopic ? "diagram" : "none",
        prompt: enrichedPrompt,
        questionSpecs: spec,
      };

      // Open AI Studio with a transparent preview before generation.
      setAiStudioCtx({
        topicLabel: selectedTopicLabel,
        useClassData: true,
        rulesLabel: 'HKDSE-aligned',
        difficultyLabel: q.difficulty ? String(q.difficulty) : 'medium',
        promptPreview: [
          `Create one ${q.difficulty} ${q.questionType} answer question.`,
          '',
          `Topic: ${selectedTopicLabel || '-'}`,
          `Use class weakness data: Yes`,
          `HKDSE style: Yes`,
          `Include worked solution: Yes`,
          `Teacher approval required: Yes`,
          '',
          'Extra teacher instruction:',
          String(q.prompt || '').trim() || 'None',
        ].join('\n'),
        payload,
      });
      setAiStudioOpen(true);

      // If we already created an assignment (future multi-generate flow), we can attach it here.
      // For now, AI generation happens before save, so this remains unused.

      // Require a teacher prompt before calling backend/n8n.
      const canCallBackend =
        Boolean(form.title) &&
        Boolean(selectedTopicLabel) &&
        Boolean(String(q.prompt || "").trim());
      if (!canCallBackend) {
        const fallback = fallbackGenerateOne({
          prompt: q.prompt,
          topic: selectedTopicLabel,
          difficulty: q.difficulty,
          questionType: q.questionType,
        });
        setQuestions((prev) => prev.map((x, i) => (i === index ? { ...x, ...fallback } : x)));
        return;
      }

      const res = await apiFetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Backend/n8n not wired yet: fall back to stub generation.
        const fallback = fallbackGenerateOne({
          prompt: q.prompt,
          topic: selectedTopicLabel,
          difficulty: q.difficulty,
          questionType: q.questionType,
        });
        setQuestions((prev) => prev.map((x, i) => (i === index ? { ...x, ...fallback } : x)));
        setAiError("AI generator not connected yet. Showing a stub question.");
        return;
      }

      const data = await res.json();
      const normalized = normalizeGeneratedQuestions(data, spec);
      const one = normalized[0];
      if (!one) {
        setAiError("AI returned no question.");
        return;
      }

      setQuestions((prev) =>
        prev.map((x, i) =>
          i === index
            ? {
                ...x,
                question: one.prompt,
                answer: one.finalAnswer || x.answer,
                solutionText: one.solutionText || x.solutionText,
                // if n8n provides it, keep as preview (base64) or URL
                imageDataUrl: one.imageDataUrl || x.imageDataUrl,
                imageUrl: one.imageUrl || x.imageUrl,
              }
            : x
        )
      );
    } catch (err) {
      console.error("[NewAssignment] AI generation failed:", err);
      const q = questions[index] || makeEmptyQuestion();
      const fallback = fallbackGenerateOne({
        prompt: q.prompt,
        topic: selectedTopicLabel,
        difficulty: q.difficulty,
        questionType: q.questionType,
      });
      setQuestions((prev) => prev.map((x, i) => (i === index ? { ...x, ...fallback } : x)));
      setAiError("AI generator not connected yet. Showing a stub question.");
    } finally {
      setGeneratingByIndex((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Create Assignment
            <span className="block text-sm font-medium text-gray-600 mt-1">
              {form.classId
                ? `for: ${selectedClassLabel || `Class ${form.classId}`}`
                : "(missing class)"}
            </span>
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Create homework or classwork for one class. Build questions manually, or generate them via AI.
          </p>
          {!form.classId ? (
            <div className="text-xs text-red-600 mt-2">
              Missing `classId` in URL. Go back and pick a class.
            </div>
          ) : null}
        </div>
        <button
          className="text-sm font-medium text-gray-900 hover:underline"
          onClick={() => navigate(-1)}
        >
          Cancel
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[{ id: "custom", label: "Custom Questions" }, { id: "ai", label: "AI-Generated" }, { id: "mixed", label: "Mixed" }].map((m) => (
            <button
              key={m.id}
              type="button"
              className={
                "px-3 py-2 rounded-md text-sm font-medium border text-left " +
                (createMode === m.id
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50")
              }
              onClick={() => setCreateMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Type</span>
            <select
              value={form.type}
              onChange={(e) => updateField("type", e.target.value)}
              className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="hw">Homework</option>
              <option value="cw">Classwork</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="text-sm font-medium text-gray-700">Marking mode</div>
          <div className="text-xs text-gray-600">
            Auto marking marks the final answer when a correct answer is provided. Manual marking lets you grade long questions yourself.
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              className={
                "px-3 py-2 rounded-md text-sm font-medium border " +
                (gradingMode === "auto"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50")
              }
              onClick={() => setGradingMode("auto")}
            >
              Auto
            </button>
            <button
              type="button"
              className={
                "px-3 py-2 rounded-md text-sm font-medium border " +
                (gradingMode === "manual"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50")
              }
              onClick={() => setGradingMode("manual")}
            >
              Manual
            </button>
          </div>
          {(questions || []).some((q) => String(q?.questionType) === "long") ? (
            <div className="text-xs text-gray-500 mt-2">Long questions detected: switching to manual marking.</div>
          ) : null}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Title</span>
          <input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="e.g. Linear Equations Practice"
            required
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Domain</span>
            <select
              value={domainKey}
              onChange={(e) => setDomainKey(e.target.value)}
              className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {domains.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Topic</span>
            <select
              value={topicKey}
              onChange={(e) => setTopicKey(e.target.value)}
              className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {topics.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {createMode === "mixed" && !isAiSupportedSelection ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
            Selected domain/topic is not supported by AI generation yet. You can still add this question manually, or switch to a supported topic.
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            {form.type === "hw" ? "Due Date" : "Scheduled Date"}
          </span>
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => updateField("dueDate", e.target.value)}
            className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            rows={5}
            placeholder="Optional instructions for students."
          />
        </label>

        {aiError ? <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">{aiError}</div> : null}

        {(createMode === "custom" || createMode === "mixed" || createMode === "ai") ? (
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Questions</div>
                <div className="text-xs text-gray-600 mt-1">Review and edit before publishing.</div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-md text-sm font-medium text-gray-900 bg-gray-100 hover:bg-gray-200"
                onClick={() => setQuestions((prev) => [...prev, makeEmptyQuestion()])}
              >
                + Add Question
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {questions.map((q, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">Q{idx + 1}</div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-gray-900 hover:underline"
                        onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={questions.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {createMode !== "custom" ? (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Difficulty</span>
                          <select
                            value={q.difficulty}
                            onChange={(e) =>
                              setQuestionAt(idx, { difficulty: e.target.value })
                            }
                            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                          {DIFFICULTIES.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Type</span>
                          <select
                            value={q.questionType}
                            onChange={(e) =>
                              setQuestionAt(idx, { questionType: e.target.value })
                            }
                            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Points</span>
                          <input
                            type="number"
                            value={q.points}
                            onChange={(e) =>
                              setQuestionAt(idx, { points: Number(e.target.value) || 1 })
                            }
                            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            min={1}
                          />
                      </label>
                    </div>
                  ) : null}

                  {createMode !== "custom" ? (
                    <div className="mt-3">
                      <div className="flex items-end gap-2">
                        <label className="block flex-1">
                          <span className="text-xs font-medium text-gray-700">Prompt (AI)</span>
                          <input
                            value={q.prompt}
                            onChange={(e) =>
                              setQuestionAt(idx, { prompt: e.target.value })
                            }
                            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. Make it HKDSE-aligned and show clear steps"
                          />
                        </label>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
                          onClick={() => handleGenerateOne(idx)}
                          disabled={generatingByIndex.has(idx) || !form.title || !selectedTopicLabel || !String(q.prompt || "").trim()}
                          title={!form.title ? "Add a title to generate" : (!selectedTopicLabel ? "Select a topic to generate" : (!String(q.prompt || "").trim() ? "Add a prompt to generate" : ""))}
                        >
                          {generatingByIndex.has(idx) ? "Generating..." : q.question.trim() ? "Regenerate" : "Generate"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-gray-700">Diagram / Image (optional)</div>
                      {(q.imageDataUrl || q.imageUrl) ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-gray-900 hover:underline"
                          onClick={() => clearQuestionImage(idx)}
                        >
                          Remove image
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                      {q.imageDataUrl || q.imageUrl ? (
                        <img
                          src={q.imageDataUrl || q.imageUrl}
                          alt="Question diagram"
                          className="max-w-full rounded-md border border-gray-200 bg-white"
                        />
                      ) : (
                        <div className="text-xs text-gray-600">
                          {createMode === "ai"
                            ? "No image was generated for this question."
                            : "Upload an image for questions that need diagrams (e.g. shapes/areas)."}
                        </div>
                      )}

                      {(createMode === "custom" || createMode === "mixed") ? (
                        <div className="mt-3 flex items-center gap-3">
                          <label className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onClick={(e) => {
                                // Allow re-selecting the same file.
                                e.currentTarget.value = "";
                              }}
                              onChange={(e) => handleImagePick(idx, e.target.files?.[0] || null)}
                            />
                            Upload image
                          </label>
                          <div className="text-xs text-gray-500">PNG/JPG. Preview only (not saved yet).</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <label className="block mt-3">
                    <span className="text-xs font-medium text-gray-700">Question</span>
                    <textarea
                      value={q.question}
                      onChange={(e) =>
                        setQuestionAt(idx, { question: e.target.value })
                      }
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      rows={3}
                      placeholder={
                        createMode === "custom"
                          ? "Write the question here"
                          : createMode === "mixed"
                            ? "Choose to generate questions or write your own question"
                            : "Generated question will be displayed here"
                      }
                    />
                  </label>

                  <label className="block mt-3">
                    <span className="text-xs font-medium text-gray-700">Final answer (used for marking)</span>
                    <input
                      value={q.answer}
                      onChange={(e) =>
                        setQuestionAt(idx, { answer: e.target.value })
                      }
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="e.g. 8 cm and 5 cm"
                    />
                  </label>

                  <label className="block mt-3">
                    <span className="text-xs font-medium text-gray-700">Worked solution (optional)</span>
                    <textarea
                      value={q.solutionText || ""}
                      onChange={(e) =>
                        setQuestionAt(idx, { solutionText: e.target.value })
                      }
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      rows={3}
                      placeholder={createMode === "custom" ? "Show steps / reasoning (optional)" : "AI steps will appear here if provided"}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm font-medium text-gray-900 bg-gray-100 hover:bg-gray-200"
            onClick={() => navigate(-1)}
          >
            Back
          </button>
          <button
            type="button"
            className={
              "px-3 py-2 rounded-md text-sm font-medium border " +
              (status === "saving" || !canSaveDraft
                ? "text-gray-400 bg-white border-gray-200 opacity-60 cursor-not-allowed"
                : "text-gray-900 bg-white border-gray-200 hover:bg-gray-50")
            }
            disabled={status === "saving" || !canSaveDraft}
            onClick={() => createAssignmentWithQuestions("draft")}
          >
            {status === "saving" ? "Saving..." : status === "error" ? "Error" : "Save Draft"}
          </button>
          <button
            type="button"
            className={
              "px-3 py-2 rounded-md text-sm font-medium " +
              (status === "saving" || !canPublish
                ? "text-white bg-gray-400 opacity-70 cursor-not-allowed"
                : "text-white bg-gray-900 hover:bg-gray-800")
            }
            disabled={status === "saving" || !canPublish}
            onClick={() => createAssignmentWithQuestions("published")}
            title={!canPublish && publishBlocker ? publishBlocker : ""}
          >
            {status === "saving" ? "Publishing..." : status === "error" ? "Error" : "Publish"}
          </button>
        </div>

        {!canPublish && publishBlocker ? (
          <div className="text-xs text-gray-600 pt-2">{publishBlocker}</div>
        ) : null}
      </div>

      <AIStudioModal
        open={aiStudioOpen}
        onClose={() => setAiStudioOpen(false)}
        context={aiStudioCtx}
        actor={(() => {
          try {
            return JSON.parse(localStorage.getItem('user'));
          } catch {
            return null;
          }
        })()}
        onDecision={({ decision, reason }) => {
          const actor = (() => {
            try {
              return JSON.parse(localStorage.getItem('user'));
            } catch {
              return null;
            }
          })();

          appendAuditEntry('teacher', {
            action: 'ai_studio_decision',
            entityType: 'question_generation',
            entityId: aiStudioCtx?.payload?.topicKey || aiStudioCtx?.topicLabel || 'unknown',
            actor: actor ? { id: actor.id, name: actor.name, email: actor.email, role: actor.role } : null,
            reason: reason || '(no reason provided)',
            summary: `Decision: ${decision}\nTopic: ${aiStudioCtx?.topicLabel || '-'}\nDomainKey: ${aiStudioCtx?.payload?.domainKey || '-'}\nTopicKey: ${aiStudioCtx?.payload?.topicKey || '-'}`,
            before: null,
            after: `decision=${decision}`,
          });

          setAiStudioOpen(false);
        }}
      />
    </div>
  );
}
