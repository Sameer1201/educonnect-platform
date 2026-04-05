import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageCircle, Send, Search, AlertTriangle, Clock, ChevronLeft, Flag,
  User, Loader2, Sparkles, Users, Shield,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────────────── */
interface Peer {
  id: number;
  fullName: string;
  username: string;
  role: string;
  avatarUrl?: string | null;
}

interface Conversation {
  peerId: number;
  lastMessage: string;
  lastAt: string;
  reportedCount: number;
  peer: Peer;
}

interface DM {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  isReported: boolean;
  reportReason: string | null;
  reportedAt: string | null;
  createdAt: string;
}

/* ── Avatar helper ──────────────────────────────────────────────── */
function PeerAvatar({ peer, size = 36 }: { peer: Peer; size?: number }) {
  const initials = peer.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (peer.avatarUrl) {
    return <img src={peer.avatarUrl} alt={peer.fullName} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size / 3 }}
    >
      {initials}
    </div>
  );
}

function roleBadge(role: string) {
  if (role === "super_admin") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium">Super Admin</span>;
  if (role === "admin") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">Teacher</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">Student</span>;
}

/* ── Report dialog ──────────────────────────────────────────────── */
function ReportDialog({ messageId, open, onClose }: { messageId: number; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleReport = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/dm/message/${messageId}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Misbehaviour reported" }),
      });
      if (!r.ok) throw new Error("Failed to report");
      queryClient.invalidateQueries({ queryKey: ["dm-messages"] });
      toast({ title: "Message reported", description: "Admins will review this conversation." });
      onClose();
      setReason("");
    } catch {
      toast({ title: "Failed to report", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Flag size={16} /> Report Misbehaviour
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Describe what's wrong with this message. Admins will review the full conversation.</p>
        <Textarea
          placeholder="Reason for reporting (optional)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handleReport} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Flag size={14} className="mr-2" />}
            Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Scope label helper ─────────────────────────────────────────── */
function messagingScopeLabel(role: string): string {
  if (role === "student") return "Students only";
  if (role === "admin") return "Teachers only";
  return "Everyone";
}
function messagingScopeNote(role: string): string {
  if (role === "student") return "Students can message other students. Hover over any received message to report it.";
  if (role === "admin") return "Teachers can message other teachers.";
  return "You can message anyone.";
}

/* ── Main component ─────────────────────────────────────────────── */
export default function DirectMessages({ initialPeerId = null }: { initialPeerId?: number | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showPeerPicker, setShowPeerPicker] = useState(false);
  const [reportingMsgId, setReportingMsgId] = useState<number | null>(null);
  const [peerSearch, setPeerSearch] = useState("");

  /* ── Conversations list ─────────────────────────────────────── */
  const { data: conversations = [], isLoading: loadingConvs } = useQuery<Conversation[]>({
    queryKey: ["dm-conversations"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dm/conversations`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load conversations");
      return r.json();
    },
    refetchInterval: 10000,
  });

  /* ── Peers list (for new conversation) ─────────────────────── */
  const { data: peers = [] } = useQuery<Peer[]>({
    queryKey: ["dm-peers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dm/peers`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load peers");
      return r.json();
    },
  });

  /* ── Chat messages ─────────────────────────────────────────── */
  const { data: messages = [], isLoading: loadingMsgs } = useQuery<DM[]>({
    queryKey: ["dm-messages", selectedPeer?.id],
    queryFn: async () => {
      if (!selectedPeer) return [];
      const r = await fetch(`${BASE}/api/dm/${selectedPeer.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load messages");
      return r.json();
    },
    enabled: !!selectedPeer,
    refetchInterval: 5000,
  });

  /* ── Scroll to bottom when messages change ─────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Send message ──────────────────────────────────────────── */
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const r = await fetch(`${BASE}/api/dm/${selectedPeer!.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to send");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-messages", selectedPeer?.id] });
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
      setNewMessage("");
    },
    onError: (err: any) => toast({ title: err.message ?? "Failed to send", variant: "destructive" }),
  });

  const handleSend = () => {
    if (!newMessage.trim() || !selectedPeer) return;
    sendMutation.mutate(newMessage.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  /* ── Filtered peers for picker ─────────────────────────────── */
  const filteredPeers = peers.filter((p) =>
    p.fullName.toLowerCase().includes(search.toLowerCase()) ||
    p.username.toLowerCase().includes(search.toLowerCase()),
  );
  const suggestedPeers = peers.filter((p) =>
    p.fullName.toLowerCase().includes(peerSearch.toLowerCase()) ||
    p.username.toLowerCase().includes(peerSearch.toLowerCase()),
  );

  useEffect(() => {
    if (!initialPeerId || selectedPeer?.id === initialPeerId) return;
    const nextPeer =
      peers.find((peer) => peer.id === initialPeerId) ??
      conversations.find((conversation) => conversation.peerId === initialPeerId)?.peer;
    if (nextPeer) {
      setSelectedPeer(nextPeer);
    }
  }, [initialPeerId, peers, conversations, selectedPeer?.id]);

  if (!user) return null;

  /* ── Peer picker modal ─────────────────────────────────────── */
  const PeerPickerModal = (
    <Dialog open={showPeerPicker} onOpenChange={setShowPeerPicker}>
      <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User size={16} /> New Conversation
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {messagingScopeNote(user.role)}
          </p>
        </DialogHeader>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filteredPeers.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No users found</p>
          ) : filteredPeers.map((peer) => (
            <button
              key={peer.id}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted transition-colors text-left"
              onClick={() => {
                setSelectedPeer(peer);
                setShowPeerPicker(false);
                setSearch("");
              }}
            >
              <PeerAvatar peer={peer} size={36} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{peer.fullName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">@{peer.username}</span>
                  {roleBadge(peer.role)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-4">
      <DashboardScene accent="from-cyan-500/20 via-indigo-500/10 to-emerald-500/20">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/90">
              <MessageCircle size={12} />
              Peer Network
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Direct Messages</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Private peer-to-peer messaging built into the community layer. Students chat with students, teachers chat with teachers, and moderation stays available where needed.
              </p>
            </div>
          </div>
          <TiltCard className="rounded-3xl">
            <HoloGrid title="Messaging Scope" subtitle={messagingScopeNote(user.role)}>
              <div className="grid grid-cols-3 gap-3 text-center text-xs text-white/70">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-1 flex justify-center text-cyan-300"><Users size={16} /></div>
                  <div className="text-lg font-semibold text-white">{conversations.length}</div>
                  <div>Chats</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-1 flex justify-center text-emerald-300"><Sparkles size={16} /></div>
                  <div className="text-lg font-semibold text-white">{peers.length}</div>
                  <div>Peers</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-1 flex justify-center text-violet-300"><Shield size={16} /></div>
                  <div className="text-sm font-semibold text-white">{messagingScopeLabel(user.role)}</div>
                  <div>Access</div>
                </div>
              </div>
            </HoloGrid>
          </TiltCard>
        </div>
      </DashboardScene>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <TiltCard className="rounded-3xl">
          <HoloGrid title="Discover Peers" subtitle="Start a new peer chat directly from the filtered directory.">
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search classmates or teachers..."
                  value={peerSearch}
                  onChange={(e) => setPeerSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {suggestedPeers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No peers found in your messaging scope.</p>
                ) : (
                  suggestedPeers.map((peer) => (
                    <button
                      key={peer.id}
                      type="button"
                      className={`w-full rounded-2xl border p-3 text-left transition-all ${
                        selectedPeer?.id === peer.id
                          ? "border-primary/50 bg-primary/10 shadow-[0_12px_30px_rgba(59,130,246,0.18)]"
                          : "border-white/10 bg-white/[0.03] hover:border-primary/30 hover:bg-white/[0.05]"
                      }`}
                      onClick={() => setSelectedPeer(peer)}
                      data-testid={`peer-suggestion-${peer.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <PeerAvatar peer={peer} size={38} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{peer.fullName}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="truncate text-xs text-muted-foreground">@{peer.username}</span>
                            {roleBadge(peer.role)}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </HoloGrid>
        </TiltCard>

        <div className="flex h-[calc(100vh-220px)] min-h-[560px] border border-border rounded-3xl overflow-hidden bg-card shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
      {/* ── Left panel: conversations ────────────────────────── */}
      <div className={`flex flex-col border-r border-border bg-muted/20 ${selectedPeer ? "hidden lg:flex" : "flex"} w-full lg:w-72 shrink-0`}>
        {/* Header */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Messages</h3>
            <Button size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setShowPeerPicker(true)}>
              <MessageCircle size={12} /> New
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {messagingScopeLabel(user.role)} · {messagingScopeNote(user.role).split(".")[0]}
          </p>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <MessageCircle size={36} className="text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click "New" to start a chat</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.peerId}
                onClick={() => setSelectedPeer(conv.peer)}
                className={`w-full flex items-start gap-3 p-3 transition-colors text-left hover:bg-muted/60 ${
                  selectedPeer?.id === conv.peerId ? "bg-muted/80 border-r-2 border-primary" : ""
                }`}
                data-testid={`conv-${conv.peerId}`}
              >
                <PeerAvatar peer={conv.peer} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-semibold truncate">{conv.peer.fullName}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(conv.lastAt), { addSuffix: false })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                  {conv.reportedCount > 0 && (
                    <Badge variant="destructive" className="text-[9px] mt-1 h-4 px-1.5">
                      {conv.reportedCount} reported
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: chat ─────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0 ${selectedPeer ? "flex" : "hidden lg:flex"}`}>
        {!selectedPeer ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageCircle size={28} className="text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">Select a conversation</h3>
            <p className="text-sm text-muted-foreground mb-4">Choose an existing chat or start a new one</p>
            <Button size="sm" className="gap-2" onClick={() => setShowPeerPicker(true)}>
              <MessageCircle size={14} /> New Message
            </Button>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 p-3 border-b border-border bg-card">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 lg:hidden"
                onClick={() => setSelectedPeer(null)}
              >
                <ChevronLeft size={16} />
              </Button>
              <PeerAvatar peer={selectedPeer} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{selectedPeer.fullName}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">@{selectedPeer.username}</span>
                  {roleBadge(selectedPeer.role)}
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Private chat
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageCircle size={32} className="text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No messages yet — say hello!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId === user.id;
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                      {!isMine && <PeerAvatar peer={selectedPeer} size={28} />}
                      <div className={`max-w-[70%] group relative`}>
                        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                          isMine
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : msg.isReported
                            ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-tl-sm"
                            : "bg-muted rounded-tl-sm"
                        }`}>
                          {msg.content}
                        </div>
                        <div className={`flex items-center gap-1.5 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </span>
                          {msg.isReported && (
                            <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                              <Flag size={9} /> Reported
                            </span>
                          )}
                          {/* Report button — only for received messages that aren't already reported */}
                          {!isMine && !msg.isReported && (
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 ml-1"
                              onClick={() => setReportingMsgId(msg.id)}
                              title="Report this message"
                            >
                              <AlertTriangle size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Message input */}
            <div className="p-3 border-t border-border bg-card">
              <div className="flex items-end gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${selectedPeer.fullName}...`}
                  rows={1}
                  className="resize-none min-h-[38px] max-h-[100px] flex-1 text-sm"
                  style={{ height: "auto" }}
                  data-testid="input-dm-message"
                />
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 shrink-0"
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sendMutation.isPending}
                  data-testid="button-send-dm"
                >
                  {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Clock size={9} /> Press Enter to send · Shift+Enter for new line · Hover over a message to report
              </p>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {PeerPickerModal}
      {reportingMsgId !== null && (
        <ReportDialog
          messageId={reportingMsgId}
          open={true}
          onClose={() => setReportingMsgId(null)}
        />
      )}
        </div>
      </div>
    </div>
  );
}
