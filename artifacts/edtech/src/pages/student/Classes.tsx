import { useListClasses, useEnrollInClass, getListClassesQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, CalendarClock, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function statusColor(status: string) {
  if (status === "live") return "destructive";
  if (status === "scheduled") return "secondary";
  if (status === "completed") return "default";
  return "outline";
}

export default function StudentClasses() {
  const { data: classes = [], isLoading } = useListClasses();
  const enrollInClass = useEnrollInClass();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const unenrollMutation = useMutation({
    mutationFn: async (classId: number) => {
      const r = await fetch(`${BASE}/api/classes/${classId}/enroll`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to unenroll");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      toast({ title: "Unenrolled successfully" });
    },
    onError: () => toast({ title: "Failed to unenroll", variant: "destructive" }),
  });

  const available = classes.filter((c) => c.status !== "cancelled");

  const handleEnroll = (id: number, title: string) => {
    enrollInClass.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        toast({ title: "Enrolled!", description: `You are now enrolled in "${title}".` });
      },
      onError: (err: any) => {
        toast({ title: "Enrollment failed", description: err?.data?.error ?? "You may already be enrolled.", variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Browse Classes</h1>
        <p className="text-muted-foreground text-sm mt-1">Explore and enroll in available classes</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen size={16} className="text-primary" />
            Available Classes ({available.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes available at the moment. Check back later.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {available.map((cls) => {
                const isEnrolled = (cls as any).isEnrolled as boolean;
                return (
                  <div key={cls.id} className={`p-4 rounded-xl border bg-card hover:shadow-md transition-shadow ${isEnrolled ? "border-primary/40 bg-primary/5" : "border-border"}`} data-testid={`class-card-${cls.id}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{cls.title}</p>
                          {isEnrolled && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                              <CheckCircle2 size={12} /> Enrolled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{cls.subject} · by {cls.adminName ?? "Teacher"}</p>
                      </div>
                      <Badge variant={statusColor(cls.status) as any} className="ml-2 shrink-0">{cls.status}</Badge>
                    </div>
                    {cls.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{cls.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <Users size={12} />{cls.enrolledCount}{cls.maxStudents ? `/${cls.maxStudents}` : ""} students
                      </span>
                      {cls.scheduledAt && (
                        <span className="flex items-center gap-1">
                          <CalendarClock size={12} />{format(new Date(cls.scheduledAt), "MMM d")}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/student/class/${cls.id}`}>
                        <Button variant="outline" size="sm" data-testid={`button-view-${cls.id}`}>View</Button>
                      </Link>
                      {isEnrolled ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => unenrollMutation.mutate(cls.id)}
                          disabled={unenrollMutation.isPending}
                          data-testid={`button-unenroll-${cls.id}`}
                        >
                          Unenroll
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleEnroll(cls.id, cls.title)}
                          disabled={enrollInClass.isPending || cls.status === "completed"}
                          data-testid={`button-enroll-${cls.id}`}
                        >
                          Enroll
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
