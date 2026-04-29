import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, CheckCircle2, BookOpen, Clock, TrendingUp, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Test {
  id: number;
  classId: number | null;
  title: string;
  durationMinutes: number;
  passingScore: number | null;
  isPublished: boolean;
  syncQuestionBankOnPublish?: boolean | null;
  isStudentVisible?: boolean | null;
  scheduledAt: string | null;
  className: string | null;
  createdAt: string;
  subjectName?: string | null;
  chapterName?: string | null;
}
interface Submission { id: number; studentName: string; studentUsername: string; score: number; totalPoints: number; percentage: number; passed: boolean; submittedAt: string; }

export default function SuperAdminTests() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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

    const updateTestOptions = useMutation({
      mutationFn: async ({
        id,
        syncQuestionBankOnPublish,
        isStudentVisible,
      }: {
        id: number;
        syncQuestionBankOnPublish?: boolean;
        isStudentVisible?: boolean;
      }) => {
        const body: Record<string, boolean> = {};
        if (syncQuestionBankOnPublish !== undefined) body.syncQuestionBankOnPublish = syncQuestionBankOnPublish;
        if (isStudentVisible !== undefined) body.isStudentVisible = isStudentVisible;
        const response = await fetch(`${BASE}/api/tests/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(await response.text() || "Failed to update test options");
        return response.json();
      },
      onMutate: async (variables) => {
        await queryClient.cancelQueries({ queryKey: ["sa-tests"] });
        const previousTests = queryClient.getQueryData<Test[]>(["sa-tests"]);
        queryClient.setQueryData<Test[]>(["sa-tests"], (current = []) =>
          current.map((test) =>
            test.id === variables.id
              ? {
                  ...test,
                  ...(variables.syncQuestionBankOnPublish !== undefined ? { syncQuestionBankOnPublish: variables.syncQuestionBankOnPublish } : {}),
                  ...(variables.isStudentVisible !== undefined ? { isStudentVisible: variables.isStudentVisible } : {}),
                }
              : test,
          ),
        );
        return { previousTests };
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["sa-tests"] });
        queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
        queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
        queryClient.invalidateQueries({ queryKey: ["admin-question-bank"] });
        toast({ title: "Test controls updated" });
      },
      onError: (error: Error, _variables, context) => {
        if (context?.previousTests) queryClient.setQueryData(["sa-tests"], context.previousTests);
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
      },
    });

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
                {tests.map((test) => {
                  const isStudentVisible = test.isStudentVisible !== false;
                  const syncQuestionBankOnPublish = test.syncQuestionBankOnPublish !== false;
                  return (
                  <div key={test.id} className="flex flex-col gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors lg:flex-row lg:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{test.title}</span>
                      <Badge variant={test.isPublished ? "default" : "secondary"} className="text-xs">
                        {test.isPublished ? "Published" : "Draft"}
                      </Badge>
                        {test.className && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.className}</span>}
                        {test.subjectName && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.subjectName}</span>}
                        {test.chapterName && <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{test.chapterName}</span>}
                        {!isStudentVisible && <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Hidden from students</span>}
                        {!syncQuestionBankOnPublish && <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Q Bank sync off</span>}
                      </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{test.durationMinutes} min</span>
                      <span>{test.passingScore == null ? "No pass cutoff" : `Pass: ${test.passingScore}%`}</span>
                      {test.scheduledAt && <span>{format(new Date(test.scheduledAt), "MMM d, yyyy")}</span>}
                    </div>
                  </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 font-medium">
                          <Checkbox
                            checked={isStudentVisible}
                            disabled={updateTestOptions.isPending}
                            className="border-[#D97706] data-[state=checked]:bg-[#D97706] data-[state=checked]:text-white"
                            onCheckedChange={(checked) => updateTestOptions.mutate({ id: test.id, isStudentVisible: Boolean(checked) })}
                            aria-label={`Show ${test.title} to students`}
                          />
                          Students
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 font-medium">
                          <Checkbox
                            checked={syncQuestionBankOnPublish}
                            disabled={updateTestOptions.isPending}
                            className="border-[#D97706] data-[state=checked]:bg-[#D97706] data-[state=checked]:text-white"
                            onCheckedChange={(checked) => updateTestOptions.mutate({ id: test.id, syncQuestionBankOnPublish: Boolean(checked) })}
                            aria-label={`Auto-sync ${test.title} to question bank on publish`}
                          />
                          Q Bank
                        </label>
                      </div>
                      <button
                        className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                        onClick={() => openResults(test)}
                        data-testid={`button-sa-results-${test.id}`}
                      >
                        <TrendingUp size={13} />View Results
                      </button>
                    </div>
                  </div>
                  );
                })}
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
