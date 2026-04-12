import { ArrowRight, Clock3, Layers3, Percent, Target, Trophy } from "lucide-react";
import { SubjectSectionIcon } from "@/components/ui/subject-section-icon";

interface HeaderProps {
  title: string;
  summary?: {
    testTitle?: string;
    scoreLabel?: string;
    accuracyLabel?: string;
    percentileLabel?: string;
    attemptedLabel?: string;
    timeLabel?: string;
    rankLabel?: string;
    sections?: Array<{ id: number; label: string; count?: number | null }>;
  };
  onViewSolutions?: () => void;
  viewSolutionsDisabled?: boolean;
  compact?: boolean;
}

const summaryItems = [
  { key: "scoreLabel", label: "Score", icon: Target },
  { key: "accuracyLabel", label: "Accuracy", icon: Percent },
  { key: "attemptedLabel", label: "Attempted", icon: Layers3 },
  { key: "timeLabel", label: "Time", icon: Clock3 },
  { key: "rankLabel", label: "Rank", icon: Trophy },
] as const;

export default function Header({
  title,
  summary,
  onViewSolutions,
  viewSolutionsDisabled = false,
  compact = false,
}: HeaderProps) {
  if (compact) {
    return (
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-[#111827]">{title}</h2>
        </div>
        <button
          onClick={onViewSolutions}
          disabled={viewSolutionsDisabled}
          className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-[#5B4DFF] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4C3FF0] disabled:cursor-not-allowed disabled:bg-[#C7C2FF] sm:self-auto"
        >
          View Solution
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm sm:mb-6 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6B7280]">Advanced Test Analysis</p>
          <h2 className="mt-2 text-xl font-bold text-[#111827] sm:text-[24px]">{title}</h2>
          {summary?.testTitle ? (
            <p className="mt-1 text-sm text-[#6B7280]">{summary.testTitle}</p>
          ) : null}
          {summary?.percentileLabel ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#F5F3FF] px-3 py-1 text-xs font-semibold text-[#5B4DFF]">
              <Percent className="h-3.5 w-3.5" />
              Predicted {summary.percentileLabel}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            onClick={onViewSolutions}
            disabled={viewSolutionsDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#5B4DFF] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4C3FF0] disabled:cursor-not-allowed disabled:bg-[#C7C2FF] sm:w-auto"
          >
            View Solution
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {summary ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {summaryItems
              .map(({ key, label, icon: Icon }) => {
                const value = summary[key];
                if (!value) return null;
                return (
                  <div key={key} className="rounded-2xl border border-[#EEF2FF] bg-[#FAFBFF] px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
                      <Icon className="h-3.5 w-3.5 text-[#5B4DFF]" />
                      {label}
                    </div>
                    <p className="mt-2 text-base font-semibold text-[#111827]">{value}</p>
                  </div>
                );
              })
              .filter(Boolean)}
          </div>

          {summary.sections?.length ? (
            <div className="flex flex-wrap gap-2">
              {summary.sections.map((section) => (
                <div
                  key={section.id}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#374151]"
                >
                  <span className="text-[#64748B]">
                    <SubjectSectionIcon label={section.label} className="h-3.5 w-3.5" />
                  </span>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#EEF2FF] text-[10px] font-semibold text-[#5B4DFF]">
                    {section.count ?? "•"}
                  </span>
                  {section.label}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
