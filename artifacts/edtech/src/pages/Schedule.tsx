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
import { ChevronLeft, ChevronRight, CalendarDays, ClipboardList, Plus, CalendarClock, Trash2 } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday,
  format, parseISO,
} from "date-fns";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

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

interface PlannerScheduleForm {
  title: string;
  subject: string;
  description: string;
  scheduledAt: string;
  teacherId: string;
}

function eventColor(type: CalendarEventType) {
  if (type === "test") return "bg-orange-100 text-orange-700";
  return "bg-emerald-100 text-emerald-700";
}

function eventIcon(type: CalendarEventType) {
  if (type === "test") return <ClipboardList size={15} className="text-orange-600" />;
  return <CalendarClock size={15} className="text-emerald-600" />;
}

const initialForm: PlannerScheduleForm = {
  title: "",
  subject: "",
  description: "",
  scheduledAt: "",
  teacherId: "",
};

export default function Schedule() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<PlannerScheduleForm>(initialForm);

  const canManageSchedule = user?.role === "super_admin";

  const { data: rawEvents = [], isLoading } = useQuery<CalEvent[]>({
    queryKey: ["calendar"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/calendar`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load calendar");
      return response.json();
    },
    refetchInterval: 60_000,
  });

  const events = rawEvents.filter((event) => event.type !== "class");

  const { data: teachers = [] } = useQuery<TeacherUser[]>({
    queryKey: ["schedule-teachers"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/users?role=admin`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load teachers");
      return response.json();
    },
    enabled: canManageSchedule && createOpen,
    staleTime: 30_000,
  });

  const createPlannerScheduleItem = useMutation({
    mutationFn: async (payload: PlannerScheduleForm) => {
      const response = await fetch(`${BASE}/api/lecture-plans`, {
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

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create schedule update");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      toast({
        title: "Schedule update created",
        description: "The assigned teacher can now see it in schedule.",
      });
      setCreateOpen(false);
      setForm(initialForm);
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save schedule item",
        description: err.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const deleteLecturePlan = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${BASE}/api/lecture-plans/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete lecture plan");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      toast({ title: "Schedule update deleted" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not delete lecture plan",
        description: err.message ?? "Try again.",
        variant: "destructive",
      });
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
    for (let i = 0; i < 7; i += 1) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  const eventsForDay = (date: Date) => events.filter((event) => isSameDay(parseISO(event.date), date));
  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : [];

  const navigate = (event: CalEvent) => {
    if (!user || event.type !== "test") return;

    if (user.role === "admin") setLocation("/admin/tests");
    else if (user.role === "student") setLocation("/student/tests");
    else if (user.role === "super_admin") setLocation("/super-admin/tests");
  };

  const handleCreate = () => {
    if (!form.title.trim() || !form.subject.trim() || !form.scheduledAt || !form.teacherId) {
      toast({
        title: "Missing details",
        description: "Title, subject, teacher, and date/time are required.",
        variant: "destructive",
      });
      return;
    }

    createPlannerScheduleItem.mutate(form);
  };

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarDays size={22} className="text-primary" />
            Schedule
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManageSchedule
              ? "Create schedule updates for teachers and keep important checkpoints visible."
              : "View upcoming tests and schedule updates."}
          </p>
        </div>

        {canManageSchedule ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5">
                <Plus size={15} />
                New Schedule Update
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Schedule Update</DialogTitle>
              </DialogHeader>
              <div className="mt-2 space-y-4">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={form.title}
                    onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="e.g. Weekly faculty alignment"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Topic / Subject</Label>
                  <Input
                    value={form.subject}
                    onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                    placeholder="e.g. GATE planning, operations"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Teacher</Label>
                  <select
                    value={form.teacherId}
                    onChange={(event) => setForm((prev) => ({ ...prev, teacherId: event.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                  <Input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Agenda, planning notes, action items..."
                    rows={4}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Schedule updates stay visible to the teacher and super admin, but not to students.
                </p>

                <Button className="w-full gap-1.5" onClick={handleCreate} disabled={createPlannerScheduleItem.isPending}>
                  {createPlannerScheduleItem.isPending ? "Saving..." : "Save Schedule Update"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => setCurrentMonth(new Date())}>
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>

              <div className="mb-1 grid grid-cols-7">
                {weekdays.map((weekday) => (
                  <div key={weekday} className="py-1 text-center text-xs font-medium text-muted-foreground">
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                {weeks.map((week, weekIndex) => (
                  <div key={`${weekIndex}-${week[0]?.toISOString() ?? weekIndex}`} className={`grid grid-cols-7 ${weekIndex < weeks.length - 1 ? "border-b border-border" : ""}`}>
                    {week.map((date, dayIndex) => {
                      const dayEvents = eventsForDay(date);
                      const isCurrentMonth = isSameMonth(date, currentMonth);
                      const isSelected = selectedDay ? isSameDay(date, selectedDay) : false;
                      const todayDay = isToday(date);

                      return (
                        <button
                          key={date.toISOString()}
                          onClick={() => setSelectedDay(selectedDay && isSameDay(date, selectedDay) ? null : date)}
                          className={`flex min-h-[56px] flex-col gap-0.5 p-1.5 text-left transition-colors ${
                            dayIndex < 6 ? "border-r border-border" : ""
                          } ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"} ${!isCurrentMonth ? "opacity-40" : ""}`}
                        >
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                            todayDay ? "bg-primary text-primary-foreground" : isSelected ? "bg-primary/20 text-primary" : ""
                          }`}>
                            {format(date, "d")}
                          </span>
                          <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                            {dayEvents.slice(0, 2).map((event) => (
                              <div key={event.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${eventColor(event.type)}`}>
                                {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 ? (
                              <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} more</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-3 w-3 rounded border border-orange-200 bg-orange-100" />
                  Test
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-3 w-3 rounded border border-emerald-200 bg-emerald-100" />
                  Schedule Update
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {selectedDay ? (
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <p className="mb-3 text-sm font-semibold">{format(selectedDay, "EEEE, MMMM d")}</p>
                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events on this day</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map((event) => (
                      <div key={event.id} className="rounded-lg bg-muted/50 p-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${eventColor(event.type)}`}>
                            {eventIcon(event.type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">{event.title}</p>
                              <Badge variant="outline" className="capitalize">
                                {event.type === "lecture_plan" ? "schedule update" : "test"}
                              </Badge>
                            </div>
                            {event.subject ? <p className="mt-0.5 text-xs text-muted-foreground">{event.subject}</p> : null}
                            {event.status ? <p className="mt-0.5 text-xs capitalize text-muted-foreground">Status: {event.status}</p> : null}
                            {event.teacherName ? <p className="mt-0.5 text-xs text-muted-foreground">Teacher: {event.teacherName}</p> : null}
                            {event.plannerName ? <p className="mt-0.5 text-xs text-muted-foreground">Created by: {event.plannerName}</p> : null}
                            {event.description ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{event.description}</p> : null}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          {event.type === "test" ? (
                            <Button variant="outline" size="sm" onClick={() => navigate(event)}>
                              Open
                            </Button>
                          ) : null}
                          {canManageSchedule && event.type === "lecture_plan" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => deleteLecturePlan.mutate(event.linkId)}
                              disabled={deleteLecturePlan.isPending}
                            >
                              <Trash2 size={14} />
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-semibold">Upcoming Tests & Schedule Updates</p>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/50">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${eventColor(event.type)}`}>
                        {eventIcon(event.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{event.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(parseISO(event.date), "MMM d, yyyy · h:mm a")}
                        </p>
                        {event.teacherName ? (
                          <p className="text-[11px] text-muted-foreground">Teacher: {event.teacherName}</p>
                        ) : null}
                      </div>
                      {event.type === "test" ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => navigate(event)}>
                          Open
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {upcomingEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upcoming events</p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
