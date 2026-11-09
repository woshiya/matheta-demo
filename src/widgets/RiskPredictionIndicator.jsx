import React from "react";

const RISK_COLORS = {
  high: "#fd6864",
  medium: "#ffe066",
  low: "#55d86a"
};

export default function RiskPredictionIndicator({ total, atRisk, students }) {
  return (
    <div className="risk-prediction-indicator w-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 break-normal">Risk Prediction</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {Number(atRisk) || 0} out of {Number(total) || 0} students at risk
          </div>
        </div>
      </div>

      <div className="mt-4 max-h-28 overflow-y-auto pr-1">
        <div className="space-y-2">
          {students.slice(0, 5).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {s.name}
                </div>
                <div className="text-xs text-gray-500">
                  Score: {((Number(s.riskScore) || 0) * 100).toFixed(1)}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: RISK_COLORS[s.riskLevel] }}
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold" style={{ color: RISK_COLORS[s.riskLevel] }}>
                  {s.riskLevel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {students.length > 5 ? (
        <div className="mt-2 text-xs text-gray-500">+{students.length - 5} more...</div>
      ) : null}
    </div>
  );
}
