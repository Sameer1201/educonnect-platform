import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CourseDetail {
  id: number;
  title: string;
  description?: string | null;
  subject: string;
  workflowType?: string;
  adminName?: string | null;
  status: string;
  scheduledAt?: string | null;
  weeklyTargetQuestions?: number | null;
  weeklyTargetDeadline?: string | null;
  enrolledCount: number;
  maxStudents?: number | null;
  meetingLink?: string | null;
}

interface LectureItem {
  id: number;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  order: number;
}

interface ChapterItem {
  id: number;
  title: string;
  description?: string | null;
  targetQuestions?: number | null;
  order: number;
  lectures: LectureItem[];
}

interface SubjectItem {
  id: number;
  title: string;
  description?: string | null;
  order: number;
  teacherId?: number | null;
  teacherName?: string | null;
  teacherUsername?: string | null;
  chapters: ChapterItem[];
  lectures: LectureItem[];
}

interface EnrolledStudent {
  id: number;
  username: string;
  fullName: string;
  email: string;
}

interface TeacherUser {
  id: number;
  fullName: string;
  username: string;
}

export default function PlannerCourseDetail() {
  const { id } = useParams<{ id: string }>();
  const [location] = useLocation();
  const classId = Number(id);
  const isQuestionBankMode = location.startsWith("/planner/question-bank/");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [subjectOpen, setSubjectOpen] = useState(false);
  const [subjectTitle, setSubjectTitle] = useState("");
  const [subjectDescription, setSubjectDescription] = useState("");
  const [subjectTeacherId, setSubjectTeacherId] = useState("");
  const [subjectError, setSubjectError] = useState("");

  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());

  const [addChapterFor, setAddChapterFor] = useState<number | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDescription, setChapterDescription] = useState("");
  const [chapterTargetQuestions, setChapterTargetQuestions] = useState("");

  const [addLectureFor, setAddLectureFor] = useState<number | null>(null);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureDescription, setLectureDescription] = useState("");
  const [lectureVideoUrl, setLectureVideoUrl] = useState("");

  const { data: course, isLoading: courseLoading } = useQuery<CourseDetail>({
    queryKey: ["planner-course", classId],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/classes/${classId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load course");
      return response.json();
    },
    enabled: !!classId,
  });

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<SubjectItem[]>({
    queryKey: ["planner-course-subjects", classId],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/classes/${classId}/subjects`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load subjects");
      return response.json();
    },
    enabled: !!classId,
  });

  const { data: students = [] } = useQuery<EnrolledStudent[]>({
    queryKey: ["planner-course-students", classId],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/classes/${classId}/enrollments`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load students");
      return response.json();
    },
    enabled: !!classId,
  });

  const { data: teachers = [] } = useQuery<TeacherUser[]>({
    queryKey: ["planner-subject-teachers"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/users?role=admin`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load teachers");
      return response.json();
    },
    staleTime: 30000,
  });

  const invalidateSubjects = () => {
    queryClient.invalidateQueries({ queryKey: ["planner-course-subjects", classId] });
  };

  const addSubject = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${BASE}/api/classes/${classId}/subjects`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subjectTitle.trim(),
          description: subjectDescription.trim() || undefined,
          teacherId: isQuestionBankMode ? undefined : subjectTeacherId || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to add subject");
      }

      return response.json();
    },
    onSuccess: () => {
      invalidateSubjects();
      setSubjectOpen(false);
      setSubjectTitle("");
      setSubjectDescription("");
      setSubjectTeacherId("");
      setSubjectError("");
      toast({ title: "Subject added", description: "Now you can add chapters under this subject." });
    },
    onError: (err: any) => {
      setSubjectError(err.message ?? "Failed to add subject");
    },
  });

  const deleteSubject = useMutation({
    mutationFn: async (subjectId: number) => {
      const response = await fetch(`${BASE}/api/subjects/${subjectId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete subject");
      }
    },
    onSuccess: () => {
      invalidateSubjects();
      toast({ title: "Subject removed" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete subject", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const addChapter = useMutation({
    mutationFn: async (subjectId: number) => {
      const response = await fetch(`${BASE}/api/subjects/${subjectId}/chapters`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: chapterTitle.trim(),
          description: chapterDescription.trim() || undefined,
          targetQuestions: chapterTargetQuestions.trim() ? Math.max(Number(chapterTargetQuestions) || 0, 0) : 0,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to add chapter");
      }

      return response.json();
    },
    onSuccess: (_, subjectId) => {
      invalidateSubjects();
      setExpandedSubjects((prev) => new Set(prev).add(subjectId));
      setAddChapterFor(null);
      setChapterTitle("");
      setChapterDescription("");
      setChapterTargetQuestions("");
      toast({ title: "Chapter added" });
    },
    onError: (err: any) => {
      toast({ title: "Could not add chapter", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const deleteChapter = useMutation({
    mutationFn: async (chapterId: number) => {
      const response = await fetch(`${BASE}/api/chapters/${chapterId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete chapter");
      }
    },
    onSuccess: () => {
      invalidateSubjects();
      toast({ title: "Chapter removed" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete chapter", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const addLecture = useMutation({
    mutationFn: async (chapterId: number) => {
      const response = await fetch(`${BASE}/api/chapters/${chapterId}/lectures`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lectureTitle.trim(),
          description: lectureDescription.trim() || undefined,
          videoUrl: lectureVideoUrl.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to add lecture");
      }

      return response.json();
    },
    onSuccess: (_, chapterId) => {
      invalidateSubjects();
      setExpandedChapters((prev) => new Set(prev).add(chapterId));
      setAddLectureFor(null);
      setLectureTitle("");
      setLectureDescription("");
      setLectureVideoUrl("");
      toast({ title: "Lecture added" });
    },
    onError: (err: any) => {
      toast({ title: "Could not add lecture", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const deleteLecture = useMutation({
    mutationFn: async (lectureId: number) => {
      const response = await fetch(`${BASE}/api/lectures/${lectureId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete lecture");
      }
    },
    onSuccess: () => {
      invalidateSubjects();
      toast({ title: "Lecture removed" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete lecture", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const toggleSubject = (subjectId: number) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const toggleChapter = (chapterId: number) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const handleAddSubject = () => {
    setSubjectError("");
    if (!subjectTitle.trim()) {
      setSubjectError("Subject name is required.");
      return;
    }
    if (!isQuestionBankMode && !subjectTeacherId.trim()) {
      setSubjectError("Subject teacher is required.");
      return;
    }
    addSubject.mutate();
  };

  if (courseLoading || !course) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
        <div className="h-48 rounded-2xl bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={isQuestionBankMode ? "/planner/question-bank" : "/planner/courses"}>
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{course.title}</h1>
            <Badge variant="outline">{course.subject}</Badge>
            <Badge variant={course.status === "live" ? "destructive" : course.status === "scheduled" ? "secondary" : "default"}>
              {course.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Assigned teacher: {course.adminName ?? "Teacher not available"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{isQuestionBankMode ? "Question Bank Summary" : "Course Summary"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {course.description && (
              <p className="text-sm text-muted-foreground">{course.description}</p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {isQuestionBankMode && (
                <>
                  {course.weeklyTargetQuestions ? (
                    <div className="inline-flex items-center gap-2">
                      <BookOpen size={15} className="text-muted-foreground" />
                      <span>Weekly target: {course.weeklyTargetQuestions} questions</span>
                    </div>
                  ) : null}
                  {course.weeklyTargetDeadline ? (
                    <div className="inline-flex items-center gap-2">
                      <CalendarClock size={15} className="text-muted-foreground" />
                      <span>Deadline: {format(new Date(course.weeklyTargetDeadline), "MMMM d, yyyy h:mm a")}</span>
                    </div>
                  ) : null}
                </>
              )}
              {!isQuestionBankMode && (
                <div className="inline-flex items-center gap-2">
                  <Users size={15} className="text-muted-foreground" />
                  <span>{course.enrolledCount}{course.maxStudents ? ` / ${course.maxStudents}` : ""} students</span>
                </div>
              )}
              {course.scheduledAt && (
                <div className="inline-flex items-center gap-2">
                  <CalendarClock size={15} className="text-muted-foreground" />
                  <span>{format(new Date(course.scheduledAt), "MMMM d, yyyy h:mm a")}</span>
                </div>
              )}
            </div>
            {!isQuestionBankMode && (
              <div className="pt-2">
                <Link href="/schedule">
                  <Button variant="outline" size="sm">Open Planner Schedule</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {!isQuestionBankMode && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={16} className="text-primary" />
                Enrolled Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
              ) : (
                <div className="space-y-2">
                  {students.slice(0, 6).map((student) => (
                    <div key={student.id} className="rounded-lg bg-muted/50 p-2.5">
                      <p className="text-sm font-medium">{student.fullName}</p>
                      <p className="text-xs text-muted-foreground">@{student.username}</p>
                    </div>
                  ))}
                  {students.length > 6 && (
                    <p className="text-xs text-muted-foreground">+{students.length - 6} more students</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen size={16} className="text-primary" />
            {isQuestionBankMode ? "Question Bank Structure" : "Course Curriculum"} ({subjects.length} subject{subjects.length !== 1 ? "s" : ""})
          </CardTitle>

          <Dialog open={subjectOpen} onOpenChange={setSubjectOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus size={14} /> {isQuestionBankMode ? "Add Subject Card" : "Add Subject"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{isQuestionBankMode ? "Add Subject Card" : "Add Subject to Course"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {subjectError && (
                  <Alert variant="destructive">
                    <AlertDescription>{subjectError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label>{isQuestionBankMode ? "Subject Card Name" : "Subject Name"}</Label>
                  <Input value={subjectTitle} onChange={(event) => setSubjectTitle(event.target.value)} placeholder={isQuestionBankMode ? "e.g. Physics, Chemistry, Core Subject" : "e.g. Mathematics, Organic Chemistry"} />
                </div>

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={subjectDescription} onChange={(event) => setSubjectDescription(event.target.value)} placeholder="Planner notes or scope for this subject…" rows={4} />
                </div>

                {!isQuestionBankMode && (
                  <div className="space-y-1.5">
                    <Label>Subject Teacher</Label>
                    <select
                      value={subjectTeacherId}
                      onChange={(event) => setSubjectTeacherId(event.target.value)}
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
                )}

                <Button className="w-full" onClick={handleAddSubject} disabled={addSubject.isPending}>
                  {addSubject.isPending ? "Adding..." : isQuestionBankMode ? "Add Subject Card" : "Add Subject"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {subjectsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-20 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : subjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">No subjects added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => {
                const subjectExpanded = expandedSubjects.has(subject.id);
                const totalLectures = subject.chapters.reduce((sum, chapter) => sum + chapter.lectures.length, 0);

                return (
                  <div key={subject.id} className="rounded-2xl border overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                      <button className="mt-1" onClick={() => toggleSubject(subject.id)}>
                        {subjectExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{subject.title}</p>
                          <Badge variant="secondary">{subject.chapters.length} chapters</Badge>
                          <Badge variant="outline">{totalLectures} lectures</Badge>
                          {subject.teacherName && <Badge variant="outline">Teacher: {subject.teacherName}</Badge>}
                        </div>
                        {subject.description && (
                          <p className="text-sm text-muted-foreground mt-2">{subject.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAddChapterFor(subject.id);
                            setExpandedSubjects((prev) => new Set(prev).add(subject.id));
                          }}
                        >
                          <Plus size={13} className="mr-1" />
                          Chapter
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete subject "${subject.title}" with all chapters and lectures?`)) {
                              deleteSubject.mutate(subject.id);
                            }
                          }}
                          disabled={deleteSubject.isPending}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>

                    {subjectExpanded && (
                      <div className="border-t bg-muted/20 p-4 space-y-3">
                        {subject.chapters.map((chapter) => {
                          const chapterExpanded = expandedChapters.has(chapter.id);
                          return (
                            <div key={chapter.id} className="rounded-xl border bg-background overflow-hidden">
                              <div className="flex items-start gap-3 p-3">
                                <button className="mt-1" onClick={() => toggleChapter(chapter.id)}>
                                  {chapterExpanded ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                                </button>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold">{chapter.title}</p>
                                    <Badge variant="secondary">{chapter.lectures.length} lectures</Badge>
                                    {isQuestionBankMode && (chapter.targetQuestions ?? 0) > 0 && (
                                      <Badge variant="outline">Target {chapter.targetQuestions}</Badge>
                                    )}
                                  </div>
                                  {chapter.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{chapter.description}</p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setAddLectureFor(chapter.id);
                                      setExpandedChapters((prev) => new Set(prev).add(chapter.id));
                                    }}
                                  >
                                    <Plus size={13} className="mr-1" />
                                    Lecture
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => {
                                      if (confirm(`Delete chapter "${chapter.title}" and all its lectures?`)) {
                                        deleteChapter.mutate(chapter.id);
                                      }
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </div>
                              </div>

                              {chapterExpanded && (
                                <div className="border-t bg-muted/20 p-3 space-y-2">
                                  {chapter.lectures.length === 0 && addLectureFor !== chapter.id && (
                                    <p className="text-xs text-muted-foreground">No lectures added. Lecture is optional for this chapter.</p>
                                  )}

                                  {chapter.lectures.map((lecture) => (
                                    <div key={lecture.id} className="rounded-lg border bg-background p-3 flex items-start gap-3">
                                      <div className="mt-0.5 rounded-full bg-primary/10 p-2">
                                        <Video size={14} className="text-primary" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{lecture.title}</p>
                                        {lecture.description && (
                                          <p className="text-xs text-muted-foreground mt-1">{lecture.description}</p>
                                        )}
                                        {lecture.videoUrl && (
                                          <a href={lecture.videoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-flex">
                                            {lecture.videoUrl}
                                          </a>
                                        )}
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => {
                                          if (confirm(`Delete lecture "${lecture.title}"?`)) {
                                            deleteLecture.mutate(lecture.id);
                                          }
                                        }}
                                      >
                                        <Trash2 size={13} />
                                      </Button>
                                    </div>
                                  ))}

                                  {addLectureFor === chapter.id && (
                                    <div className="rounded-lg border bg-background p-3 space-y-2">
                                      <p className="text-xs font-medium">Add Lecture (Optional)</p>
                                      <Input placeholder="Lecture title *" value={lectureTitle} onChange={(event) => setLectureTitle(event.target.value)} />
                                      <Input placeholder="Description" value={lectureDescription} onChange={(event) => setLectureDescription(event.target.value)} />
                                      <Input placeholder="Video URL" value={lectureVideoUrl} onChange={(event) => setLectureVideoUrl(event.target.value)} />
                                      <div className="flex gap-2">
                                        <Button size="sm" disabled={!lectureTitle.trim() || addLecture.isPending} onClick={() => addLecture.mutate(chapter.id)}>
                                          {addLecture.isPending ? "Saving..." : "Save Lecture"}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setAddLectureFor(null);
                                            setLectureTitle("");
                                            setLectureDescription("");
                                            setLectureVideoUrl("");
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {addChapterFor === subject.id && (
                          <div className="rounded-xl border bg-background p-3 space-y-2">
                            <p className="text-xs font-medium">Add Chapter</p>
                            <Input placeholder="Chapter title *" value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} />
                            <Textarea placeholder="Description" rows={3} value={chapterDescription} onChange={(event) => setChapterDescription(event.target.value)} />
                            {isQuestionBankMode && (
                              <Input
                                type="number"
                                min={0}
                                placeholder="Target questions"
                                value={chapterTargetQuestions}
                                onChange={(event) => setChapterTargetQuestions(event.target.value)}
                              />
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" disabled={!chapterTitle.trim() || addChapter.isPending} onClick={() => addChapter.mutate(subject.id)}>
                                {addChapter.isPending ? "Saving..." : "Save Chapter"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAddChapterFor(null);
                                  setChapterTitle("");
                                  setChapterDescription("");
                                  setChapterTargetQuestions("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
