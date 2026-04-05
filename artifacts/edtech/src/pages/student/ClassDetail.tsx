import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useGetClass, useEnrollInClass, getGetClassQueryKey, getListClassesQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PenTool,
  Users,
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  BookOpen,
  Video,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  PlayCircle,
  Radio,
  FileText,
  Download,
  Loader2,
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
  enrolled: boolean;
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

export default function StudentClassDetail() {
  const { id } = useParams<{ id: string }>();
  const classId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState<number | null>(null);

  const { data: cls, isLoading } = useGetClass(classId, {
    query: { enabled: !!classId },
  });
  const enrollInClass = useEnrollInClass();

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

  const lectureEnrollMutation = useMutation({
    mutationFn: async ({ lectureId, enroll }: { lectureId: number; enroll: boolean }) => {
      const r = await fetch(`${BASE}/api/lectures/${lectureId}/enroll`, {
        method: enroll ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!r.ok && r.status !== 204) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects", classId] });
      toast({ title: "Updated!" });
    },
    onError: () => toast({ title: "Failed to update lecture enrollment", variant: "destructive" }),
  });

  const unenrollMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${classId}/enroll`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      toast({ title: "Unenrolled from class" });
    },
  });

  const handleEnroll = () => {
    enrollInClass.mutate({ id: classId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        toast({ title: "Enrolled successfully!" });
      },
      onError: (err: any) => {
        toast({ title: "Enrollment failed", description: err?.data?.error ?? "You may already be enrolled.", variant: "destructive" });
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

  const downloadMaterial = async (material: Material) => {
    setDownloading(material.id);
    try {
      const r = await fetch(`${BASE}/api/classes/${classId}/materials/${material.id}/download`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      const { fileData, name } = await r.json();
      const a = document.createElement("a");
      a.href = fileData;
      a.download = name;
      a.click();
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
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

  const isEnrolled = (cls as any).isEnrolled as boolean;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/student/classes">
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
            {isEnrolled && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <CheckCircle2 size={13} /> Enrolled
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{cls.subject} · by {cls.adminName}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isEnrolled ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => unenrollMutation.mutate()}
              disabled={unenrollMutation.isPending}
              data-testid="button-unenroll"
            >
              Unenroll
            </Button>
          ) : (
            <Button
              onClick={handleEnroll}
              disabled={enrollInClass.isPending || cls.status === "completed"}
              data-testid="button-enroll"
            >
              Enroll in Class
            </Button>
          )}
          {cls.status === "live" && isEnrolled && (
            <Button
              onClick={() => setLocation(`/student/live-class/${classId}`)}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-join-live"
            >
              <Radio size={16} className="mr-2" />
              Join Live Class
            </Button>
          )}
          {(cls.status === "live" || cls.status === "completed") && (
            <Button
              variant="outline"
              onClick={() => setLocation(`/student/whiteboard/${classId}`)}
              data-testid="button-open-whiteboard"
            >
              <PenTool size={16} className="mr-2" />
              Whiteboard
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cls.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{cls.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Users size={15} className="text-muted-foreground" />
              <span>{cls.enrolledCount}{cls.maxStudents ? `/${cls.maxStudents}` : ""} students enrolled</span>
            </div>
            {cls.scheduledAt && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock size={15} className="text-muted-foreground" />
                <span>{format(new Date(cls.scheduledAt), "MMMM d, yyyy h:mm a")}</span>
              </div>
            )}
          </div>
          {cls.meetingLink && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Meeting Link</p>
              <a
                href={cls.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
                data-testid="link-meeting"
              >
                <ExternalLink size={14} />
                {cls.meetingLink}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {materials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              Class Slides
              <Badge variant="secondary">{materials.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {materials.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <FileText size={15} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(m.uploadedAt), "MMM d, yyyy")}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs shrink-0"
                    disabled={downloading === m.id}
                    onClick={() => downloadMaterial(m)}
                    data-testid={`button-download-material-${m.id}`}
                  >
                    {downloading === m.id ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Download size={13} className="mr-1.5" />}
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen size={16} className="text-primary" />
            Subjects, Chapters & Lectures
            {subjects.length > 0 && (
              <Badge variant="secondary">{subjects.length} subject{subjects.length !== 1 ? "s" : ""}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subjectsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No subjects added yet. Check back later.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => {
                const subjectExpanded = expandedSubjects.has(subject.id);
                const enrolledLectures = subject.chapters.flatMap((chapter) => chapter.lectures).filter((lecture) => lecture.enrolled).length;
                return (
                  <div key={subject.id} className="rounded-xl border border-border overflow-hidden" data-testid={`subject-${subject.id}`}>
                    <button
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => toggleSubject(subject.id)}
                    >
                      {subjectExpanded ? <ChevronDown size={16} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={16} className="shrink-0 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{subject.title}</p>
                        {subject.description && <p className="text-xs text-muted-foreground mt-0.5">{subject.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{subject.chapters.length} chapters</span>
                        {enrolledLectures > 0 && (
                          <span className="text-xs font-medium text-primary flex items-center gap-1">
                            <CheckCircle2 size={11} /> {enrolledLectures} enrolled
                          </span>
                        )}
                      </div>
                    </button>

                    {subjectExpanded && (
                      <div className="border-t border-border bg-muted/20 p-3 space-y-3">
                        {subject.chapters.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No chapters added to this subject yet.</p>
                        ) : (
                          subject.chapters.map((chapter) => {
                            const chapterExpanded = expandedChapters.has(chapter.id);
                            return (
                              <div key={chapter.id} className="rounded-xl border border-border bg-background overflow-hidden">
                                <button
                                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                                  onClick={() => toggleChapter(chapter.id)}
                                >
                                  {chapterExpanded ? <ChevronDown size={15} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={15} className="shrink-0 text-muted-foreground" />}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{chapter.title}</p>
                                    {chapter.description && <p className="text-xs text-muted-foreground mt-0.5">{chapter.description}</p>}
                                  </div>
                                  <span className="text-xs text-muted-foreground">{chapter.lectures.length} lectures</span>
                                </button>

                                {chapterExpanded && (
                                  <div className="border-t border-border bg-muted/20 divide-y divide-border">
                                    {chapter.lectures.length === 0 ? (
                                      <p className="text-xs text-muted-foreground p-4">No lectures added to this chapter yet.</p>
                                    ) : (
                                      chapter.lectures.map((lecture) => (
                                        <div key={lecture.id} className="flex items-center gap-3 p-3 px-4" data-testid={`lecture-${lecture.id}`}>
                                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            {lecture.enrolled ? (
                                              <CheckCircle2 size={14} className="text-primary" />
                                            ) : (
                                              <PlayCircle size={14} className="text-muted-foreground" />
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{lecture.title}</p>
                                            {lecture.description && <p className="text-xs text-muted-foreground">{lecture.description}</p>}
                                            {lecture.videoUrl && (
                                              <a href={lecture.videoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                                                <Video size={11} /> Watch video
                                              </a>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs text-muted-foreground">{lecture.enrolledCount} enrolled</span>
                                            <Button
                                              size="sm"
                                              variant={lecture.enrolled ? "outline" : "default"}
                                              className={`h-7 text-xs px-3 ${lecture.enrolled ? "border-destructive text-destructive hover:bg-destructive hover:text-white" : ""}`}
                                              onClick={() => lectureEnrollMutation.mutate({ lectureId: lecture.id, enroll: !lecture.enrolled })}
                                              disabled={lectureEnrollMutation.isPending}
                                              data-testid={`button-lecture-${lecture.enrolled ? "unenroll" : "enroll"}-${lecture.id}`}
                                            >
                                              {lecture.enrolled ? "Unenroll" : "Enroll"}
                                            </Button>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
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
