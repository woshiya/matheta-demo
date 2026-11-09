import React from "react";

export default function LearningConsistencyScore({ name, score, timeseries }) {
  return (
    <div className="learning-consistency-score w-full">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 break-normal">{name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {timeseries.slice(-7).filter((d) => d.value > 0).length}/7 active days
          </div>
        </div>
        <div className="text-2xl font-semibold text-gray-900 tabular-nums shrink-0">
          {Number(score) || 0}
          <span className="text-sm font-medium text-gray-500">/100</span>
        </div>
      </div>

      <div className="mt-4 h-10 flex items-end gap-1">
        {timeseries.map((day) => (
          <div
            key={day.date}
            className="w-2 rounded-sm"
            style={{
              height: Math.max(8, Number(day.value) > 0 ? 32 : 10),
              background: Number(day.value) > 0 ? "#55d86a" : "#e5e7eb",
            }}
            title={`${day.date}: ${day.value}`}
          />
        ))}
      </div>
    </div>
  );
}
