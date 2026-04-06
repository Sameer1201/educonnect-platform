import { useState } from "react";
import { questionJourneyData, type QuestionVisit } from "@/data/testData";

function StatusIcon({ status }: { status: QuestionVisit["status"] }) {
  if (status === "correct") {
    return (
      <svg className="w-4 h-4 text-green-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" />
      </svg>
    );
  }
  if (status === "wrong") {
    return (
      <svg className="w-4 h-4 text-red-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M14 6l-8 8" />
      </svg>
    );
  }
  if (status === "skipped") {
    return (
      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 5l6 5-6 5V5zm7 0l6 5-6 5V5z" />
      </svg>
    );
  }
  if (status === "markedReview") {
    return (
      <svg className="w-3.5 h-4 text-indigo-500" viewBox="0 0 14 18" fill="currentColor">
        <path d="M0 0h14v18l-7-4-7 4V0z" />
      </svg>
    );
  }
  if (status === "unmarkedReview") {
    return (
      <svg className="w-3.5 h-4 text-indigo-300" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M1 1h12v15l-6-3.5L1 16V1z" />
      </svg>
    );
  }
  return null;
}

function QualityIcon({ quality }: { quality: QuestionVisit["quality"] }) {
  if (quality === "perfect") {
    return (
      <span className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-green-500">
        <svg className="w-2.5 h-2.5 text-green-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" />
        </svg>
      </span>
    );
  }
  if (quality === "wasted") {
    return (
      <span className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-red-500">
        <svg className="w-2.5 h-2.5 text-red-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M14 6l-8 8" />
        </svg>
      </span>
    );
  }
  if (quality === "overtime") {
    return (
      <span className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-orange-500">
        <svg className="w-2.5 h-2.5 text-orange-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="10" cy="10" r="7" />
          <path strokeLinecap="round" d="M10 6v4l2 2" />
        </svg>
      </span>
    );
  }
  if (quality === "confused") {
    return (
      <span className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-indigo-500">
        <svg className="w-2.5 h-2.5 text-indigo-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="10" cy="10" r="7" />
          <path strokeLinecap="round" d="M7 8c0-1.657 1.343-3 3-3s3 1.343 3 3c0 2-3 2-3 4" />
          <circle cx="10" cy="15" r="0.5" fill="currentColor" />
        </svg>
      </span>
    );
  }
  if (quality === "skipped") {
    return (
      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 5l6 5-6 5V5zm7 0l6 5-6 5V5z" />
      </svg>
    );
  }
  return null;
}

function QuestionBubble({
  visit,
  isLast,
  showQuality,
}: {
  visit: QuestionVisit;
  isLast: boolean;
  showQuality: boolean;
}) {
  return (
    <div className="flex items-center">
      <div className="flex flex-col items-center">
        <div className="relative">
          {visit.timesOpened && visit.timesOpened > 1 && (
            <span className="absolute -top-2 -right-2 text-[10px] font-bold text-indigo-500 leading-none z-10">
              {visit.timesOpened}
            </span>
          )}
          <div className="w-9 h-9 rounded-lg border border-gray-300 bg-white flex items-center justify-center text-sm font-medium text-gray-700 shadow-sm">
            {visit.questionNo}
          </div>
        </div>
        <div className="mt-1 h-5 flex items-center justify-center">
          {showQuality ? (
            <QualityIcon quality={visit.quality} />
          ) : (
            <StatusIcon status={visit.status} />
          )}
        </div>
      </div>
      {!isLast && (
        <div className="flex items-center -mt-5 mx-0.5">
          <svg width="36" height="14" viewBox="0 0 36 14" fill="none" className="text-gray-300">
            <line x1="0" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
            <path d="M22 4l6 3-6 3V4z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

const COLS = 12;

export default function QuestionJourney() {
  const [showQuality, setShowQuality] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5" style={{ borderTop: "3px solid #111827" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Qs Journey</h2>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-600">Show Quality of Attempt</span>
            <button
              role="switch"
              aria-checked={showQuality}
              onClick={() => setShowQuality((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                showQuality ? "bg-indigo-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  showQuality ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500 border-b border-gray-100 pb-4 mb-5">
          {!showQuality ? (
            <>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" /></svg>
                Answered Correct
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M14 6l-8 8" /></svg>
                Answered Wrong
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M4 5l6 5-6 5V5zm7 0l6 5-6 5V5z" /></svg>
                Skipped
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3.5 text-indigo-500" viewBox="0 0 14 18" fill="currentColor"><path d="M0 0h14v18l-7-4-7 4V0z" /></svg>
                Marked for Review
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3.5 text-indigo-300" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M1 1h12v15l-6-3.5L1 16V1z" /></svg>
                Unmarked for Review
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 border-green-500">
                  <svg className="w-2 h-2 text-green-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" /></svg>
                </span>
                Perfect
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 border-red-500">
                  <svg className="w-2 h-2 text-red-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M14 6l-8 8" /></svg>
                </span>
                Wasted
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 border-orange-500">
                  <svg className="w-2 h-2 text-orange-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="10" cy="10" r="7" /><path strokeLinecap="round" d="M10 6v4l2 2" /></svg>
                </span>
                Overtime
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 border-indigo-500">
                  <svg className="w-2 h-2 text-indigo-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="10" cy="10" r="7" /><path strokeLinecap="round" d="M7 8c0-1.657 1.343-3 3-3s3 1.343 3 3c0 2-3 2-3 4" /><circle cx="10" cy="15" r="0.5" fill="currentColor" /></svg>
                </span>
                Confused
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3.5 text-indigo-500" viewBox="0 0 14 18" fill="currentColor"><path d="M0 0h14v18l-7-4-7 4V0z" /></svg>
                Marked for Review
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3.5 text-indigo-300" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M1 1h12v15l-6-3.5L1 16V1z" /></svg>
                Unmarked for Review
              </span>
            </>
          )}
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] font-bold text-indigo-500 leading-none">2</span>
            <span className="w-6 h-6 rounded-md border border-gray-300 inline-flex items-center justify-center text-xs text-gray-500">Q</span>
            No of times you opened the question
          </span>
        </div>

        <div className="space-y-7">
          {questionJourneyData.map((interval) => {
            const rows: QuestionVisit[][] = [];
            for (let i = 0; i < interval.visits.length; i += COLS) {
              rows.push(interval.visits.slice(i, i + COLS));
            }
            return (
              <div key={interval.label}>
                <div className="flex items-center gap-2 mb-4">
                  {interval.icon === "flag" ? (
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v14M3 3l10 3-10 4" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <circle cx="10" cy="10" r="7" />
                      <path strokeLinecap="round" d="M10 6v4l2.5 2.5" />
                    </svg>
                  )}
                  <span className="text-sm font-semibold text-gray-700">{interval.label}</span>
                </div>
                <div className="space-y-5">
                  {rows.map((row, rowIdx) => (
                    <div key={rowIdx} className="flex flex-wrap items-start gap-y-1">
                      {row.map((visit, idx) => {
                        const globalIdx = rowIdx * COLS + idx;
                        const isLast = globalIdx === interval.visits.length - 1;
                        return (
                          <QuestionBubble
                            key={globalIdx}
                            visit={visit}
                            isLast={isLast}
                            showQuality={showQuality}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
