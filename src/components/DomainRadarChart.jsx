import { useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

const DOMAIN_LABELS = {
  number: "Number",
  algebra: "Algebra",
  measures: "Measures",
  shape_space: "Shape & Space",
  data_handling: "Data Handling",
};

const ORDER = ["number", "algebra", "measures", "shape_space", "data_handling"];

function wrapLabel(value) {
  const s = String(value ?? "");
  if (!s) return [""];

  // Simple word-wrapping for domain labels so they don't clip.
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [s];

  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    // Keep labels compact; we only have a small ring outside the chart.
    if (next.length > 12 && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export default function DomainRadarChart({ scoresByDomainKey, height = 300 }) {
  const data = useMemo(() => {
    const src = scoresByDomainKey && typeof scoresByDomainKey === "object" ? scoresByDomainKey : {};
    return ORDER.map((k) => ({
      domain: DOMAIN_LABELS[k] || k,
      score: Number(src[k] ?? 0) || 0,
    }));
  }, [scoresByDomainKey]);

  const stats = useMemo(() => {
    const src = scoresByDomainKey && typeof scoresByDomainKey === "object" ? scoresByDomainKey : {};
    const values = ORDER.map((k) => {
      const n = Number(src[k] ?? 0);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    });
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    return { avg, min, max };
  }, [scoresByDomainKey]);

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <RadarChart
          data={data}
          // Leave space around the chart so axis labels don't get clipped.
          outerRadius="72%"
          margin={{ top: 18, right: 44, bottom: 18, left: 44 }}
        >
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="domain"
            tickLine={false}
            tick={({ payload, x, y, textAnchor }) => {
              const lines = wrapLabel(payload?.value);
              return (
                <text
                  x={x}
                  y={y}
                  textAnchor={textAnchor}
                  fill="#374151"
                  fontSize={12}
                >
                  {lines.map((line, i) => (
                    <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            }}
          />
          <PolarRadiusAxis
            domain={[0, 100]}
            angle={90}
            tickCount={6}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
          />
          <Radar
            dataKey="score"
            stroke="#1d4ed8"
            strokeWidth={2}
            fill="#60a5fa"
            fillOpacity={0.35}
            dot={{ r: 3, fill: "#1d4ed8" }}
          />

          {/* Small caption inside the SVG for quick reading */}
          <text x="50%" y="50%" textAnchor="middle" fill="#111827" fontSize={12} fontWeight={600}>
            Avg {Math.round(stats.avg)}%
          </text>
          <text x="50%" y="50%" dy={16} textAnchor="middle" fill="#6b7280" fontSize={11}>
            Min {Math.round(stats.min)}% · Max {Math.round(stats.max)}%
          </text>
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
