import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle2, BookOpen, Clock, TrendingUp, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Test {
  id: number;
  classId: number | null;
  title: string;
  durationMinutes: number;
  passingScore: number;
  isPublished: boolean;
  scheduledAt: string | null;
  className: string | null;
  createdAt: string;
  subjectName?: string | null;
  chapterName?: string | null;
}
interface Submission { id: number; studentName: string; studentUsername: string; score: number; totalPoints: number; percentage: number; passed: boolean; submittedAt: string; }

export default function SuperAdminTests() {
  const [resultsFor, setResultsFor] = useState<{ id: number; title: string } | null>(null);
  const [results, setResults] = useState<Submission[]>([]);

  const { data: tests = [], isLoading } = useQuery<Test[]>({
    queryKey: ["sa-tests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const openResults = async (test: Test) => {
    const r = await fetch(`${BASE}/api/tests/${test.id}/results`, { credentials: "include" });
    if (r.ok) setResults(await r.json());
    setResultsFor({ id: test.id, title: test.title });
  };

  const published = tests.filter((t) => t.isPublished).length;
  const totalClasses = new Set(tests.map((t) => t.classId).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList size={22} className="text-primary" />Tests Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform-wide test and quiz analytics</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Tests", value: tests.length, icon: <ClipboardList size={18} className="text-blue-600" />, bg: "bg-blue-50" },
          { label: "Published", value: published, icon: <CheckCircle2 size={18} className="text-green-600" />, bg: "bg-green-50" },
          { label: "Draft", value: tests.length - published, icon: <Clock size={18} className="text-yellow-600" />, bg: "bg-yellow-50" },
          { label: "Classes with Tests", value: totalClasses, icon: <BookOpen size={18} className="text-purple-600" />, bg: "bg-purple-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>{s.icon}</div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-2xl font-bold">{s.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 size={16} className="text-primary" />All Tests</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}</div>
          ) : tests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tests created yet.</p>
          ) : (
            <div className="space-y-2">
              {tests.map((test) => (
                <div key={test.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{test.title}</span>
                      <Badge variant={test.isPublished ? "default" : "secondary"} className="text-xs">
                        {test.isPublished ? "Published" : "Draft"}
                      </Badge>
                      {test.className && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.className}</span>}
                      {test.subjectName && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.subjectName}</span>}
                      {test.chapterName && <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{test.chapterName}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{test.durationMinutes} min</span>
                      <span>Pass: {test.passingScore}%</span>
                      {test.scheduledAt && <span>{format(new Date(test.scheduledAt), "MMM d, yyyy")}</span>}
                    </div>
                  </div>
                  <button
                    className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                    onClick={() => openResults(test)}
                    data-testid={`button-sa-results-${test.id}`}
                  >
                    <TrendingUp size={13} />View Results
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={resultsFor !== null} onOpenChange={(o) => !o && setResultsFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{resultsFor?.title} — Results</DialogTitle></DialogHeader>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No submissions yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${s.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {s.percentage}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.studentName}</p>
                    <p className="text-xs text-muted-foreground">@{s.studentUsername} · {format(new Date(s.submittedAt), "MMM d, h:mm a")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{s.score}/{s.totalPoints}</p>
                    <p className={`text-xs ${s.passed ? "text-green-600" : "text-red-600"}`}>{s.passed ? "Pass" : "Fail"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
