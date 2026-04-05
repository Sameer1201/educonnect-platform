import { useListClasses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, Zap } from "lucide-react";

function statusColor(status: string) {
  if (status === "live") return "destructive";
  if (status === "scheduled") return "secondary";
  if (status === "completed") return "default";
  return "outline";
}

export default function SuperAdminClasses() {
  const { data: classes = [], isLoading } = useListClasses();

  const live = classes.filter((c) => c.status === "live");
  const scheduled = classes.filter((c) => c.status === "scheduled");
  const completed = classes.filter((c) => c.status === "completed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Classes</h1>
        <p className="text-muted-foreground text-sm mt-1">View all classes across all teachers</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <Zap size={18} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Live</p>
              <p className="text-2xl font-bold">{live.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <BookOpen size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="text-2xl font-bold">{scheduled.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <BookOpen size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completed.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Classes ({classes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes created yet.</p>
          ) : (
            <div className="space-y-2">
              {classes.map((cls) => (
                <div key={cls.id} className="flex items-center justify-between p-3 rounded-lg border border-border" data-testid={`class-row-${cls.id}`}>
                  <div>
                    <p className="text-sm font-medium">{cls.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {cls.subject} · by {cls.adminName ?? "Unknown"} ·{" "}
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} />{cls.enrolledCount} enrolled
                      </span>
                    </p>
                  </div>
                  <Badge variant={statusColor(cls.status) as any}>{cls.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
