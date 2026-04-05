import { useGetHRDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, BookOpen, UserCheck, TrendingUp, Zap, GraduationCap } from "lucide-react";
import { DashboardScene, TiltCard } from "@/components/dashboard-3d";

function StatCard({ title, value, sub, icon, color }: { title: string; value: number | string; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <TiltCard>
    <Card className="border-white/10 bg-white/[0.04] shadow-[0_18px_45px_rgba(15,23,42,0.24)] backdrop-blur-xl">
      <CardContent className="p-6 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
    </TiltCard>
  );
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`w-2 h-2 rounded-full ${i <= value ? "bg-primary" : "bg-muted"}`} />
      ))}
    </div>
  );
}

export default function HRDashboard() {
  const { data, isLoading } = useGetHRDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <DashboardScene accent="from-emerald-500/15 via-cyan-500/10 to-violet-500/15">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">HR Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Staff performance and workforce analytics</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Teachers"
          value={data.totalTeachers}
          icon={<UserCheck size={22} className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          title="Total Students"
          value={data.totalStudents}
          icon={<Users size={22} className="text-purple-600" />}
          color="bg-purple-50"
        />
        <StatCard
          title="Total Classes"
          value={data.totalClasses}
          icon={<BookOpen size={22} className="text-green-600" />}
          color="bg-green-50"
        />
        <StatCard
          title="Avg. Classes/Teacher"
          value={data.avgClassesPerTeacher}
          sub="classes per teacher"
          icon={<TrendingUp size={22} className="text-orange-600" />}
          color="bg-orange-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Teacher Performance Table */}
        <TiltCard className="lg:col-span-2">
        <Card className="lg:col-span-2 border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck size={16} className="text-primary" />
              Teacher Performance Overview ({data.teacherStats.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.teacherStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teachers registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Teacher</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Subject</th>
                      <th className="text-center py-2 pr-4 font-medium text-muted-foreground">Classes</th>
                      <th className="text-center py-2 pr-4 font-medium text-muted-foreground">Students</th>
                      <th className="text-center py-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teacherStats.map((teacher) => (
                      <tr key={teacher.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`teacher-row-${teacher.id}`}>
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-medium">{teacher.fullName}</p>
                            <p className="text-xs text-muted-foreground">@{teacher.username}</p>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {teacher.subject ?? <span className="italic text-xs">Not set</span>}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span className="font-semibold">{teacher.classCount}</span>
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span className="font-semibold">{teacher.studentCount}</span>
                        </td>
                        <td className="py-3 text-center">
                          {teacher.liveClasses > 0 ? (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit mx-auto">
                              <Zap size={11} />
                              {teacher.liveClasses} Live
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </TiltCard>

        {/* Top Students by Enrollment */}
        <TiltCard>
        <Card className="border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap size={16} className="text-primary" />
              Most Active Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topStudentsByEnrollment.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
            ) : (
              <div className="space-y-3">
                {data.topStudentsByEnrollment.map((student, idx) => (
                  <div key={student.id} className="flex items-center justify-between" data-testid={`top-student-${student.id}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? "bg-yellow-100 text-yellow-700" :
                        idx === 1 ? "bg-gray-100 text-gray-600" :
                        idx === 2 ? "bg-orange-100 text-orange-600" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground">@{student.username}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{student.enrolledCount} class{student.enrolledCount !== 1 ? "es" : ""}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </TiltCard>

        {/* Summary Metrics */}
        <TiltCard>
        <Card className="border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              Workforce Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Student-to-Teacher Ratio</span>
              <span className="font-semibold text-sm">
                {data.totalTeachers > 0
                  ? `${(data.totalStudents / data.totalTeachers).toFixed(1)}:1`
                  : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Classes per Student</span>
              <span className="font-semibold text-sm">
                {data.totalStudents > 0
                  ? (data.totalClasses / data.totalStudents).toFixed(1)
                  : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Active Teachers</span>
              <span className="font-semibold text-sm">
                {data.teacherStats.filter((t) => t.classCount > 0).length} / {data.totalTeachers}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Avg. Classes per Teacher</span>
              <span className="font-semibold text-sm">{data.avgClassesPerTeacher}</span>
            </div>
          </CardContent>
        </Card>
        </TiltCard>
      </div>
    </div>
    </DashboardScene>
  );
}
