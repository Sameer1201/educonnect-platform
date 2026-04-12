import { useMemo, useState } from "react";
import { testData, comparativeData } from "@/data/testData";
import type { ViewMode } from "@/App";
import { SubjectSectionIcon } from "@/components/ui/subject-section-icon";

type CompTab = string;

function subjectColor(tab: string) {
  const value = tab.toLowerCase();
  if (value === "overall") return "#6366f1";
  if (value.includes("physics")) return "#22c55e";
  if (value.includes("chem")) return "#f97316";
  if (value.includes("math")) return "#3b82f6";
  if (value.includes("aptitude")) return "#0ea5e9";
  if (value.includes("core")) return "#8b5cf6";
  const palette = ["#6366f1", "#22c55e", "#f97316", "#3b82f6", "#8b5cf6", "#0ea5e9"];
  const hash = [...tab].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function tabIcon(tab: string) {
  const color = subjectColor(tab);
  const value = tab.toLowerCase();
  if (value === "overall") return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
  if (value.includes("aptitude") || value.includes("technical") || value.includes("core") || value.includes("engineering math") || value.includes("mathematics")) {
    return <span className="inline-flex" style={{ color }}><SubjectSectionIcon label={tab} className="w-4 h-4" /></span>;
  }
  if (value.includes("physics")) return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636l12.728 12.728" /><circle cx="12" cy="12" r="2" /></svg>;
  if (value.includes("chem")) return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>;
  if (value.includes("math")) return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}><line x1="4" y1="9" x2="20" y2="9" strokeLinecap="round" /><line x1="4" y1="15" x2="14" y2="15" strokeLinecap="round" /><line x1="4" y1="6" x2="4" y2="12" strokeLinecap="round" /><line x1="19" y1="12" x2="19" y2="18" strokeLinecap="round" /><line x1="16" y1="15" x2="22" y2="15" strokeLinecap="round" /></svg>;
  return <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: color }}>{tab.trim().charAt(0).toUpperCase() || "S"}</span>;
}

const subjectIcons: Record<string, React.ReactNode> = {
  overall: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ color: "#6366f1" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  physics: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ color: "#22c55e" }}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636l12.728 12.728" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  chemistry: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ color: "#f97316" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  math: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ color: "#6366f1" }}>
      <line x1="4" y1="9" x2="20" y2="9" strokeLinecap="round" />
      <line x1="4" y1="15" x2="14" y2="15" strokeLinecap="round" />
      <line x1="4" y1="6" x2="4" y2="12" strokeLinecap="round" />
      <line x1="19" y1="12" x2="19" y2="18" strokeLinecap="round" />
      <line x1="16" y1="15" x2="22" y2="15" strokeLinecap="round" />
    </svg>
  ),
};

const studentIcons: Record<string, React.ReactNode> = {
  user: (
    <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  top10: (
    <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M2 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
      <circle cx="17" cy="8" r="2.5" />
      <path strokeLinecap="round" d="M17 14c2.5 0 5 1.5 5 4.5" />
    </svg>
  ),
  top25: (
    <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M2 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
      <circle cx="17" cy="8" r="2.5" />
      <path strokeLinecap="round" d="M17 14c2.5 0 5 1.5 5 4.5" />
    </svg>
  ),
};

const accuracyTheme = { bar: "#22c55e", gradient: "linear-gradient(to right, transparent, rgba(34,197,94,0.18))" };

function subjectTheme(subject: string) {
  const bar = subjectColor(subject);
  return {
    bar,
    gradient: `linear-gradient(to right, transparent, ${bar}22)`,
  };
}

const CELL_BORDER = "1px solid #e5e7eb";

function AccentCell({
  value,
  total,
  subject,
  strong,
}: {
  value: number;
  total: number;
  subject: string;
  strong?: boolean;
}) {
  const theme = subjectTheme(subject);
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <td style={{ border: CELL_BORDER, padding: 0, minWidth: 130 }}>
      <div
        className="relative flex items-center overflow-hidden"
        style={{ padding: "14px 20px", minHeight: 56 }}
      >
        <div
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{ width: `${pct}%`, background: theme.gradient }}
        />
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={
            pct === 0
              ? { left: 0, width: "2.5px", background: theme.bar }
              : { left: `${pct}%`, width: "2.5px", background: theme.bar, transform: "translateX(-100%)" }
          }
        />
        <div className="relative flex items-baseline gap-1 z-10">
          <span
            className="font-bold text-gray-900 leading-none"
            style={{ fontSize: strong ? "20px" : "14px" }}
          >
            {value}
          </span>
          <span className="text-xs text-gray-400 font-normal">/ {total}</span>
        </div>
      </div>
    </td>
  );
}

function PlainCell({ value, total }: { value: number; total: number }) {
  return (
    <td style={{ border: CELL_BORDER, padding: "14px 20px" }}>
      <span className="text-sm text-gray-700">{value}</span>
      <span className="text-xs text-gray-400 ml-1">/ {total}</span>
    </td>
  );
}

function ScoreBarCell({ value, maxScore, subject }: { value: number; maxScore: number; subject: string }) {
  const theme = subjectTheme(subject);
  const pct = maxScore > 0 ? (value / maxScore) * 100 : 0;
  return (
    <td style={{ border: CELL_BORDER, padding: 0, minWidth: 160 }}>
      <div className="relative flex items-center overflow-hidden" style={{ padding: "14px 20px", minHeight: 56 }}>
        <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: `${pct}%`, background: theme.gradient }} />
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{ left: `${pct}%`, width: "2.5px", background: theme.bar, transform: "translateX(-100%)" }}
        />
        <div className="relative flex items-baseline gap-1 z-10">
          <span className="text-sm font-bold text-gray-900">{value}</span>
          <span className="text-xs text-gray-400">/ {maxScore}</span>
        </div>
      </div>
    </td>
  );
}

function AccuracyBarCell({ value }: { value: number }) {
  const pct = value;
  return (
    <td style={{ border: CELL_BORDER, padding: 0, minWidth: 130 }}>
      <div className="relative flex items-center overflow-hidden" style={{ padding: "14px 20px", minHeight: 56 }}>
        <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: `${pct}%`, background: accuracyTheme.gradient }} />
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{ left: `${pct}%`, width: "2.5px", background: accuracyTheme.bar, transform: "translateX(-100%)" }}
        />
        <div className="relative z-10">
          <span className="text-sm font-bold text-gray-900">{value}%</span>
        </div>
      </div>
    </td>
  );
}

function SubjectTabs({ active, onChange }: { active: CompTab; onChange: (t: CompTab) => void }) {
  const tabs = [...new Set(["Overall", ...testData.performanceBreakdown.filter((row) => row.subject !== "Overall").map((row) => row.subject)])] as CompTab[];
  return (
    <div className="flex gap-1 p-1" style={{ borderBottom: CELL_BORDER }}>
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{
              color: isActive ? subjectColor(tab) : "#6b7280",
              background: isActive ? `${subjectColor(tab)}14` : "transparent",
              border: isActive ? `1px solid ${subjectColor(tab)}4d` : "1px solid transparent",
            }}
          >
            {tabIcon(tab)}
            {tab}
          </button>
        );
      })}
    </div>
  );
}

function ComparativeView({ subject }: { subject: CompTab }) {
  const perfRows = comparativeData.performance[subject];
  const brkRows = comparativeData.breakdown[subject];

  const thStyle: React.CSSProperties = {
    border: CELL_BORDER,
    padding: "10px 20px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: "#6b7280",
    background: "#f9fafb",
    whiteSpace: "nowrap",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Test Performance */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #e5e7eb", borderTop: "3px solid #111827" }}>
        <div style={{ padding: "16px 24px", borderBottom: CELL_BORDER }}>
          <h3 className="text-base font-bold text-gray-900">Test Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 180 }}>Students</th>
                <th style={{ ...thStyle, minWidth: 160 }}>Score</th>
                <th style={{ ...thStyle, minWidth: 130 }}>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {perfRows.map((row) => (
                <tr key={row.student}>
                  <td style={{ border: CELL_BORDER, padding: "14px 20px" }}>
                    <div className="flex items-center gap-2.5">
                      {studentIcons[row.icon]}
                      <span className="text-sm font-semibold text-gray-800">{row.student}</span>
                    </div>
                  </td>
                  <ScoreBarCell value={row.score} maxScore={row.maxScore} subject={subject} />
                  <AccuracyBarCell value={row.accuracy} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test Breakdown */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #e5e7eb", borderTop: "3px solid #111827" }}>
        <div style={{ padding: "16px 24px", borderBottom: CELL_BORDER }}>
          <h3 className="text-base font-bold text-gray-900">Test Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 180 }}>Students</th>
                <th style={{ ...thStyle, minWidth: 140 }}>
                  <span style={{ color: "#22c55e" }}>Attempted<br />Correct</span>
                </th>
                <th style={{ ...thStyle, minWidth: 130 }}>
                  <span style={{ color: "#ef4444" }}>Attempted<br />Wrong</span>
                </th>
                <th style={{ ...thStyle, minWidth: 140 }}>
                  <span style={{ color: "#6366f1" }}>Not Attempted</span>
                </th>
                <th style={{ ...thStyle, minWidth: 120 }}>Not Visited Qs</th>
              </tr>
            </thead>
            <tbody>
              {brkRows.map((row) => (
                <tr key={row.student}>
                  <td style={{ border: CELL_BORDER, padding: "14px 20px" }}>
                    <div className="flex items-center gap-2.5">
                      {studentIcons[row.icon]}
                      <span className="text-sm font-semibold text-gray-800">{row.student}</span>
                    </div>
                  </td>
                  <AccentCell value={row.attemptedCorrect} total={row.totalQs} subject={subject} />
                  <AccentCell value={row.attemptedWrong} total={row.totalQs} subject={subject} />
                  <AccentCell value={row.notAttempted} total={row.totalQs} subject={subject} strong={row.notAttempted >= 10} />
                  <td style={{ border: CELL_BORDER, padding: "14px 20px" }}>
                    <span className="text-sm text-gray-400 italic">No data</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PerformanceAnalysis({ mode }: { mode: ViewMode }) {
  const { performanceBreakdown } = testData;
  const tabs = useMemo(() => [...new Set(["Overall", ...performanceBreakdown.filter((row) => row.subject !== "Overall").map((row) => row.subject)])] as CompTab[], [performanceBreakdown]);
  const [activeTab, setActiveTab] = useState<CompTab>(tabs[0] ?? "Overall");

  const thStyle: React.CSSProperties = {
    border: CELL_BORDER,
    padding: "10px 20px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: "#6b7280",
    background: "#f9fafb",
    whiteSpace: "nowrap" as const,
  };

  if (mode === "comparative") {
    return (
      <div className="flex flex-col gap-4">
        {/* Subject Tabs row */}
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #e5e7eb" }}>
          <SubjectTabs active={activeTab} onChange={setActiveTab} />
        </div>
        <ComparativeView subject={activeTab} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #e5e7eb", borderTop: "3px solid #111827" }}>
      <div style={{ padding: "16px 24px", borderBottom: CELL_BORDER }}>
        <h3 className="text-base font-bold text-gray-900">Test Breakdown</h3>
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 180 }}>Subject</th>
              <th style={{ ...thStyle, minWidth: 120 }}>Total Score</th>
              <th style={{ ...thStyle, minWidth: 140 }}>
                Attempted<br />Correct
              </th>
              <th style={{ ...thStyle, minWidth: 130 }}>
                Attempted<br />Wrong
              </th>
              <th style={{ ...thStyle, minWidth: 140 }}>Not Attempted</th>
              <th style={{ ...thStyle, minWidth: 120 }}>Not Visited Qs</th>
            </tr>
          </thead>
          <tbody>
            {performanceBreakdown.map((row) => {
              const theme = subjectTheme(row.subject);
              const totalPct = (row.totalScore / row.maxTotalScore) * 100;

              return (
                <tr key={row.subject}>
                  <td style={{ border: CELL_BORDER, padding: "14px 20px" }}>
                    <div className="flex items-center gap-2.5">
                      {subjectIcons[row.icon] ?? tabIcon(row.subject)}
                      <span className="text-sm font-semibold text-gray-800">{row.subject}</span>
                    </div>
                  </td>

                  <td style={{ border: CELL_BORDER, padding: 0, minWidth: 120 }}>
                    <div
                      className="relative flex items-center overflow-hidden"
                      style={{ padding: "14px 20px", minHeight: 56 }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 pointer-events-none"
                        style={{ width: `${totalPct}%`, background: theme.gradient }}
                      />
                      <div
                        className="absolute inset-y-0 pointer-events-none"
                        style={{
                          left: `${totalPct}%`,
                          width: "2.5px",
                          background: theme.bar,
                          transform: "translateX(-100%)",
                        }}
                      />
                      <div className="relative flex items-baseline gap-1 z-10">
                        <span className="text-sm font-bold text-gray-900">{row.totalScore}</span>
                        <span className="text-xs text-gray-400">/ {row.maxTotalScore}</span>
                      </div>
                    </div>
                  </td>

                  <AccentCell value={row.attemptedCorrect} total={row.totalQs} subject={row.subject} />
                  <AccentCell value={row.attemptedWrong} total={row.totalQs} subject={row.subject} />
                  <AccentCell
                    value={row.notAttempted}
                    total={row.totalQs}
                    subject={row.subject}
                    strong={row.notAttempted >= 10}
                  />
                  <AccentCell
                    value={row.notVisited}
                    total={row.totalQs}
                    subject={row.subject}
                    strong={row.notVisited >= 10}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
