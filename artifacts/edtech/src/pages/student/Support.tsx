import { useState, useEffect, useRef } from "react";
import { useListSupportTickets, useCreateSupportTicket, getListSupportTicketsQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, LifeBuoy, Clock, CheckCircle, AlertCircle, MessageSquare, Send, ChevronDown, ChevronUp, XCircle, AlertTriangle, ImagePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getDeadlineUrgency, deadlineLabel, deadlineBadgeClass } from "@/lib/deadlineUtils";

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

function ChatThread({ ticketId, currentUserId, readOnly }: { ticketId: number; currentUserId: number; readOnly?: boolean }) {
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
    refetchInterval: readOnly ? false : 8000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    <div className="flex flex-col gap-3">
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-center text-muted-foreground py-4">No messages yet.</p>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === currentUserId;
            const isAdmin = msg.senderRole === "admin" || msg.senderRole === "super_admin";
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm
                  ${isMe
                    ? "bg-primary text-white rounded-br-sm"
                    : isAdmin
                      ? "bg-blue-50 border border-blue-200 text-blue-900 rounded-bl-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                  {!isMe && (
                    <p className={`text-[10px] font-semibold mb-0.5 ${isAdmin ? "text-blue-600" : "text-muted-foreground"}`}>
                      {msg.senderName} {isAdmin ? "· Support" : ""}
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
            placeholder="Type a reply…"
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            className="flex-1 text-sm h-8"
            data-testid="input-reply-message"
          />
          <Button size="sm" className="h-8 px-3" disabled={!reply.trim() || sendMsg.isPending} onClick={handleSend}>
            <Send size={13} />
          </Button>
        </div>
      )}
    </div>
  );
}

function TicketList({ tickets, expandedId, setExpandedId, currentUserId, readOnly }: {
  tickets: any[];
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  currentUserId: number;
  readOnly?: boolean;
}) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-10">
        <LifeBuoy size={36} className="mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          {readOnly ? "No resolved tickets yet." : "No active tickets. Need help? Submit a new ticket."}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {tickets.map(ticket => {
        const isExpanded = expandedId === ticket.id;
        return (
          <div key={ticket.id} className="rounded-xl border border-border overflow-hidden" data-testid={`ticket-${ticket.id}`}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">{ticket.subject}</p>
                  <Badge variant={statusVariant(ticket.status)} className="flex items-center gap-1 shrink-0 text-xs">
                    {statusIcon(ticket.status)}
                    {ticket.status.replace("_", " ")}
                  </Badge>
                  {(ticket as any).deadline && ticket.status !== "resolved" && (
                    <DeadlineBadge deadline={(ticket as any).deadline} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Opened {format(new Date(ticket.createdAt), "MMM d, yyyy")}
                  {readOnly && ticket.updatedAt && ` · Resolved ${format(new Date(ticket.updatedAt), "MMM d, yyyy")}`}
                </p>
                {(ticket as any).imageData && (
                  <div className="mt-2">
                    <img
                      src={(ticket as any).imageData}
                      alt="Support attachment"
                      className="max-h-24 rounded-lg border border-border object-contain bg-muted/30"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <MessageSquare size={14} className="text-muted-foreground" />
                {isExpanded ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
              </div>
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 pt-3 border-t border-border bg-muted/20">
                <ChatThread ticketId={ticket.id} currentUserId={currentUserId} readOnly={readOnly} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StudentSupport() {
  const { user } = useAuth();
  const { data: tickets = [], isLoading } = useListSupportTickets();
  const createTicket = useCreateSupportTicket();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", imageData: null as string | null });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "resolved">("active");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are supported");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, imageData: reader.result as string }));
      setError("");
    };
    reader.onerror = () => setError("Could not read the selected image");
    reader.readAsDataURL(file);
  };

  const handleCreate = () => {
    setError("");
    if (!form.subject || !form.message) { setError("Subject and message are required"); return; }
    createTicket.mutate(
      { data: { subject: form.subject, message: form.message, imageData: form.imageData } },
      {
        onSuccess: (newTicket: any) => {
          queryClient.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
          toast({ title: "Support ticket submitted!" });
          setOpen(false);
          setForm({ subject: "", message: "", imageData: null });
          setActiveTab("active");
          setExpandedId(newTicket?.id ?? null);
        },
        onError: (err: any) => setError(err?.data?.error ?? "Failed to create ticket"),
      }
    );
  };

  const activeTickets = tickets.filter(t => t.status !== "resolved");
  const resolvedTickets = tickets.filter(t => t.status === "resolved");

  const open_count = tickets.filter(t => t.status === "open").length;
  const in_progress_count = tickets.filter(t => t.status === "in_progress").length;
  const resolved_count = resolvedTickets.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Get help from our team for any issues or questions</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-ticket">
              <Plus size={16} className="mr-2" />New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Support Request</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input name="subject" placeholder="Briefly describe your issue" value={form.subject} onChange={handleChange} data-testid="input-ticket-subject" />
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea name="message" placeholder="Describe your issue in detail..." value={form.message} onChange={handleChange} rows={5} data-testid="input-ticket-message" />
              </div>
              <div className="space-y-2">
                <Label>Image Attachment (optional)</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/40">
                    <ImagePlus size={15} />
                    Add Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {form.imageData && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm((prev) => ({ ...prev, imageData: null }))}>
                      Remove image
                    </Button>
                  )}
                </div>
                {form.imageData && (
                  <img src={form.imageData} alt="Attachment preview" className="max-h-40 rounded-lg border border-border object-contain bg-muted/30" />
                )}
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createTicket.isPending} data-testid="button-submit-ticket">
                {createTicket.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0"><AlertCircle size={18} className="text-yellow-500" /></div>
            <div><p className="text-xs text-muted-foreground">Open</p><p className="text-2xl font-bold">{open_count}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Clock size={18} className="text-blue-500" /></div>
            <div><p className="text-xs text-muted-foreground">In Progress</p><p className="text-2xl font-bold">{in_progress_count}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0"><CheckCircle size={18} className="text-green-500" /></div>
            <div><p className="text-xs text-muted-foreground">Resolved</p><p className="text-2xl font-bold">{resolved_count}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LifeBuoy size={16} className="text-primary" />
              My Tickets
            </CardTitle>
            {/* Tab switcher */}
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
              <button
                onClick={() => { setActiveTab("active"); setExpandedId(null); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${
                  activeTab === "active" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-active-tickets"
              >
                <AlertCircle size={13} />
                Active
                {activeTickets.length > 0 && (
                  <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {activeTickets.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setActiveTab("resolved"); setExpandedId(null); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${
                  activeTab === "resolved" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-resolved-tickets"
              >
                <CheckCircle size={13} />
                Resolved
                {resolvedTickets.length > 0 && (
                  <span className="ml-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {resolvedTickets.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
          ) : (
            activeTab === "active" ? (
              <TicketList
                tickets={activeTickets}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                currentUserId={user?.id ?? 0}
                readOnly={false}
              />
            ) : (
              <TicketList
                tickets={resolvedTickets}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                currentUserId={user?.id ?? 0}
                readOnly={true}
              />
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
