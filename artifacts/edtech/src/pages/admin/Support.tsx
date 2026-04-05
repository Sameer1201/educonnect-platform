import { useState, useEffect, useRef } from "react";
import { useListSupportTickets, getListSupportTicketsQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LifeBuoy, Clock, CheckCircle, AlertCircle, MessageSquare, Send, PlusCircle,
  GraduationCap, UserCheck2, X, CalendarClock, Trash2, Calendar, XCircle, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getDeadlineUrgency, deadlineLabel, deadlineBadgeClass } from "@/lib/deadlineUtils";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";

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
  const d = new Date(); d.setMinutes(d.getMinutes() + 5);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TicketMessage {
  id: number;
  ticketId: number;
  senderId: number;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

function statusIcon(s: string) {
  if (s === "resolved") return <CheckCircle size={14} className="text-green-500" />;
  if (s === "in_progress") return <Clock size={14} className="text-blue-500" />;
  return <AlertCircle size={14} className="text-yellow-500" />;
}
function statusVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "resolved") return "default";
  if (s === "in_progress") return "secondary";
  return "outline";
}
function statusLabel(s: string) { return s.replace("_", " "); }

// ── Chat Thread ──────────────────────────────────────────────────────────────
function ChatThread({
  ticketId, currentUserId, readOnly,
}: { ticketId: number; currentUserId: number; readOnly?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<TicketMessage[]>({
    queryKey: ["support-messages", ticketId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/support/${ticketId}/messages`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 6000,
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMsg = useMutation({
    mutationFn: async (msg: string) => {
      const r = await fetch(`${BASE}/api/support/${ticketId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-messages", ticketId] });
      queryClient.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
      setReply("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const handleSend = () => {
    const text = reply.trim();
    if (!text) return;
    sendMsg.mutate(text);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex-1 space-y-2 max-h-72 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-center text-muted-foreground py-6">No messages in this thread yet.</p>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === currentUserId;
            const isStudent = msg.senderRole === "student";
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm
                  ${isMe
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : isStudent
                      ? "bg-orange-50 border border-orange-200 text-orange-900 rounded-bl-sm"
                      : "bg-blue-50 border border-blue-200 text-blue-900 rounded-bl-sm"
                  }`}>
                  {!isMe && (
                    <p className={`text-[10px] font-semibold mb-0.5 ${isStudent ? "text-orange-600" : "text-blue-600"}`}>
                      {msg.senderName} · {isStudent ? "Student" : "Support"}
                    </p>
                  )}
                  <p className="leading-relaxed break-words">{msg.message}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/70 text-right" : "text-muted-foreground"}`}>
                    {format(new Date(msg.createdAt), "MMM d · h:mm a")}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {!readOnly && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <Input
            placeholder="Reply to student…"
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            className="flex-1 text-sm h-9"
            data-testid="input-response-text"
          />
          <Button size="sm" className="h-9 px-3 gap-1" disabled={!reply.trim() || sendMsg.isPending} onClick={handleSend} data-testid="button-send-response">
            <Send size={13} />Reply
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminSupport() {
  const { user } = useAuth();
  const { data: tickets = [], isLoading } = useListSupportTickets();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedTicket, setSelectedTicket] = useState<typeof tickets[0] | null>(null);
  const [newStatus, setNewStatus] = useState<"open" | "in_progress" | "resolved">("in_progress");
  const [deadlineValue, setDeadlineValue] = useState("");

  const [submitOpen, setSubmitOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");

  const studentTickets = tickets.filter(t => (t as any).fromRole === "student");
  const myTickets = tickets.filter(t => (t as any).fromRole === "admin" && t.studentId === user?.id);

  const openStudentCount = studentTickets.filter(t => t.status === "open").length;
  const inProgressStudentCount = studentTickets.filter(t => t.status === "in_progress").length;
  const resolvedStudentCount = studentTickets.filter(t => t.status === "resolved").length;

  const submitTicketMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/support`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: newSubject.trim(), message: newMessage.trim() }),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
      setSubmitOpen(false); setNewSubject(""); setNewMessage("");
      toast({ title: "Ticket submitted to Super Admin" });
    },
    onError: () => toast({ title: "Failed to submit ticket", variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`${BASE}/api/support/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
      toast({ title: "Status updated" });
      if (selectedTicket) setSelectedTicket(prev => prev ? { ...prev, status: vars.status as any } : null);
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

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
      toast({ title: "Deadline saved" });
    },
    onError: () => toast({ title: "Failed to save deadline", variant: "destructive" }),
  });

  const openDialog = (ticket: typeof tickets[0]) => {
    setSelectedTicket(ticket);
    setNewStatus((ticket.status as any) === "resolved" ? "resolved" : "in_progress");
    setDeadlineValue((ticket as any).deadline ? toLocalDatetimeValue((ticket as any).deadline) : "");
  };

  const saveDeadline = () => {
    if (!selectedTicket) return;
    const newDeadlineISO = deadlineValue ? new Date(deadlineValue).toISOString() : null;
    setDeadlineMutation.mutate({ id: selectedTicket.id, deadline: newDeadlineISO });
  };

  return (
    <div className="space-y-6">
      <DashboardScene accent="from-emerald-500/20 via-cyan-500/10 to-blue-500/20">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_360px]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100/90">
              <LifeBuoy size={12} />
              Support Mesh
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Support Tickets</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Track student issues, jump into live ticket threads, and escalate internal blockers through a single interactive support console.
              </p>
            </div>
          </div>
          <TiltCard className="rounded-3xl">
            <HoloGrid title="Escalation" subtitle="Open a direct support ticket to Super Admin from the same support surface.">
              <Button onClick={() => setSubmitOpen(true)} className="w-full" data-testid="button-submit-ticket">
                <PlusCircle size={15} className="mr-2" />Submit to Super Admin
              </Button>
            </HoloGrid>
          </TiltCard>
        </div>
      </DashboardScene>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <TiltCard className="rounded-3xl"><Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0"><AlertCircle size={18} className="text-yellow-500" /></div>
            <div><p className="text-xs text-muted-foreground">Open</p><p className="text-2xl font-bold">{openStudentCount}</p></div>
          </CardContent>
        </Card></TiltCard>
        <TiltCard className="rounded-3xl"><Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Clock size={18} className="text-blue-500" /></div>
            <div><p className="text-xs text-muted-foreground">In Progress</p><p className="text-2xl font-bold">{inProgressStudentCount}</p></div>
          </CardContent>
        </Card></TiltCard>
        <TiltCard className="rounded-3xl"><Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0"><CheckCircle size={18} className="text-green-500" /></div>
            <div><p className="text-xs text-muted-foreground">Resolved</p><p className="text-2xl font-bold">{resolvedStudentCount}</p></div>
          </CardContent>
        </Card></TiltCard>
      </div>

      {/* ── Student Support Requests ── */}
      <TiltCard className="rounded-3xl"><Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap size={16} className="text-primary" />
            Student Support Requests
            <Badge variant="secondary" className="ml-auto">{studentTickets.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
          ) : studentTickets.length === 0 ? (
            <div className="text-center py-8">
              <GraduationCap size={36} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No student support tickets yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {studentTickets.map(ticket => {
                const deadline = (ticket as any).deadline as string | null;
                const urgency = getDeadlineUrgency(deadline);
                return (
                  <div key={ticket.id}
                    className={`p-4 rounded-xl border bg-card transition-all ${
                      urgency === "overdue" && ticket.status !== "resolved"
                        ? "border-red-300 dark:border-red-700 bg-red-50/20"
                        : urgency === "critical" && ticket.status !== "resolved"
                        ? "border-orange-300 dark:border-orange-700 bg-orange-50/10"
                        : "border-border"
                    }`}
                    data-testid={`ticket-${ticket.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold truncate">{ticket.subject}</p>
                          <Badge variant={statusVariant(ticket.status)} className="flex items-center gap-1.5 shrink-0 text-xs">
                            {statusIcon(ticket.status)}{statusLabel(ticket.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          From <span className="font-semibold text-foreground">{ticket.studentName}</span>{" "}
                          · {format(new Date(ticket.createdAt), "MMM d, yyyy · h:mm a")}
                        </p>
                        {deadline && ticket.status !== "resolved" && <DeadlineBadge deadline={deadline} />}
                      </div>
                      <Button size="sm" variant="default" onClick={() => openDialog(ticket)} data-testid={`button-respond-${ticket.id}`}>
                        <MessageSquare size={13} className="mr-1" />Open Chat
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card></TiltCard>

      {/* ── My Submissions to Super Admin ── */}
      <TiltCard className="rounded-3xl"><Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck2 size={16} className="text-primary" />
            My Tickets to Super Admin
            <Badge variant="secondary" className="ml-auto">{myTickets.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myTickets.length === 0 ? (
            <div className="text-center py-6">
              <LifeBuoy size={28} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">You haven't submitted any tickets to Super Admin yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myTickets.map(ticket => (
                <div key={ticket.id} className="rounded-xl border border-blue-200 bg-blue-50/30 overflow-hidden" data-testid={`my-ticket-${ticket.id}`}>
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold truncate">{ticket.subject}</p>
                        <Badge variant={statusVariant(ticket.status)} className="flex items-center gap-1.5 shrink-0 text-xs">
                          {statusIcon(ticket.status)}{statusLabel(ticket.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Submitted {format(new Date(ticket.createdAt), "MMM d, yyyy")}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openDialog(ticket)}>
                      <MessageSquare size={13} className="mr-1" />View Chat
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card></TiltCard>

      {/* ── Chat Dialog ── */}
      <Dialog open={!!selectedTicket} onOpenChange={o => !o && setSelectedTicket(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base truncate">{selectedTicket?.subject}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedTicket && (selectedTicket as any).fromRole === "student"
                    ? `From ${selectedTicket.studentName}`
                    : "Your ticket to Super Admin"}
                  {" "}· Opened {selectedTicket && format(new Date(selectedTicket.createdAt), "MMM d, yyyy")}
                </p>
              </div>
              <Badge variant={statusVariant(selectedTicket?.status ?? "open")} className="flex items-center gap-1 shrink-0 mt-0.5">
                {statusIcon(selectedTicket?.status ?? "")}
                {statusLabel(selectedTicket?.status ?? "")}
              </Badge>
            </div>
            {/* Status + deadline control (only for student tickets) */}
            {selectedTicket && (selectedTicket as any).fromRole === "student" && (
              <div className="space-y-2 mt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <Select value={newStatus} onValueChange={v => {
                    setNewStatus(v as any);
                    updateStatusMutation.mutate({ id: selectedTicket.id, status: v });
                  }}>
                    <SelectTrigger className="h-7 text-xs w-36" data-testid="select-ticket-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                  {updateStatusMutation.isPending && <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar size={11} />Deadline:</span>
                  <Input
                    type="datetime-local"
                    value={deadlineValue}
                    min={toMinDatetime()}
                    onChange={e => setDeadlineValue(e.target.value)}
                    className="h-7 text-xs w-48"
                    data-testid="input-deadline"
                  />
                  {deadlineValue && (
                    <button onClick={() => setDeadlineValue("")} className="text-muted-foreground hover:text-red-500 transition-colors" title="Clear">
                      <Trash2 size={12} />
                    </button>
                  )}
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={saveDeadline} disabled={setDeadlineMutation.isPending}>
                    <CalendarClock size={11} className="mr-1" />
                    {setDeadlineMutation.isPending ? "Saving…" : "Save Deadline"}
                  </Button>
                </div>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-hidden px-5 py-4 min-h-0">
            {selectedTicket && (
              <ChatThread
                ticketId={selectedTicket.id}
                currentUserId={user?.id ?? 0}
                readOnly={selectedTicket.status === "resolved"}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Submit to Super Admin Dialog ── */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Ticket to Super Admin</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Subject *</Label>
              <Input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Brief summary" className="mt-1" data-testid="input-ticket-subject" />
            </div>
            <div>
              <Label className="text-xs">Message *</Label>
              <Textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Describe your issue in detail..." rows={4} className="mt-1" data-testid="input-ticket-message" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setSubmitOpen(false)}>Cancel</Button>
              <Button
                disabled={!newSubject.trim() || !newMessage.trim() || submitTicketMutation.isPending}
                onClick={() => submitTicketMutation.mutate()}
                data-testid="button-confirm-submit-ticket"
              >
                <Send size={14} className="mr-2" />
                {submitTicketMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
