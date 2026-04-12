import type { ReactNode } from "react";
import { BarChart3, Clock3, GaugeCircle, Sparkles, TrendingUp } from "lucide-react";

type Props = {
  compact?: boolean;
};

const subjectRows = [
  { label: "Physics", score: "91 / 100", width: "91%", color: "#22C55E" },
  { label: "Chemistry", score: "80 / 100", width: "80%", color: "#F97316" },
  { label: "Mathematics", score: "55 / 100", width: "55%", color: "#3B82F6" },
];

const attemptBars = [
  { label: "Perfect", value: 20, color: "#22C55E" },
  { label: "Wasted", value: 3, color: "#EF4444" },
  { label: "Overtime", value: 5, color: "#F97316" },
  { label: "Confused", value: 2, color: "#64748B" },
];

function StatCard({
  icon,
  label,
  value,
  subtle,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-[#E5E7EB] ${subtle ? "bg-[#FAFBFF]" : "bg-white"} p-4`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#5B4DFF]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-black text-[#111827]">{value}</p>
    </div>
  );
}

export default function AnalysisShowcase({ compact = false }: Props) {
  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#5B4DFF]">Advanced Test Analysis</p>
              <h3 className="mt-2 text-2xl font-black text-[#111827]">Performance Analysis</h3>
            </div>
            <div className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#5B4DFF]">
              Personal
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatCard icon={<TrendingUp size={15} />} label="Score" value="226 / 300" subtle />
            <StatCard icon={<GaugeCircle size={15} />} label="Percentile" value="99.9+" subtle />
            <StatCard icon={<Clock3 size={15} />} label="Time Taken" value="111 min" subtle />
          </div>

          <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-[#FAFBFF] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#111827]">Subject Breakdown</p>
              <span className="text-xs text-[#6B7280]">Planner-ready, section-aware insights</span>
            </div>
            <div className="mt-4 space-y-3">
              {subjectRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-[#111827]">{row.label}</span>
                    <span className="text-[#6B7280]">{row.score}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#EEF2F7]">
                    <div className="h-2.5 rounded-full" style={{ width: row.width, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#5B4DFF]">
            <Sparkles size={14} />
            Analysis Preview
          </div>
          <h4 className="mt-2 text-xl font-black text-[#111827]">Question Journey + Graphs</h4>
          <p className="mt-2 text-sm leading-6 text-[#6B7280]">
            Students get performance, attempt, difficulty, and time analysis with clear visual breakdowns after every test.
          </p>

          <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-[#FAFBFF] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#111827]">
              <BarChart3 size={16} className="text-[#5B4DFF]" />
              Attempts Over Time
            </div>
            <svg viewBox="0 0 320 160" className="h-40 w-full">
              <path d="M20 130 L90 120 L150 95 L220 60 L300 40" fill="none" stroke="#22C55E" strokeWidth="4" strokeLinecap="round" />
              <path d="M20 136 L90 132 L150 128 L220 118 L300 112" fill="none" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
              <path d="M20 138 L90 126 L150 108 L220 84 L300 58" fill="none" stroke="#3B82F6" strokeWidth="4" strokeLinecap="round" />
              {[20, 90, 150, 220, 300].map((x) => (
                <line key={x} x1={x} y1="24" x2={x} y2="140" stroke="#E5E7EB" strokeDasharray="4 6" />
              ))}
              {[40, 70, 100, 130].map((y) => (
                <line key={y} x1="20" y1={y} x2="300" y2={y} stroke="#E5E7EB" strokeDasharray="4 6" />
              ))}
            </svg>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFBFF] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Attempt Mix</p>
              <div className="mt-3 space-y-2">
                {attemptBars.map((bar) => (
                  <div key={bar.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[#111827]">{bar.label}</span>
                      <span className="font-medium text-[#6B7280]">{bar.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#EEF2F7]">
                      <div className="h-2 rounded-full" style={{ width: `${Math.max(bar.value * 10, 10)}%`, backgroundColor: bar.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFBFF] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Time Quality</p>
              <div className="mt-4 h-4 overflow-hidden rounded-full bg-[#EEF2F7]">
                <div className="flex h-full w-full">
                  <div className="h-full bg-[#22C55E]" style={{ width: "64%" }} />
                  <div className="h-full bg-[#F97316]" style={{ width: "18%" }} />
                  <div className="h-full bg-[#CBD5E1]" style={{ width: "18%" }} />
                </div>
              </div>
              <div className="mt-3 space-y-2 text-xs text-[#6B7280]">
                <div className="flex items-center justify-between"><span>Time on correct</span><span>71.2 min</span></div>
                <div className="flex items-center justify-between"><span>Time on incorrect</span><span>19.8 min</span></div>
                <div className="flex items-center justify-between"><span>Time on unattempted</span><span>20.0 min</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
