// WidgetCustomizer.jsx
import React, { useState, useEffect } from "react";
import { ConceptMasteryHeatmap, LearningConsistencyScore, RiskPredictionIndicator } from "../../widgets";
import { httpFetch } from "../../lib/http";

const defaultWidgets = [
  { id: 'heatmap', label: 'Concept Mastery Heatmap', enabled: true },
  { id: 'consistency', label: 'Learning Consistency Score', enabled: true },
  { id: 'risk', label: 'Risk Prediction Indicator', enabled: true },
  { id: 'trend', label: 'Learning Trend', enabled: true },
  { id: 'comparison', label: 'Class Comparison', enabled: true }
];

import { useParams } from "react-router-dom";

export default function WidgetCustomizer({ selectedStudent }) {
  const [customizing, setCustomizing] = useState(false);
  const [widgets, setWidgets] = useState(defaultWidgets);
  const [status, setStatus] = useState("");
  const user = JSON.parse(localStorage.getItem("user"));
  const userId = user?.id;
const params = useParams();
const classIdRaw = params.id;
const classId = classIdRaw && typeof classIdRaw === "string"
  ? parseInt(classIdRaw.split(":")[0], 10)
  : null;
  // This component is used on the class detail page; persist per-class.

  // Load widgets from backend
  useEffect(() => {
  async function fetchWidgetSettings() {
    if (!userId) return;
    try {
      const url = classId
        ? `/api/widget-settings/${userId}?classId=${classId}`
        : `/api/widget-settings/${userId}`;
      let res = await httpFetch(url);
      let data = await res.json();
      if (data && Array.isArray(data.widgets)) {
        setWidgets(data.widgets);
      } else {
        setWidgets(defaultWidgets);
      }
    } catch (e) {
      setWidgets(defaultWidgets);
    }
  }
  fetchWidgetSettings();
}, [userId, classId]);



  function handleToggle(id) {
    setWidgets(widgets => widgets.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  }

  // Only render enabled widgets (after customizing is false)
  const enabledWidgets = widgets.filter(w => w.enabled);

  async function handleDone() {
    setCustomizing(false);
    if (!userId) return;
    setStatus("Saving...");
    try {
      const url = classId
        ? `/api/widget-settings/${userId}?classId=${classId}`
        : `/api/widget-settings/${userId}`;
      await httpFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets })
      });
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 1300);
    } catch {
      setStatus("Error saving");
    }
  }

  return (
    <div>
 <div className="flex items-center justify-between mb-4">
   <h2 className="text-lg font-semibold">Insights Widgets</h2>
   <div className="flex gap-3 items-center">
     {status && <span className="text-xs text-green-700">{status}</span>}
     <button
       className="px-3 py-1 rounded bg-gray-200 text-gray-900 font-medium"
       onClick={() => (customizing ? handleDone() : setCustomizing(true))}
     >
       {customizing ? "Done" : "Customize Widgets"}
     </button>
   </div>
 </div>
       {customizing && (
         <div className="mb-3 flex flex-wrap gap-4">
           {widgets.map(w => (
             <label key={w.id} className="flex items-center gap-2 cursor-pointer">
               <input type="checkbox" checked={w.enabled} onChange={() => handleToggle(w.id)} />
               {w.label}
             </label>
           ))}
         </div>
       )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        {/* Only render widgets when they are enabled. */}
        {enabledWidgets.map(w => {
          if (w.id === 'heatmap' && selectedStudent) {
            return (
              <div key={w.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 min-w-0">
                <h2 className="mb-4 text-base font-semibold text-gray-900 break-normal">Concept Mastery Heatmap</h2>
                <ConceptMasteryHeatmap
                  students={[selectedStudent]}
                  concepts={[
                    {id:'c1',label:'Algebra'},
                    {id:'c2',label:'Geometry'},
                    {id:'c3',label:'Statistics'}
                  ]}
                  mastery={{
                    [selectedStudent.id]: {c1:'mastered',c2:'progress',c3:'struggling'}
                  }}
                />
              </div>
            );
          }
          if (w.id === 'consistency' && selectedStudent) {
            return (
              <div key={w.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 min-w-0">
                <h2 className="mb-4 text-base font-semibold text-gray-900 break-normal">Learning Consistency Score</h2>
                <LearningConsistencyScore
                  name="Consistency Score"
                  score={selectedStudent.progress || 70}
                  timeseries={[
                    {date:"2024-05-19",value:1},
                    {date:"2024-05-20",value:1},
                    {date:"2024-05-21",value:0},
                    {date:"2024-05-22",value:1},
                    {date:"2024-05-23",value:1},
                    {date:"2024-05-24",value:0},
                    {date:"2024-05-25",value:1}
                  ]}
                />
              </div>
            );
          }
          if (w.id === 'risk' && selectedStudent) {
            return (
              <div key={w.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 min-w-0">
                <h2 className="mb-4 text-base font-semibold text-gray-900 break-normal">Risk Prediction Indicator</h2>
                <RiskPredictionIndicator
                  total={1}
                  atRisk={selectedStudent.progress < 70 ? 1 : 0}
                  students={[
                    {
                      id: selectedStudent.id,
                      name: selectedStudent.name,
                      riskLevel: selectedStudent.progress < 60 ? 'high' : selectedStudent.progress < 75 ? 'medium' : 'low',
                      riskScore: (100-Math.max(selectedStudent.progress,0))/100
                    },
                  ]}
                />
              </div>
            );
          }
          if (w.id === 'trend') {
            return (
              <div key={w.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 min-w-0 sm:col-span-2 xl:col-span-2">
                <h2 className="mb-4 text-base font-semibold text-gray-900 break-normal">Learning Trend</h2>
                <div style={{ height: 180 }}>
                  <svg width="100%" height="100%" viewBox="0 0 200 80">
                    <rect x="10" y="30" width="40" height="40" fill="#64748b" rx="4" />
                    <rect x="60" y="40" width="40" height="30" fill="#64748b" rx="4" />
                    <rect x="110" y="20" width="40" height="50" fill="#64748b" rx="4" />
                  </svg>
                </div>
                <div className="text-xs text-slate-600 mt-2 flex justify-around">
                  <span>Mon</span><span>Tue</span><span>Wed</span>
                </div>
              </div>
            );
          }
          if (w.id === 'comparison' && selectedStudent) {
            return (
              <div key={w.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 min-w-0">
                <h2 className="mb-4 text-base font-semibold text-gray-900 break-normal">Class Comparison</h2>
                <div>
                  <div className="text-sm text-gray-600">Class Average: 71%</div>
                  <div className="text-sm text-gray-600">Difference: 7%</div>
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
