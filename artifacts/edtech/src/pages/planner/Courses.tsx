import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BookOpen,
  CalendarClock,
  GraduationCap,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PlannerCourse {
  id: number;
  title: string;
  description?: string | null;
  subject: string;
  adminId: number;
  adminName?: string | null;
  status: string;
  scheduledAt?: string | null;
  maxStudents?: number | null;
  enrolledCount: number;
  meetingLink?: string | null;
}

interface TeacherUser {
  id: number;
  fullName: string;
  username: string;
  subject?: string | null;
}

interface CourseForm {
  title: string;
  subject: string;
  description: string;
  teacherId: string;
  maxStudents: string;
}

export default function PlannerCourses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<CourseForm>({
    title: "",
    subject: "",
    description: "",
    teacherId: "",
    maxStudents: "",
  });

  const { data: courses = [], isLoading } = useQuery<PlannerCourse[]>({
    queryKey: ["planner-courses"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/classes`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load courses");
      return response.json();
    },
  });

  const { data: teachers = [] } = useQuery<TeacherUser[]>({
    queryKey: ["planner-course-teachers"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/users?role=admin`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load teachers");
      return response.json();
    },
    staleTime: 30000,
  });

  const createCourse = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${BASE}/api/classes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          subject: form.subject.trim(),
          description: form.description.trim() || undefined,
          adminId: Number(form.teacherId),
          maxStudents: form.maxStudents ? Number(form.maxStudents) : undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to create course");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-courses"] });
      setOpen(false);
      setError("");
      setForm({ title: "", subject: "", description: "", teacherId: "", maxStudents: "" });
      toast({ title: "Course created", description: "Teacher assignment is now ready and subjects can be added next." });
    },
    onError: (err: any) => {
      setError(err.message ?? "Failed to create course");
    },
  });

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;

    return courses.filter((course) =>
      course.title.toLowerCase().includes(query) ||
      course.subject.toLowerCase().includes(query) ||
      (course.adminName ?? "").toLowerCase().includes(query),
    );
  }, [courses, search]);

  const scheduledCount = courses.filter((course) => course.scheduledAt).length;

  const handleCreate = () => {
    setError("");
    if (!form.title.trim() || !form.subject.trim() || !form.teacherId) {
      setError("Course name, exam/category, and teacher are required.");
      return;
    }
    createCourse.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white p-6 shadow-lg">
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              <GraduationCap size={12} />
              Planner Courses
            </div>
            <h1 className="text-3xl font-black mt-4">Create Courses, Assign Teachers, Structure Subjects</h1>
            <p className="text-sm text-white/75 mt-3 max-w-xl">
              Create courses, assign teachers, and prepare subject structure from one workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[260px]">
            <div className="rounded-2xl bg-white/10 backdrop-blur-sm p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-white/55">Courses</p>
              <p className="text-3xl font-black mt-1">{courses.length}</p>
            </div>
            <div className="rounded-2xl bg-white/10 backdrop-blur-sm p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-white/55">Scheduled</p>
              <p className="text-3xl font-black mt-1">{scheduledCount}</p>
            </div>
          </div>
        </div>
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-xl" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search course, category, or teacher…"
            className="pl-9"
          />
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus size={15} /> New Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Planner Course</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label>Course Name</Label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="e.g. GATE 2026"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Exam / Category</Label>
                <Input
                  value={form.subject}
                  onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                  placeholder="e.g. IIT JAM, Engineering Entrance"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Assign Teacher</Label>
                <select
                  value={form.teacherId}
                  onChange={(event) => setForm((prev) => ({ ...prev, teacherId: event.target.value }))}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.fullName} (@{teacher.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Planner notes about this course or batch…"
                  rows={4}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Max Students (optional)</Label>
                <Input
                  type="number"
                  value={form.maxStudents}
                  onChange={(event) => setForm((prev) => ({ ...prev, maxStudents: event.target.value }))}
                  placeholder="e.g. 60"
                />
              </div>

              <Button className="w-full" onClick={handleCreate} disabled={createCourse.isPending}>
                {createCourse.isPending ? "Creating..." : "Create Course"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen size={16} className="text-primary" />
            Planner-Owned Courses ({filteredCourses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-24 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {search ? "No courses matched your search." : "No planner courses created yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCourses.map((course) => (
                <div key={course.id} className="rounded-2xl border p-4 bg-card">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{course.title}</p>
                        <Badge variant="outline">{course.subject}</Badge>
                        <Badge variant={course.status === "live" ? "destructive" : course.status === "scheduled" ? "secondary" : "default"}>
                          {course.status}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} /> Teacher: {course.adminName ?? "Assigned teacher"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap size={12} /> {course.enrolledCount} enrolled
                        </span>
                        {course.scheduledAt && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock size={12} /> {format(new Date(course.scheduledAt), "MMM d, yyyy · h:mm a")}
                          </span>
                        )}
                      </div>

                      {course.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{course.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/planner/courses/${course.id}`}>
                        <Button variant="outline" size="sm">Manage Subjects</Button>
                      </Link>
                      <Link href="/schedule">
                        <Button size="sm">Schedule</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
