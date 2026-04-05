import { useState } from "react";
import { useListSupportTickets, useRespondToTicket, getListSupportTicketsQueryKey } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LifeBuoy, Clock, CheckCircle, AlertCircle, MessageSquare, Send,
  UserCheck, GraduationCap, ShieldCheck, CalendarClock, Trash2, Calendar,
  XCircle, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getDeadlineUrgency, deadlineLabel, deadlineBadgeClass } from "@/lib/deadlineUtils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function statusIcon(status: string) {
  if (status === "resolved") return <CheckCircle size={14} className="text-green-500" />;
  if (status === "in_progress") return <Clock size={14} className="text-blue-500" />;
  return <AlertCircle size={14} className="text-yellow-500" />;
}
function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "resolved") return "default";
  if (status === "in_progress") return "secondary";
  return "outline";
}

function DeadlineBadge({ deadline }: { deadline?: string | null }) {
  if (!deadline) return null;
  const urgency = getDeadlineUrgency(deadline);
  if (!urgency) return null;
  const cls = deadlineBadgeClass(urgency);
  const icon = urgency === "overdue" ? <XCircle size={10} />
    : urgency === "critical" ? <AlertTriangle size={10} />
    : <Clock size={10} />;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cls}`}>
      {icon} {deadlineLabel(deadline)}
    </span>
  );
}

function toLocalDatetimeValue(isoStr: string) {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toMinDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 5);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SuperAdminSupport() {
  const { data: tickets = [], isLoading, refetch } = useListSupportTickets();
  const { data: contactSubmissions = [], isLoading: loadingContacts } = useQuery<any[]>({
    queryKey: ["contact-submissions"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/support/contact`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
  const respondToTicket = useRespondToTicket();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedTicket, setSelectedTicket] = useState<typeof tickets[0] | null>(null);
  const [responseText, setResponseText] = useState("");
  const [newStatus, setNewStatus] = useState<"open" | "in_progress" | "resolved">("in_progress");
  const [deadlineValue, setDeadlineValue] = useState(""); // local datetime-local input value
  const [error, setError] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "student" | "admin">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "in_progress" | "resolved">("all");

  // Deadline mutation
  const setDeadlineMutation = useMutation({
    mutationFn: async ({ id, deadline }: { id: number; deadline: string | null }) => {
      const r = await fetch(`${BASE}/api/support/${id}/deadline`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
      refetch();
    },
  });

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;
  const overdueCount = tickets.filter((t) => getDeadlineUrgency((t as any).deadline) === "overdue" && t.status !== "resolved").length;

  const filteredTickets = tickets.filter((t) => {
    const roleOk = filterRole === "all" || (t as any).fromRole === filterRole;
    const statusOk = filterStatus === "all" || t.status === filterStatus;
    return roleOk && statusOk;
  });

  // Sort: overdue/critical first, then by creation desc
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const urgencyOrder = { overdue: 0, critical: 1, warning: 2, ok: 3 };
    const ua = getDeadlineUrgency((a as any).deadline) ?? "ok";
    const ub = getDeadlineUrgency((b as any).deadline) ?? "ok";
    if (ua !== ub) return (urgencyOrder[ua] ?? 4) - (urgencyOrder[ub] ?? 4);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const handleRespond = () => {
    if (!selectedTicket || !responseText.trim()) {
      setError("Response text is required");
      return;
    }
    setError("");

    // If deadline was changed, apply it first
    const currentDeadline = (selectedTicket as any).deadline as string | null;
    const newDeadlineISO = deadlineValue ? new Date(deadlineValue).toISOString() : null;
    const deadlineChanged = newDeadlineISO !== (currentDeadline ?? null);

    const doRespond = () => {
      respondToTicket.mutate(
        { id: selectedTicket.id, data: { adminResponse: responseText, status: newStatus } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
            toast({ title: "Response sent successfully" });
            setSelectedTicket(null);
            setResponseText("");
            setDeadlineValue("");
          },
          onError: (err: any) => setError(err?.data?.error ?? "Failed to send response"),
        }
      );
    };

    if (deadlineChanged) {
      setDeadlineMutation.mutate({ id: selectedTicket.id, deadline: newDeadlineISO }, { onSuccess: doRespond, onError: doRespond });
    } else {
      doRespond();
    }
  };

  const handleClearDeadline = (ticketId: number) => {
    setDeadlineMutation.mutate({ id: ticketId, deadline: null }, {
      onSuccess: () => toast({ title: "Deadline cleared" }),
      onError: () => toast({ title: "Failed to clear deadline", variant: "destructive" }),
    });
  };

  const openRespondDialog = (ticket: typeof tickets[0]) => {
    setSelectedTicket(ticket);
    setResponseText(ticket.adminResponse ?? "");
    setNewStatus((ticket.status as any) === "resolved" ? "resolved" : "in_progress");
    setDeadlineValue((ticket as any).deadline ? toLocalDatetimeValue((ticket as any).deadline) : "");
    setError("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Support Tickets</h1>
        <p className="text-muted-foreground text-sm mt-1">View, respond, and set resolution deadlines for tickets.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="cursor-pointer" onClick={() => setFilterStatus("open")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center shrink-0">
              <AlertCircle size={18} className="text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open</p>
              <p className="text-2xl font-bold">{openCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilterStatus("in_progress")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
              <Clock size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold">{inProgressCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilterStatus("resolved")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
              <CheckCircle size={18} className="text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resolved</p>
              <p className="text-2xl font-bold">{resolvedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
              <CalendarClock size={18} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare size={16} className="text-primary" />
            Public Contact Form ({contactSubmissions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingContacts ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <div key={i} className="h-20 bg-muted rounded animate-pulse" />)}
            </div>
          ) : contactSubmissions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No public contact form submissions yet.</div>
          ) : (
            <div className="space-y-3">
              {contactSubmissions.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold">{item.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.name} · {item.email} · {format(new Date(item.createdAt), "MMM d, yyyy · h:mm a")}
                      </p>
                    </div>
                    <Badge variant="outline">{item.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{item.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LifeBuoy size={16} className="text-primary" />
              All Tickets ({sortedTickets.length})
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">
                {(["all", "open", "in_progress", "resolved"] as const).map((s) => (
                  <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"} className="h-7 text-xs"
                    onClick={() => setFilterStatus(s)} data-testid={`filter-status-${s}`}>
                    {s === "all" ? "All" : s.replace("_", " ")}
                  </Button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["all", "student", "admin"] as const).map((role) => (
                  <Button key={role} size="sm" variant={filterRole === role ? "secondary" : "outline"} className="h-7 text-xs"
                    onClick={() => setFilterRole(role)} data-testid={`filter-${role}`}>
                    {role === "all" ? "All Users" : role === "admin" ? "Teachers" : "Students"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded animate-pulse" />)}
            </div>
          ) : sortedTickets.length === 0 ? (
            <div className="text-center py-8">
              <LifeBuoy size={36} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No support tickets yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedTickets.map((ticket) => {
                const fromRole = (ticket as any).fromRole as string;
                const resolvedByName = (ticket as any).resolvedByName as string | null;
                const deadline = (ticket as any).deadline as string | null;
                const urgency = getDeadlineUrgency(deadline);
                const isFromAdmin = fromRole === "admin";
                const isOverdue = urgency === "overdue" && ticket.status !== "resolved";

                return (
                  <div
                    key={ticket.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isOverdue ? "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/10"
                        : urgency === "critical" ? "border-orange-300 dark:border-orange-700 bg-orange-50/20"
                        : isFromAdmin ? "border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20"
                        : "border-border bg-card"
                    }`}
                    data-testid={`ticket-${ticket.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold truncate">{ticket.subject}</p>
                          <Badge variant={statusVariant(ticket.status)} className="flex items-center gap-1.5 shrink-0">
                            {statusIcon(ticket.status)}
                            {ticket.status.replace("_", " ")}
                          </Badge>
                          {isFromAdmin ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                              <UserCheck size={10} /> Teacher
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                              <GraduationCap size={10} /> Student
                            </span>
                          )}
                        </div>

                        {/* Meta */}
                        <p className="text-xs text-muted-foreground mb-1.5">
                          From <span className="font-semibold text-foreground">{ticket.studentName}</span>
                          {" · "}{format(new Date(ticket.createdAt), "MMM d, yyyy · h:mm a")}
                        </p>

                        {/* Deadline badge */}
                        {deadline && ticket.status !== "resolved" && (
                          <div className="flex items-center gap-2 mb-1.5">
                            <DeadlineBadge deadline={deadline} />
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(deadline), "MMM d, yyyy · h:mm a")}
                            </span>
                            <button
                              onClick={() => handleClearDeadline(ticket.id)}
                              className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-0.5"
                              title="Clear deadline"
                            >
                              <Trash2 size={10} /> clear
                            </button>
                          </div>
                        )}

                        {/* Message */}
                        <p className="text-sm text-muted-foreground line-clamp-2">{ticket.message}</p>

                        {/* Response */}
                        {ticket.adminResponse && (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-800">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <MessageSquare size={12} className="text-green-600 shrink-0" />
                              <p className="text-xs font-semibold text-green-700 dark:text-green-400">Response</p>
                              {resolvedByName && (
                                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full" data-testid={`resolved-by-${ticket.id}`}>
                                  <ShieldCheck size={9} /> Resolved by {resolvedByName}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-green-900 dark:text-green-300 line-clamp-2">{ticket.adminResponse}</p>
                          </div>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant={ticket.adminResponse ? "secondary" : "default"}
                        onClick={() => openRespondDialog(ticket)}
                        data-testid={`button-respond-${ticket.id}`}
                      >
                        <Send size={13} className="mr-1" />
                        {ticket.adminResponse ? "Update" : "Respond"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Respond & Deadline Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(o) => !o && setSelectedTicket(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond to Ticket</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4 mt-2">
              {/* Ticket summary */}
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                    {selectedTicket.studentName?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{selectedTicket.studentName}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(selectedTicket.createdAt), "MMM d, yyyy · h:mm a")}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold mb-1">{selectedTicket.subject}</p>
                <p className="text-sm text-muted-foreground">{selectedTicket.message}</p>
              </div>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

              <div className="space-y-1.5">
                <Label>Your Response</Label>
                <Textarea
                  placeholder="Write your response..."
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  rows={3}
                  data-testid="input-response-text"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Update Status</Label>
                  <Select value={newStatus} onValueChange={(v) => setNewStatus(v as any)}>
                    <SelectTrigger data-testid="select-ticket-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Calendar size={12} /> Resolution Deadline
                  </Label>
                  <div className="flex gap-1">
                    <Input
                      type="datetime-local"
                      value={deadlineValue}
                      min={toMinDatetime()}
                      onChange={(e) => setDeadlineValue(e.target.value)}
                      className="text-xs h-9"
                      data-testid="input-deadline"
                    />
                    {deadlineValue && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 text-muted-foreground hover:text-red-500 shrink-0"
                        onClick={() => setDeadlineValue("")}
                        title="Clear deadline"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                  {deadlineValue && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Popup alert fires 24h, 1h, and at deadline
                    </p>
                  )}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleRespond}
                disabled={respondToTicket.isPending || setDeadlineMutation.isPending}
                data-testid="button-send-response"
              >
                <Send size={14} className="mr-2" />
                {respondToTicket.isPending || setDeadlineMutation.isPending ? "Saving..." : "Send Response & Save"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
