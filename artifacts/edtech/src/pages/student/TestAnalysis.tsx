import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { ViewMode } from "@/App";
import { setAnalysisDataset, resetAnalysisDataset } from "@/data/testData";
import { buildAnalysisDataset } from "@/features/test-analysis/buildAnalysisDataset";
import Sidebar from "@/features/test-analysis/components/Sidebar";
import Header from "@/features/test-analysis/components/Header";
import Overview from "@/features/test-analysis/pages/Overview";
import PerformanceAnalysis from "@/features/test-analysis/pages/PerformanceAnalysis";
import TimeAnalysis from "@/features/test-analysis/pages/TimeAnalysis";
import AttemptAnalysis from "@/features/test-analysis/pages/AttemptAnalysis";
import DifficultyAnalysis from "@/features/test-analysis/pages/DifficultyAnalysis";
import SubjectMovement from "@/features/test-analysis/pages/SubjectMovement";
import QuestionJourney from "@/features/test-analysis/pages/QuestionJourney";
import QsByQsAnalysis from "@/features/test-analysis/pages/QsByQsAnalysis";

const pageTitles: Record<string, string> = {
  overview: "Overview",
  performance: "Performance Analysis",
  time: "Time Analysis",
  attempt: "Attempt Analysis",
  difficulty: "Difficulty Analysis",
  subject: "Subject Movement",
  journey: "Question Journey",
  qsbyqs: "Qs by Qs Analysis",
};

function renderPage(activeTab: string, mode: ViewMode) {
  switch (activeTab) {
    case "overview":
      return <Overview mode={mode} />;
    case "performance":
      return <PerformanceAnalysis mode={mode} />;
    case "time":
      return <TimeAnalysis mode={mode} />;
    case "attempt":
      return <AttemptAnalysis mode={mode} />;
    case "difficulty":
      return <DifficultyAnalysis mode={mode} />;
    case "subject":
      return <SubjectMovement />;
    case "journey":
      return <QuestionJourney />;
    case "qsbyqs":
      return <QsByQsAnalysis />;
    default:
      return <Overview mode={mode} />;
  }
}

export default function StudentTestAnalysis() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("overview");
  const [mode, setMode] = useState<ViewMode>("personal");
  const [datasetReady, setDatasetReady] = useState(false);

  const analysisQuery = useQuery({
    queryKey: ["student-analysis", id],
    queryFn: async () => {
      const response = await fetch(`/api/tests/${id}/my-analysis`, { credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load analysis");
      }
      return response.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!analysisQuery.data) {
      setDatasetReady(false);
      return;
    }
    const dataset = buildAnalysisDataset(analysisQuery.data);
    setAnalysisDataset(dataset);
    setDatasetReady(true);
    return () => resetAnalysisDataset();
  }, [analysisQuery.data]);

  if (analysisQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#5B4DFF] border-t-transparent" />
          <p className="text-sm text-[#6B7280]">Loading test analysis...</p>
        </div>
      </div>
    );
  }

  if (analysisQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB] px-6">
        <div className="max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#111827]">Unable to load analysis</h1>
          <p className="mt-2 text-sm text-[#6B7280]">
            {analysisQuery.error instanceof Error ? analysisQuery.error.message : "Something went wrong while loading your test analysis."}
          </p>
          <button
            onClick={() => analysisQuery.refetch()}
            className="mt-4 rounded-full bg-[#5B4DFF] px-5 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(91,77,255,0.25)]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!datasetReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#5B4DFF] border-t-transparent" />
          <p className="text-sm text-[#6B7280]">Preparing analysis dataset...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F5F7FB]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} mode={mode} onModeChange={setMode} />
      <main className="flex-1 overflow-auto p-7">
        <Header title={pageTitles[activeTab] || "Overview"} />
        {renderPage(activeTab, mode)}
      </main>
    </div>
  );
}
