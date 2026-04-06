import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const EXACT_ANALYSIS_URL = "http://127.0.0.1:4174";

interface AnalysisSection {
  id: number;
  title: string;
  subjectLabel?: string | null;
}

interface TestDetail {
  id: number;
  sections?: AnalysisSection[];
}

export default function StudentTestAnalysis() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<"checking" | "ready" | "down">("checking");

  const { data: test } = useQuery<TestDetail>({
    queryKey: ["student-analysis-test-meta", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!id,
  });

  const iframeUrl = useMemo(() => {
    const sectionLabels = (test?.sections ?? [])
      .map((section) => section.subjectLabel?.trim() || section.title?.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (sectionLabels.length === 0) return EXACT_ANALYSIS_URL;
    const params = new URLSearchParams();
    params.set("subjects", sectionLabels.join("|"));
    return `${EXACT_ANALYSIS_URL}?${params.toString()}`;
  }, [test]);

  useEffect(() => {
    let cancelled = false;

    fetch(EXACT_ANALYSIS_URL, { method: "GET" })
      .then((response) => {
        if (!cancelled) {
          setStatus(response.ok ? "ready" : "down");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("down");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9fafb]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-slate-600">Loading exact analysis dashboard...</p>
        </div>
      </div>
    );
  }

  if (status === "down") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9fafb] px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Exact analysis frontend is offline</h1>
          <p className="mt-2 text-sm text-slate-500">
            The standalone test-analysis app from your other project is not running on port 4174.
          </p>
          <div className="mt-4 flex justify-center">
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#f9fafb]">
      <iframe
        title="Exact Test Analysis"
        src={iframeUrl}
        className="h-full w-full border-0"
      />
    </div>
  );
}
