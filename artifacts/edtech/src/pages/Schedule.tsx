import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, CalendarDays, BookOpen, ClipboardList, Plus, CalendarClock, Trash2 } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday,
  format, parseISO,
} from "date-fns";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type CalendarEventType = "class" | "test" | "lecture_plan";

interface CalEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  status?: string;
  linkId: number;
  isScheduled?: boolean;
  subject?: string;
  description?: string | null;
  teacherName?: string | null;
  plannerName?: string | null;
}

interface TeacherUser {
  id: number;
  fullName: string;
  username: string;
}

interface CourseClass {
  id: number;
  title: string;
  subject: string;
  adminName?: string | null;
  scheduledAt?: string | null;
}

interface PlannerScheduleForm {
  eventType: "class" | "meeting";
  title: string;
  subject: string;
  description: string;
  scheduledAt: string;
  teacherId: string;
  classId: string;
  meetingLink: string;
}

function eventColor(type: CalendarEventType) {
  if (type === "class") return "bg-blue-100 text-blue-700";
  if (type === "test") return "bg-orange-100 text-orange-700";
  return "bg-emerald-100 text-emerald-700";
}

function eventIcon(type: CalendarEventType) {
  if (type === "class") return <BookOpen size={15} className="text-blue-600" />;
  if (type === "test") return <ClipboardList size={15} className="text-orange-600" />;
  return <CalendarClock size={15} className="text-emerald-600" />;
}

export default function Schedule() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: platformSettings } = usePlatformSettings(!!user);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<PlannerScheduleForm>({
    eventType: "class",
    title: "",
    subject: "",
    description: "",
    scheduledAt: "",
    teacherId: "",
    classId: "",
    meetingLink: "",
  });

  const isPlanner = user?.role === "planner";
  const learningAccessEnabled = platformSettings?.learningAccessEnabled ?? true;

  const { data: rawEvents = [], isLoading } = useQuery<CalEvent[]>({
    queryKey: ["calendar"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/calendar`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 60000,
  });

  const events = (user?.role === "student" || user?.role === "admin") && !learningAccessEnabled
    ? rawEvents.filter((event) => event.type !== "class")
    : rawEvents;

  const { data: teachers = [] } = useQuery<TeacherUser[]>({
    queryKey: ["planner-teachers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/users?role=admin`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load teachers");
      return r.json();
    },
    enabled: isPlanner,
    staleTime: 30000,
  });

  const { data: plannerClasses = [] } = useQuery<CourseClass[]>({
    queryKey: ["planner-classes"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/classes`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load classes");
      return r.json();
    },
    enabled: isPlanner,
    staleTime: 30000,
  });

  const createPlannerScheduleItem = useMutation({
    mutationFn: async (payload: PlannerScheduleForm) => {
      if (payload.eventType === "class") {
        const r = await fetch(`${BASE}/api/classes/${payload.classId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduledAt: payload.scheduledAt,
            meetingLink: payload.meetingLink.trim() || undefined,
            status: "scheduled",
          }),
        });

        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to schedule class");
        }

        return r.json();
      }

      const r = await fetch(`${BASE}/api/lecture-plans`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title.trim(),
          subject: payload.subject.trim(),
          description: payload.description.trim() || undefined,
          scheduledAt: payload.scheduledAt,
          teacherId: Number(payload.teacherId),
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create management meeting");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["planner-classes"] });
      toast({
        title: form.eventType === "class" ? "Class scheduled" : "Management meeting created",
        description: form.eventType === "class"
          ? "The assigned teacher and enrolled students will now see the class timing."
          : "The assigned teacher and super admin can now see it in their schedule.",
      });
      setCreateOpen(false);
      setForm({ eventType: "class", title: "", subject: "", description: "", scheduledAt: "", teacherId: "", classId: "", meetingLink: "" });
    },
    onError: (err: any) => {
      toast({ title: "Could not save schedule item", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const deleteLecturePlan = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/lecture-plans/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete lecture plan");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      toast({ title: "Lecture plan deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete lecture plan", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const weeks: Date[][] = [];
  let day = calStart;
  while (day <= calEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  const eventsForDay = (date: Date) => events.filter((event) => isSameDay(parseISO(event.date), date));
  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : [];

  const navigate = (event: CalEvent) => {
    if (!user || event.type === "lecture_plan") return;

    if (event.type === "class") {
      if (user.role === "admin") setLocation(`/admin/class/${event.linkId}`);
      else if (user.role === "planner") setLocation(`/planner/courses/${event.linkId}`);
      else if (user.role === "student") setLocation(`/student/class/${event.linkId}`);
      else if (user.role === "super_admin") setLocation("/super-admin/classes");
      return;
    }

    if (event.type === "test") {
      if (user.role === "admin") setLocation("/admin/tests");
      else if (user.role === "student") setLocation("/student/tests");
      else if (user.role === "super_admin") setLocation("/super-admin/tests");
    }
  };

  const handleCreate = () => {
    if (form.eventType === "class") {
      if (!form.classId || !form.scheduledAt) {
        toast({ title: "Missing details", description: "Course and date/time are required for class scheduling.", variant: "destructive" });
        return;
      }
    } else if (!form.title.trim() || !form.subject.trim() || !form.scheduledAt || !form.teacherId) {
      toast({ title: "Missing details", description: "Title, subject, teacher, and date/time are required.", variant: "destructive" });
      return;
    }

    createPlannerScheduleItem.mutate(form);
  };

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const showClassItems = learningAccessEnabled || (user?.role !== "student" && user?.role !== "admin");

  const upcomingEvents = events
    .filter((event) => !event.isScheduled || new Date(event.date) >= new Date())
    .sort((a, b) => {
      if (a.isScheduled && !b.isScheduled) return -1;
      if (!a.isScheduled && b.isScheduled) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays size={22} className="text-primary" />
            Schedule
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isPlanner
              ? "Schedule class sessions for your assigned courses and create private management meetings for teachers."
              : showClassItems
                ? "View your upcoming classes, tests, and lecture plans prepared by the planner."
                : "View tests and planner updates. Class schedule is currently paused by super admin."}
          </p>
        </div>

        {isPlanner && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5">
                <Plus size={15} /> New Schedule Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Planner Schedule</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>Schedule Type</Label>
                  <select
                    value={form.eventType}
                    onChange={(e) => setForm((prev) => ({
                      ...prev,
                      eventType: e.target.value as "class" | "meeting",
                      title: "",
                      subject: "",
                      teacherId: "",
                      classId: "",
                      meetingLink: "",
                    }))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="class">Class Session</option>
                    <option value="meeting">Management Meeting</option>
                  </select>
                </div>

                {form.eventType === "class" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Course / Batch</Label>
                      <select
                        value={form.classId}
                        onChange={(e) => setForm((prev) => ({ ...prev, classId: e.target.value }))}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Select course</option>
                        {plannerClasses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title} ({course.subject}) {course.adminName ? `· ${course.adminName}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Scheduled For</Label>
                      <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Meeting Link (optional)</Label>
                      <Input value={form.meetingLink} onChange={(e) => setForm((prev) => ({ ...prev, meetingLink: e.target.value }))} placeholder="https://..." />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This will be visible to the assigned teacher and enrolled students of that course.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>Meeting Title</Label>
                      <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="e.g. Weekly Faculty Alignment" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Topic / Subject</Label>
                      <Input value={form.subject} onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))} placeholder="e.g. GATE Planning, Operations" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Teacher</Label>
                      <select
                        value={form.teacherId}
                        onChange={(e) => setForm((prev) => ({ ...prev, teacherId: e.target.value }))}
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
                      <Label>Scheduled For</Label>
                      <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Agenda, planning notes, action items…" rows={4} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Management meetings stay visible to the teacher and super admin, but not to students.
                    </p>
                  </>
                )}

                <Button className="w-full gap-1.5" onClick={handleCreate} disabled={createPlannerScheduleItem.isPending}>
                  {createPlannerScheduleItem.isPending ? "Saving..." : "Save Schedule Item"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => setCurrentMonth(new Date())}>Today</Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {weekdays.map((weekday) => (
                  <div key={weekday} className="text-center text-xs font-medium text-muted-foreground py-1">{weekday}</div>
                ))}
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className={`grid grid-cols-7 ${weekIndex < weeks.length - 1 ? "border-b border-border" : ""}`}>
                    {week.map((date, dayIndex) => {
                      const dayEvents = eventsForDay(date);
                      const isCurrentMonth = isSameMonth(date, currentMonth);
                      const isSelected = selectedDay ? isSameDay(date, selectedDay) : false;
                      const todayDay = isToday(date);

                      return (
                        <button
                          key={dayIndex}
                          onClick={() => setSelectedDay(isSameDay(date, selectedDay ?? new Date(0)) ? null : date)}
                          className={`min-h-[56px] p-1.5 text-left flex flex-col gap-0.5 transition-colors
                            ${dayIndex < 6 ? "border-r border-border" : ""}
                            ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}
                            ${!isCurrentMonth ? "opacity-40" : ""}
                          `}
                        >
                          <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                            ${todayDay ? "bg-primary text-primary-foreground" : isSelected ? "bg-primary/20 text-primary" : ""}`}>
                            {format(date, "d")}
                          </span>
                          <div className="flex flex-col gap-0.5 w-full overflow-hidden">
                            {dayEvents.slice(0, 2).map((event) => (
                              <div key={event.id} className={`text-[10px] px-1 py-0.5 rounded truncate font-medium ${eventColor(event.type)}`}>
                                {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} more</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {showClassItems && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-3 h-3 rounded bg-blue-100 border border-blue-200" />Class
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded bg-orange-100 border border-orange-200" />Test
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />Lecture Plan
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {selectedDay && (
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3">{format(selectedDay, "EEEE, MMMM d")}</p>
                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events on this day</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map((event) => (
                      <div key={event.id} className="rounded-lg bg-muted/50 p-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${eventColor(event.type)}`}>
                            {eventIcon(event.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{event.title}</p>
                              <Badge variant="outline" className="capitalize">
                                {event.type === "lecture_plan" && !showClassItems ? "planner update" : event.type.replace("_", " ")}
                              </Badge>
                            </div>
                            {event.subject && <p className="text-xs text-muted-foreground mt-0.5">{event.subject}</p>}
                            {event.status && <p className="text-xs text-muted-foreground mt-0.5 capitalize">Status: {event.status}</p>}
                            {event.teacherName && <p className="text-xs text-muted-foreground mt-0.5">Teacher: {event.teacherName}</p>}
                            {event.plannerName && <p className="text-xs text-muted-foreground mt-0.5">Planned by: {event.plannerName}</p>}
                            {event.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{event.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-3">
                          {event.type !== "lecture_plan" && (
                            <Button variant="outline" size="sm" onClick={() => navigate(event)}>
                              Open
                            </Button>
                          )}
                          {isPlanner && event.type === "lecture_plan" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive gap-1.5"
                              onClick={() => deleteLecturePlan.mutate(event.linkId)}
                              disabled={deleteLecturePlan.isPending}
                            >
                              <Trash2 size={14} /> Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">{showClassItems ? "Upcoming Events" : "Upcoming Tests & Planner Updates"}</p>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, index) => <div key={index} className="h-12 bg-muted rounded animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${eventColor(event.type)}`}>
                        {eventIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{event.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(parseISO(event.date), "MMM d, yyyy · h:mm a")}
                        </p>
                        {event.teacherName && (
                          <p className="text-[11px] text-muted-foreground">Teacher: {event.teacherName}</p>
                        )}
                      </div>
                      {event.type !== "lecture_plan" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate(event)}>
                          Open
                        </Button>
                      )}
                    </div>
                  ))}
                  {upcomingEvents.length === 0 && (
                    <p className="text-sm text-muted-foreground">No upcoming events</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
