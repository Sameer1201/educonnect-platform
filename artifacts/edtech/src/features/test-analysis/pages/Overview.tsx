import { Info, Plus } from "lucide-react";
import { testData } from "@/data/testData";
import { useState, useEffect, useRef } from "react";

function AccuracyRing({ pct }: { pct: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(circumference - (pct / 100) * circumference);
    }, 120);
    return () => clearTimeout(timer);
  }, [pct, circumference]);

  const restart = () => {
    setOffset(circumference);
    setTimeout(() => setOffset(circumference - (pct / 100) * circumference), 30);
  };

  return (
    <svg
      width="28" height="28" viewBox="0 0 28 28"
      className="cursor-pointer"
      onMouseEnter={() => { setHovered(true); restart(); }}
      onMouseLeave={() => setHovered(false)}
      onClick={restart}
      style={{ transition: "transform 0.15s", transform: hovered ? "scale(1.2)" : "scale(1)" }}
    >
      {/* Track */}
      <circle cx="14" cy="14" r={radius} fill="none" stroke="#d1fae5" strokeWidth="3" />
      {/* Animated fill */}
      <circle
        ref={ref}
        cx="14" cy="14" r={radius}
        fill="none"
        stroke="#22c55e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 14 14)"
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
      />
      {/* Center check */}
      <path
        d="M10 14l2.5 2.5 5.5-5"
        stroke={hovered ? "#22c55e" : "#4ade80"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ transition: "stroke 0.2s" }}
      />
    </svg>
  );
}

const StatCard = ({
  label,
  icon,
  value,
  sub,
  extra,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  sub?: string;
  extra?: React.ReactNode;
}) => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-2" style={{ borderTop: "3px solid #111827" }}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <Info className="w-3.5 h-3.5 text-gray-400" />
    </div>
    <div className="flex items-end justify-between">
      <div className="text-[32px] font-bold text-gray-900 leading-none">{value}</div>
      {extra}
    </div>
    {sub && <p className="text-xs text-gray-500">{sub}</p>}
  </div>
);

export default function Overview({ mode: _mode }: { mode?: string }) {
  const [learnings, setLearnings] = useState<string[]>(["", ""]);
  const subjectCards = testData.subjectSummaries.slice(0, 3);

  const handleLearningChange = (index: number, value: string) => {
    const updated = [...learnings];
    updated[index] = value;
    setLearnings(updated);
  };

  const addLearning = () => {
    if (learnings.length < 3) {
      setLearnings([...learnings, ""]);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: Overall Score + Predicted Percentile */}
      <div className="grid grid-cols-2 gap-4">
        {/* Overall Score Card */}
        <div className="bg-white rounded-xl border border-gray-100 p-5" style={{ borderTop: "3px solid #111827" }}>
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Overall Score</h3>
            <div className="w-14 h-14 rounded-full border-2 border-indigo-200 flex items-center justify-center bg-indigo-50">
              <span className="text-[9px] font-bold text-indigo-600 text-center leading-tight">INDIA'S BEST<br/>TEST SERIES</span>
            </div>
          </div>
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-[52px] font-black text-indigo-600 leading-none">{testData.overallScore}</span>
            <span className="text-xl font-semibold text-gray-400">/{testData.maxScore}</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            {subjectCards.map((subject) => (
              <div key={subject.key}>
                <p className="text-[11px] text-gray-500 font-medium">{subject.label}</p>
                <p className="text-base font-bold" style={{ color: subject.color }}>
                  {subject.score}<span className="text-xs font-medium text-gray-400">/{subject.max}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Predicted Percentile Card */}
        <div className="rounded-xl p-5 text-white overflow-hidden relative" style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)" }}>
          {/* Decorative circles */}
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white opacity-5" />
          <div className="absolute -right-4 top-4 w-20 h-20 rounded-full bg-white opacity-5" />
          <div className="absolute right-10 -bottom-6 w-16 h-16 rounded-full bg-white opacity-5" />

          <h3 className="text-sm font-semibold text-indigo-100 mb-2">Quizrr Predicted Percentile</h3>
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-[52px] font-black text-white leading-none">{testData.predictedPercentile}</span>
            <span className="text-2xl font-bold text-indigo-200">+</span>
          </div>
          <div className="flex items-center gap-6 mb-3 flex-wrap">
            {subjectCards.map((subject) => (
              <div key={`${subject.key}-percentile`}>
                <p className="text-[11px] text-indigo-200">{subject.label}</p>
                <p className="text-sm font-bold text-white">{subject.percentile}%ile</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-indigo-200 leading-relaxed">
            Predicted percentile adapts based on this paper structure and available submission data.
          </p>
        </div>
      </div>

      {/* Stats Row 1 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Leaderboard Rank"
          icon={<svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          value={
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-black text-gray-900 leading-none">{testData.leaderboardRank}</span>
              <span className="text-sm text-gray-400 font-medium">/{testData.totalParticipants.toLocaleString()}</span>
            </div>
          }
          extra={
            <button className="flex items-center gap-1 text-xs text-indigo-600 font-semibold border border-indigo-200 px-2.5 py-1 rounded-full hover:bg-indigo-50 transition-colors">
              View
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          }
        />
        <StatCard
          label="Qs Attempted"
          icon={<svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
          value={
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-black text-gray-900 leading-none">{testData.questionsAttempted}</span>
              <span className="text-sm text-gray-400 font-medium">/{testData.totalQuestions}</span>
            </div>
          }
        />
        <StatCard
          label="Accuracy"
          icon={<AccuracyRing pct={testData.accuracy} />}
          value={<span className="text-[32px] font-black text-gray-900 leading-none">{testData.accuracy}%</span>}
        />
      </div>

      {/* Stats Row 2 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Positive Score"
          icon={<svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>}
          value={
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-black text-gray-900 leading-none">{testData.positiveScore}</span>
              <span className="text-sm text-gray-400 font-medium">/{testData.maxScore}</span>
            </div>
          }
        />
        <StatCard
          label="Marks Lost"
          icon={<svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          value={
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-black text-gray-900 leading-none">{testData.marksLost}</span>
              <span className="text-sm text-gray-400 font-medium">/{testData.maxScore}</span>
            </div>
          }
        />
        <StatCard
          label="Time Taken"
          icon={<svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" /></svg>}
          value={
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-black text-gray-900 leading-none">{testData.timeTaken}</span>
              <span className="text-sm text-gray-400 font-medium">min</span>
            </div>
          }
        />
      </div>

      {/* Learnings Card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5" style={{ borderTop: "3px solid #111827" }}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Note Down Your Learnings</h3>
            <p className="text-xs text-gray-500 mt-0.5">Add up to 3 things you learned in this test</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
          {learnings.map((learning, index) => (
            <button
              key={index}
              className="flex items-center gap-2 w-full text-left px-3 py-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors group"
              onClick={() => {
                const val = prompt("Enter your learning:");
                if (val !== null) handleLearningChange(index, val);
              }}
            >
              <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-400">
                {learning || "Click to add your learnings"}
              </span>
            </button>
          ))}
          {learnings.length < 3 && (
            <button
              className="flex items-center gap-2 w-full text-left px-3 py-3 border border-dashed border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-400 text-sm mt-1"
              onClick={addLearning}
            >
              <Plus className="w-4 h-4" />
              Add another learning
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
