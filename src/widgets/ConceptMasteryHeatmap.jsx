import React from "react";

// Example props structure provided in previous step
const COLORS = {
  mastered: "#55d86a",
  progress: "#ffe066",
  struggling: "#fd6864",
  not_started: "#d9d9d9"
};

export default function ConceptMasteryHeatmap({ students, concepts, mastery }) {
  return (
    <div className="concept-mastery-heatmap w-full overflow-x-auto">
      <table className="min-w-[360px] w-full border-separate border-spacing-2">
        <thead>
          <tr>
            <th className="text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Student</th>
            {concepts.map((c) => (
              <th key={c.id} className="text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td className="text-sm font-semibold text-gray-900 whitespace-nowrap pr-2">{student.name}</td>
              {concepts.map((concept) => {
                const status = mastery[student.id]?.[concept.id] || "not_started";
                return (
                  <td key={concept.id}>
                    <span
                      title={`${student.name} - ${concept.label}: ${status}`}
                      style={{
                        display: "inline-block",
                        width: 20,
                        height: 20,
                        background: COLORS[status],
                        borderRadius: 4,
                        border: "1px solid #ccc"
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
