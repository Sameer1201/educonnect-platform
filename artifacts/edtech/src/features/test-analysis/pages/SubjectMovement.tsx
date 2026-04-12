import { useRef } from "react";
import { subjectMovementData } from "@/data/testData";
import { SubjectSectionIcon } from "@/components/ui/subject-section-icon";

const subjectIcons: Record<string, React.ReactNode> = {
  physics: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636l12.728 12.728" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  chemistry: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  math: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={1.8}>
      <line x1="4" y1="9" x2="20" y2="9" strokeLinecap="round" />
      <line x1="4" y1="15" x2="14" y2="15" strokeLinecap="round" />
      <line x1="4" y1="6" x2="4" y2="12" strokeLinecap="round" />
      <line x1="19" y1="12" x2="19" y2="18" strokeLinecap="round" />
      <line x1="16" y1="15" x2="22" y2="15" strokeLinecap="round" />
    </svg>
  ),
};

const iconBorderColor: Record<string, string> = {
  physics:   "#22c55e",
  chemistry: "#f97316",
  math:      "#6366f1",
};

function fallbackIcon(label: string) {
  if (
    label.trim().toLowerCase().includes("aptitude") ||
    label.trim().toLowerCase().includes("technical") ||
    label.trim().toLowerCase().includes("core") ||
    label.trim().toLowerCase().includes("engineering math") ||
    label.trim().toLowerCase().includes("mathematics")
  ) {
    return <SubjectSectionIcon label={label} className="w-6 h-6" />;
  }
  const letter = label.trim().charAt(0).toUpperCase() || "S";
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#5B4DFF] text-xs font-semibold text-white">
      {letter}
    </span>
  );
}

export default function SubjectMovement() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
    }
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #e5e7eb", borderTop: "3px solid #111827" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: "none" }}>
        {/* Scrollable timeline */}
        <div
          ref={scrollRef}
          className="flex items-start gap-0 overflow-x-auto pb-4"
          style={{ scrollbarWidth: "none" }}
        >
          {subjectMovementData.map((step, i) => {
            const isLast = i === subjectMovementData.length - 1;
            const color = iconBorderColor[step.icon] || "#6366f1";
            return (
              <div key={i} className="flex items-start flex-shrink-0">
                {/* Node + content */}
                <div className="flex flex-col items-center" style={{ width: 160 }}>
                  {/* Icon circle */}
                  <div
                    className="w-14 h-14 rounded-full bg-white flex items-center justify-center flex-shrink-0 mb-3"
                    style={{ border: `2px solid ${color}`, boxShadow: `0 0 0 4px ${color}22` }}
                  >
                    {subjectIcons[step.icon] ?? fallbackIcon(step.subject)}
                  </div>
                  {/* Label */}
                  <p className="text-xs font-semibold text-gray-800 text-center leading-snug mb-1 px-1">
                    {step.label}
                  </p>
                  <p className="text-[11px] text-gray-500 text-center">{step.qsAttempted} Qs attempted</p>
                  <p className="text-[11px] text-gray-500 text-center">Spent {step.timeSpent}</p>
                </div>

                {/* Arrow connector */}
                {!isLast && (
                  <div className="flex items-center flex-shrink-0 mt-6" style={{ width: 48 }}>
                    <div className="flex-1 border-t-2 border-dashed border-gray-300" />
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-gray-100 mt-2">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs text-gray-500 font-medium">Swipe left right to view full journey</span>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
