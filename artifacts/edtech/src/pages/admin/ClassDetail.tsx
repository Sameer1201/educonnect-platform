import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  useGetClass,
  useGetClassEnrollments,
  useStartClass,
  useEndClass,
  getGetClassQueryKey,
  getListClassesQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Play,
  Square,
  PenTool,
  Users,
  ArrowLeft,
  CalendarClock,
  BookOpen,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Video,
  Radio,
  FileText,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Material {
  id: number;
  name: string;
  mimeType: string;
  uploadedAt: string;
}

interface LectureItem {
  id: number;
  title: string;
  description: string | null;
  videoUrl: string | null;
  order: number;
  enrolledCount: number;
}

interface ChapterItem {
  id: number;
  title: string;
  description: string | null;
  order: number;
  lectures: LectureItem[];
}

interface SubjectItem {
  id: number;
  title: string;
  description: string | null;
  order: number;
  chapters: ChapterItem[];
  lectures: LectureItem[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminClassDetail() {
  const { id } = useParams<{ id: string }>();
  const classId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [subjectTitle, setSubjectTitle] = useState("");
  const [subjectDesc, setSubjectDesc] = useState("");

  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());

  const [addChapterFor, setAddChapterFor] = useState<number | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDesc, setChapterDesc] = useState("");

  const [addLectureFor, setAddLectureFor] = useState<number | null>(null);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureDesc, setLectureDesc] = useState("");
  const [lectureVideo, setLectureVideo] = useState("");

  const { data: cls, isLoading } = useGetClass(classId, { query: { enabled: !!classId } });
  const { data: students = [] } = useGetClassEnrollments(classId, { query: { enabled: !!classId } });
  const startClass = useStartClass();
  const endClass = useEndClass();

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["materials", classId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${classId}/materials`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!classId,
  });

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<SubjectItem[]>({
    queryKey: ["subjects", classId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${classId}/subjects`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch subjects");
      return r.json();
    },
    enabled: !!classId,
  });

  const invalidateSubjects = () => {
    queryClient.invalidateQueries({ queryKey: ["subjects", classId] });
  };

  const deleteClassMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${classId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok && r.status !== 204) throw new Error("Failed to delete class");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      toast({ title: "Class deleted successfully" });
      setLocation("/admin/classes");
    },
    onError: () => toast({ title: "Failed to delete class", variant: "destructive" }),
  });

  const addSubjectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${classId}/subjects`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: subjectTitle.trim(), description: subjectDesc.trim() || null }),
      });
      if (!r.ok) throw new Error("Failed to add subject");
      return r.json();
    },
    onSuccess: () => {
      invalidateSubjects();
      setAddSubjectOpen(false);
      setSubjectTitle("");
      setSubjectDesc("");
      toast({ title: "Subject added" });
    },
    onError: () => toast({ title: "Failed to add subject", variant: "destructive" }),
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: async (subjectId: number) => {
      const r = await fetch(`${BASE}/api/subjects/${subjectId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      invalidateSubjects();
      toast({ title: "Subject deleted" });
    },
  });

  const addChapterMutation = useMutation({
    mutationFn: async (subjectId: number) => {
      const r = await fetch(`${BASE}/api/subjects/${subjectId}/chapters`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: chapterTitle.trim(), description: chapterDesc.trim() || null }),
      });
      if (!r.ok) throw new Error("Failed to add chapter");
      return r.json();
    },
    onSuccess: (_, subjectId) => {
      invalidateSubjects();
      setExpandedSubjects((prev) => new Set(prev).add(subjectId));
      setAddChapterFor(null);
      setChapterTitle("");
      setChapterDesc("");
      toast({ title: "Chapter added" });
    },
    onError: () => toast({ title: "Failed to add chapter", variant: "destructive" }),
  });

  const deleteChapterMutation = useMutation({
    mutationFn: async (chapterId: number) => {
      const r = await fetch(`${BASE}/api/chapters/${chapterId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      invalidateSubjects();
      toast({ title: "Chapter deleted" });
    },
  });

  const addLectureMutation = useMutation({
    mutationFn: async (chapterId: number) => {
      const r = await fetch(`${BASE}/api/chapters/${chapterId}/lectures`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lectureTitle.trim(),
          description: lectureDesc.trim() || null,
          videoUrl: lectureVideo.trim() || null,
        }),
      });
      if (!r.ok) throw new Error("Failed to add lecture");
      return r.json();
    },
    onSuccess: (_, chapterId) => {
      invalidateSubjects();
      setExpandedChapters((prev) => new Set(prev).add(chapterId));
      setAddLectureFor(null);
      setLectureTitle("");
      setLectureDesc("");
      setLectureVideo("");
      toast({ title: "Lecture added" });
    },
    onError: () => toast({ title: "Failed to add lecture", variant: "destructive" }),
  });

  const deleteLectureMutation = useMutation({
    mutationFn: async (lectureId: number) => {
      const r = await fetch(`${BASE}/api/lectures/${lectureId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      invalidateSubjects();
      toast({ title: "Lecture deleted" });
    },
  });

  const handleStart = () => {
    startClass.mutate({ id: classId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        toast({ title: "Class is now live!" });
      },
    });
  };

  const handleEnd = () => {
    endClass.mutate({ id: classId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        toast({ title: "Class ended" });
      },
    });
  };

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!cls) return <p className="text-muted-foreground">Class not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/classes">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{cls.title}</h1>
            <Badge variant={cls.status === "live" ? "destructive" : cls.status === "scheduled" ? "secondary" : "default"}>
              {cls.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{cls.subject}</p>
        </div>
        <div className="flex items-center gap-2">
          {cls.status === "scheduled" && (
            <Button onClick={handleStart} disabled={startClass.isPending} data-testid="button-start-class">
              <Play size={16} className="mr-2" />
              Start Class
            </Button>
          )}
          {cls.status === "live" && (
            <>
              <Button
                onClick={() => setLocation(`/admin/live-class/${classId}`)}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-go-live"
              >
                <Radio size={16} className="mr-2" />
                Go Live
              </Button>
              <Button variant="destructive" onClick={handleEnd} disabled={endClass.isPending} data-testid="button-end-class">
                <Square size={16} className="mr-2" />
                End Class
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setLocation(`/admin/whiteboard/${classId}`)} data-testid="button-open-whiteboard">
            <PenTool size={16} className="mr-2" />
            Whiteboard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={deleteClassMutation.isPending}
            onClick={() => {
              if (confirm(`Delete "${cls.title}"? This will permanently remove the class and all its data.`)) {
                deleteClassMutation.mutate();
              }
            }}
            data-testid="button-delete-class"
          >
            <Trash2 size={15} className="mr-1" />
            {deleteClassMutation.isPending ? "Deleting..." : "Delete Class"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Class Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cls.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{cls.description}</p>
              </div>
            )}
            {cls.scheduledAt && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock size={15} className="text-muted-foreground" />
                <span>Scheduled: {format(new Date(cls.scheduledAt), "MMMM d, yyyy h:mm a")}</span>
              </div>
            )}
            {cls.meetingLink && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Meeting Link</p>
                <a href={cls.meetingLink} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline" data-testid="link-meeting">
                  {cls.meetingLink}
                </a>
              </div>
            )}
            {cls.maxStudents && (
              <div className="flex items-center gap-2 text-sm">
                <Users size={15} className="text-muted-foreground" />
                <span>Capacity: {cls.enrolledCount}/{cls.maxStudents}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={16} className="text-primary" />
              Enrolled ({students.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
            ) : (
              <div className="space-y-2">
                {students.map((student: any) => (
                  <div key={student.id} className="text-sm p-2 rounded bg-muted/50" data-testid={`enrolled-student-${student.id}`}>
                    <p className="font-medium">{student.fullName}</p>
                    <p className="text-xs text-muted-foreground">@{student.username}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen size={16} className="text-primary" />
              Subjects, Chapters & Lectures
            </CardTitle>
            <Button size="sm" onClick={() => setAddSubjectOpen(true)} data-testid="button-add-subject">
              <Plus size={14} className="mr-1" />
              Add Subject
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {subjectsLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No subjects yet. Add your first subject to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => {
                const subjectExpanded = expandedSubjects.has(subject.id);
                const totalLectures = subject.chapters.reduce((sum, chapter) => sum + chapter.lectures.length, 0);

                return (
                  <div key={subject.id} className="rounded-xl border border-border overflow-hidden" data-testid={`subject-${subject.id}`}>
                    <div className="flex items-center gap-2 p-3">
                      <button
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => toggleSubject(subject.id)}
                      >
                        {subjectExpanded ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{subject.title}</p>
                          {subject.description && <p className="text-xs text-muted-foreground">{subject.description}</p>}
                        </div>
                        <Badge variant="secondary" className="ml-2">{subject.chapters.length} chapters</Badge>
                        <Badge variant="outline">{totalLectures} lectures</Badge>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setAddChapterFor(subject.id);
                            setExpandedSubjects((prev) => new Set(prev).add(subject.id));
                          }}
                          data-testid={`button-add-chapter-${subject.id}`}
                        >
                          <Plus size={13} className="mr-1" /> Chapter
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete subject "${subject.title}" and all chapters?`)) {
                              deleteSubjectMutation.mutate(subject.id);
                            }
                          }}
                          data-testid={`button-delete-subject-${subject.id}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>

                    {subjectExpanded && (
                      <div className="border-t border-border bg-muted/20 p-3 space-y-3">
                        {subject.chapters.map((chapter) => {
                          const chapterExpanded = expandedChapters.has(chapter.id);
                          return (
                            <div key={chapter.id} className="rounded-xl border border-border bg-background overflow-hidden">
                              <div className="flex items-center gap-2 p-3">
                                <button
                                  className="flex items-center gap-2 flex-1 text-left"
                                  onClick={() => toggleChapter(chapter.id)}
                                >
                                  {chapterExpanded ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                                  <div>
                                    <p className="font-medium text-sm">{chapter.title}</p>
                                    {chapter.description && <p className="text-xs text-muted-foreground">{chapter.description}</p>}
                                  </div>
                                  <Badge variant="secondary">{chapter.lectures.length} lectures</Badge>
                                </button>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => {
                                      setAddLectureFor(chapter.id);
                                      setExpandedChapters((prev) => new Set(prev).add(chapter.id));
                                    }}
                                  >
                                    <Plus size={13} className="mr-1" /> Lecture
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      if (confirm(`Delete chapter "${chapter.title}"?`)) {
                                        deleteChapterMutation.mutate(chapter.id);
                                      }
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </div>
                              </div>

                              {chapterExpanded && (
                                <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                                  {chapter.lectures.length === 0 && addLectureFor !== chapter.id ? (
                                    <p className="text-xs text-muted-foreground">No lectures yet. Lecture is optional for this chapter.</p>
                                  ) : (
                                    chapter.lectures.map((lecture) => (
                                      <div key={lecture.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background" data-testid={`lecture-${lecture.id}`}>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium">{lecture.title}</p>
                                          {lecture.description && <p className="text-xs text-muted-foreground">{lecture.description}</p>}
                                          {lecture.videoUrl && (
                                            <a href={lecture.videoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                                              <Video size={11} /> {lecture.videoUrl}
                                            </a>
                                          )}
                                        </div>
                                        <span className="text-xs text-muted-foreground shrink-0">{lecture.enrolledCount} enrolled</span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-destructive hover:text-destructive shrink-0"
                                          onClick={() => {
                                            if (confirm(`Delete lecture "${lecture.title}"?`)) {
                                              deleteLectureMutation.mutate(lecture.id);
                                            }
                                          }}
                                          data-testid={`button-delete-lecture-${lecture.id}`}
                                        >
                                          <Trash2 size={13} />
                                        </Button>
                                      </div>
                                    ))
                                  )}

                                  {addLectureFor === chapter.id && (
                                    <div className="p-3 space-y-2 bg-background rounded-lg border border-border">
                                      <p className="text-xs font-medium">New Lecture</p>
                                      <Input
                                        placeholder="Lecture title *"
                                        value={lectureTitle}
                                        onChange={(e) => setLectureTitle(e.target.value)}
                                        className="h-8 text-sm"
                                        data-testid="input-lecture-title"
                                      />
                                      <Input
                                        placeholder="Description (optional)"
                                        value={lectureDesc}
                                        onChange={(e) => setLectureDesc(e.target.value)}
                                        className="h-8 text-sm"
                                        data-testid="input-lecture-desc"
                                      />
                                      <Input
                                        placeholder="Video URL (optional)"
                                        value={lectureVideo}
                                        onChange={(e) => setLectureVideo(e.target.value)}
                                        className="h-8 text-sm"
                                        data-testid="input-lecture-video"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs"
                                          disabled={!lectureTitle.trim() || addLectureMutation.isPending}
                                          onClick={() => addLectureMutation.mutate(chapter.id)}
                                          data-testid="button-save-lecture"
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-xs"
                                          onClick={() => {
                                            setAddLectureFor(null);
                                            setLectureTitle("");
                                            setLectureDesc("");
                                            setLectureVideo("");
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
                          <div className="p-3 space-y-2 bg-background rounded-lg border border-border">
                            <p className="text-xs font-medium">New Chapter</p>
                            <Input
                              placeholder="Chapter title *"
                              value={chapterTitle}
                              onChange={(e) => setChapterTitle(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Textarea
                              placeholder="Description (optional)"
                              value={chapterDesc}
                              onChange={(e) => setChapterDesc(e.target.value)}
                              rows={3}
                              className="text-sm resize-none"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={!chapterTitle.trim() || addChapterMutation.isPending}
                                onClick={() => addChapterMutation.mutate(subject.id)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setAddChapterFor(null);
                                  setChapterTitle("");
                                  setChapterDesc("");
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

      {materials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              Uploaded Slides ({materials.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {materials.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <FileText size={15} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground">Uploaded {format(new Date(m.uploadedAt), "MMM d, yyyy")}</p>
                  </div>
                  <Download size={15} className="text-muted-foreground" />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Go Live to upload or manage slides for students.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Subject Title *</label>
              <Input
                value={subjectTitle}
                onChange={(e) => setSubjectTitle(e.target.value)}
                placeholder="e.g. Algebra, Organic Chemistry, World History"
                className="mt-1"
                data-testid="input-subject-title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <Textarea
                value={subjectDesc}
                onChange={(e) => setSubjectDesc(e.target.value)}
                placeholder="Brief description..."
                rows={2}
                className="mt-1 resize-none"
                data-testid="input-subject-desc"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setAddSubjectOpen(false)}>Cancel</Button>
              <Button
                disabled={!subjectTitle.trim() || addSubjectMutation.isPending}
                onClick={() => addSubjectMutation.mutate()}
                data-testid="button-save-subject"
              >
                {addSubjectMutation.isPending ? "Adding..." : "Add Subject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
