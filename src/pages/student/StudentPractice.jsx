import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { httpFetch } from "../../lib/http";

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function badge(label, tone) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border";
  const color =
    tone === "red"
      ? " bg-red-50 text-red-700 border-red-200"
      : tone === "amber"
        ? " bg-amber-50 text-amber-800 border-amber-200"
        : tone === "green"
          ? " bg-emerald-50 text-emerald-700 border-emerald-200"
          : " bg-gray-100 text-gray-700 border-gray-200";
  return <span className={base + color}>{label}</span>;
}

function tierTone(tier) {
  if (tier === 1) return "red";
  if (tier === 2) return "amber";
  if (tier === 3) return "green";
  return "gray";
}

function tierLabel(tier) {
  if (tier === 1) return "Most recommended";
  if (tier === 2) return "Recommended";
  if (tier === 3) return "Least recommended";
  return "Suggested";
}

export default function StudentPractice() {
  const { classId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState({ loading: true, error: null });
  const [data, setData] = useState(null);
  // Generation now happens on the setup page.

  const user = useMemo(() => safeParseJson(localStorage.getItem("user")), []);
  const studentId = user?.id;

  useEffect(() => {
    async function load() {
      if (!studentId) {
        setStatus({ loading: false, error: "Missing student login" });
        return;
      }
      if (!classId) {
        setStatus({ loading: false, error: "Missing class" });
        return;
      }
      setStatus({ loading: true, error: null });
      try {
        const res = await httpFetch(
          `/api/students/${encodeURIComponent(String(studentId))}/classes/${encodeURIComponent(String(classId))}/practice-recommendations?limit=12`
        );
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "Failed to load practice recommendations");
        }
        const json = await res.json();
        setData(json);
        setStatus({ loading: false, error: null });
      } catch (err) {
        setData(null);
        setStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    load();
  }, [studentId, classId]);


  function goPracticeTopic(r) {
    if (!r?.topic_id) return;
    const qs = new URLSearchParams();
    if (r.topic_name) qs.set("topicName", String(r.topic_name));
    if (r.domain_name) qs.set("domainName", String(r.domain_name));
    if (r.domain_key) qs.set("domainKey", String(r.domain_key));
    if (r.topic_key) qs.set("topicKey", String(r.topic_key));
    if (r.tier !== undefined && r.tier !== null) qs.set("priority", String(r.tier));
    navigate(
      `/student/class/${encodeURIComponent(String(classId))}/practice/${encodeURIComponent(String(r.topic_id))}?${qs.toString()}`
    );
  }

  if (status.loading) {
    return (
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        <div className="text-sm text-gray-600">Loading practice...</div>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        <div className="max-w-4xl">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{status.error}</div>
          <button
            className="mt-4 px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-5xl">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Practice Corner</h1>
            <p className="text-sm text-gray-600 mt-1">
              Suggested topics based on your recent performance.
            </p>
          </div>
          <button
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-gray-900">Recommended topics</div>
          <div className="text-xs text-gray-500 mt-1">
            Thresholds: High Risk &lt; {data?.thresholds?.high_risk_threshold ?? 50}% | Mastery &gt;= {data?.thresholds?.mastery_threshold ?? 70}%
          </div>

          <div className="mt-4 grid md:grid-cols-2 gap-3">
            {recs.length === 0 ? (
              <div className="text-sm text-gray-600">Not enough data yet. Complete some assignments first.</div>
            ) : (
              recs.map((r) => (
                <div key={r.topic_id ?? r.topic_key} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{r.topic_name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {r.domain_name} | {Number(r.accuracy ?? 0).toFixed(1)}% ({r.attempted} attempts)
                      </div>
                    </div>
                    <div>{badge(tierLabel(Number(r.tier)), tierTone(Number(r.tier)))}</div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
                      onClick={() => goPracticeTopic(r)}
                      type="button"
                    >
                      Practice This Topic
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
