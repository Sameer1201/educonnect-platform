import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Shield, AlertTriangle, MessageCircle, Search, Flag, Eye,
  Clock, Users, Trash2, Info,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UserInfo {
  id: number;
  fullName: string;
  username: string;
  role: string;
  avatarUrl?: string | null;
}

interface ConvPair {
  user1Id: number;
  user2Id: number;
  lastMessage: string;
  lastAt: string;
  totalMessages: number;
  reportedMessages: number;
  user1: UserInfo | null;
  user2: UserInfo | null;
}

interface ReportedMsg {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  reportReason: string | null;
  reportedAt: string | null;
  createdAt: string;
  sender: UserInfo | null;
  receiver: UserInfo | null;
}

interface HistoryMsg {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  isReported: boolean;
  reportReason: string | null;
  createdAt: string;
}

interface ChatHistory {
  user1: UserInfo | null;
  user2: UserInfo | null;
  messages: HistoryMsg[];
}

/* ── Mini avatar ─────────────────────────────────────────────── */
function MiniAvatar({ user, size = 32 }: { user: UserInfo; size?: number }) {
  const initials = user.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.fullName} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, size / 3) }}
    >
      {initials}
    </div>
  );
}

function roleBadgeSmall(role: string) {
  if (role === "super_admin") return <Badge className="text-[9px] h-4 px-1 bg-purple-100 text-purple-700 hover:bg-purple-100">Super Admin</Badge>;
  if (role === "admin") return <Badge className="text-[9px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100">Teacher</Badge>;
  return <Badge className="text-[9px] h-4 px-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Student</Badge>;
}

/* ── Chat History Dialog (with delete for super_admin) ────────── */
function ChatHistoryDialog({
  user1Id, user2Id, open, onClose, isSuperAdmin,
}: { user1Id: number; user2Id: number; open: boolean; onClose: () => void; isSuperAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<ChatHistory>({
    queryKey: ["dm-admin-history", user1Id, user2Id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dm/admin/history/${user1Id}/${user2Id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const r = await fetch(`${BASE}/api/dm/admin/message/${messageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to delete");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-admin-history", user1Id, user2Id] });
      queryClient.invalidateQueries({ queryKey: ["dm-admin-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["dm-admin-reported"] });
      toast({ title: "Message deleted", description: "The message has been permanently removed." });
      setConfirmDeleteId(null);
    },
    onError: () => toast({ title: "Failed to delete message", variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield size={16} className="text-blue-500" />
              Chat History {isSuperAdmin ? "(Super Admin View)" : "(Admin View)"}
            </DialogTitle>
            {data?.user1 && data?.user2 && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1.5">
                  <MiniAvatar user={data.user1} size={20} /> {data.user1.fullName}
                </span>
                <span>↔</span>
                <span className="flex items-center gap-1.5">
                  <MiniAvatar user={data.user2} size={20} /> {data.user2.fullName}
                </span>
                <span className="ml-auto">{data.messages.length} messages</span>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 p-1 min-h-0">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : !data?.messages.length ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No messages found</div>
            ) : data.messages.map((msg) => {
              const senderInfo = msg.senderId === data.user1?.id ? data.user1 : data.user2;
              return (
                <div key={msg.id} className={`flex items-start gap-2.5 group ${msg.isReported ? "bg-red-50 dark:bg-red-950/20 rounded-lg p-2 border border-red-200 dark:border-red-800/30" : "p-2 rounded-lg"}`}>
                  {senderInfo && <MiniAvatar user={senderInfo} size={28} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold">{senderInfo?.fullName}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                      {msg.isReported && (
                        <span className="text-[10px] text-red-500 flex items-center gap-0.5 ml-auto">
                          <Flag size={9} /> {msg.reportReason ?? "Reported"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-0.5 break-words">{msg.content}</p>
                  </div>
                  {/* Delete button — super_admin only */}
                  {isSuperAdmin && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600 shrink-0 p-1 rounded"
                      title="Delete message permanently"
                      onClick={() => setConfirmDeleteId(msg.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 size={16} /> Delete Message?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the message. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDeleteId !== null && deleteMutation.mutate(confirmDeleteId)}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Main component ──────────────────────────────────────────── */
export default function DMModeration() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [tab, setTab] = useState<"conversations" | "reported">("reported");
  const [search, setSearch] = useState("");
  const [viewHistory, setViewHistory] = useState<{ u1: number; u2: number } | null>(null);

  /* ── All conversations ─────────────────────────────────────── */
  const { data: conversations = [], isLoading: loadingConvs } = useQuery<ConvPair[]>({
    queryKey: ["dm-admin-conversations"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dm/admin/conversations`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    refetchInterval: 30000,
  });

  /* ── Reported messages ─────────────────────────────────────── */
  const { data: reported = [], isLoading: loadingReported } = useQuery<ReportedMsg[]>({
    queryKey: ["dm-admin-reported"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dm/admin/reported`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    refetchInterval: 15000,
  });

  const filteredConvs = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.user1?.fullName.toLowerCase().includes(q) ||
      c.user2?.fullName.toLowerCase().includes(q) ||
      c.user1?.username.toLowerCase().includes(q) ||
      c.user2?.username.toLowerCase().includes(q)
    );
  });

  const totalReported = conversations.reduce((s, c) => s + c.reportedMessages, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold">DM Moderation</h2>
          <p className="text-xs text-muted-foreground">
            {isSuperAdmin
              ? "Full access: monitor all conversations, delete any message"
              : "Monitoring student-to-student private messages"}
          </p>
        </div>
        {isSuperAdmin && (
          <Badge className="ml-auto text-xs bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">
            Super Admin
          </Badge>
        )}
      </div>

      {/* Scope notice for regular admin */}
      {!isSuperAdmin && (
        <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-lg px-3.5 py-2.5 text-sm text-blue-700 dark:text-blue-300">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>
            You can monitor <strong>student-to-student</strong> conversations and reported messages.
            Teacher-to-teacher conversations are visible to Super Admin only.
          </span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Conversations</p>
          <p className="text-xl font-bold">{conversations.length}</p>
        </Card>
        <Card className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Total Messages</p>
          <p className="text-xl font-bold">{conversations.reduce((s, c) => s + c.totalMessages, 0)}</p>
        </Card>
        <Card className={`py-3 px-4 ${totalReported > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}`}>
          <p className="text-xs text-muted-foreground">Reported</p>
          <p className={`text-xl font-bold ${totalReported > 0 ? "text-red-600" : ""}`}>{totalReported}</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("reported")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "reported" ? "bg-white dark:bg-gray-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={13} />
            Reported Messages
            {reported.length > 0 && <Badge variant="destructive" className="text-[9px] h-4 px-1 ml-0.5">{reported.length}</Badge>}
          </span>
        </button>
        <button
          onClick={() => setTab("conversations")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "conversations" ? "bg-white dark:bg-gray-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <span className="flex items-center gap-1.5">
            <Users size={13} />
            All Conversations
          </span>
        </button>
      </div>

      {/* ── Reported messages tab ───────────────────────────── */}
      {tab === "reported" && (
        <div className="space-y-3">
          {loadingReported ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)
          ) : reported.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Shield size={36} className="mx-auto text-emerald-500 mb-3" />
                <p className="font-medium">No reported messages</p>
                <p className="text-sm text-muted-foreground mt-1">All direct messages are in good standing</p>
              </CardContent>
            </Card>
          ) : reported.map((msg) => (
            <Card key={msg.id} className="border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/10">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {msg.sender && <MiniAvatar user={msg.sender} size={36} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold">{msg.sender?.fullName}</span>
                      {msg.sender && roleBadgeSmall(msg.sender.role)}
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-sm font-medium">{msg.receiver?.fullName}</span>
                      {msg.receiver && roleBadgeSmall(msg.receiver.role)}
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                        <Clock size={10} /> {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-red-200 dark:border-red-800/30 break-words">
                      {msg.content}
                    </p>
                    {msg.reportReason && (
                      <div className="flex items-start gap-1.5 mt-2">
                        <Flag size={11} className="text-red-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-600 dark:text-red-400">
                          <strong>Report reason:</strong> {msg.reportReason}
                        </p>
                      </div>
                    )}
                    {msg.reportedAt && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Reported {formatDistanceToNow(new Date(msg.reportedAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  {msg.sender && msg.receiver && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 text-xs gap-1.5"
                      onClick={() => setViewHistory({ u1: msg.senderId, u2: msg.receiverId })}
                    >
                      <Eye size={12} /> Full Chat
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── All conversations tab ───────────────────────────── */}
      {tab === "conversations" && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Search by name or username…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {loadingConvs ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)
          ) : filteredConvs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <MessageCircle size={36} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">{search ? "No conversations match your search" : "No conversations yet"}</p>
              </CardContent>
            </Card>
          ) : filteredConvs.map((conv, i) => (
            <Card key={i} className={conv.reportedMessages > 0 ? "border-amber-300 dark:border-amber-700/40" : ""}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {conv.user1 && <MiniAvatar user={conv.user1} size={32} />}
                    <div className="w-3 h-px bg-border" />
                    {conv.user2 && <MiniAvatar user={conv.user2} size={32} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold truncate">{conv.user1?.fullName}</span>
                      {conv.user1 && roleBadgeSmall(conv.user1.role)}
                      <span className="text-xs text-muted-foreground">↔</span>
                      <span className="text-sm font-semibold truncate">{conv.user2?.fullName}</span>
                      {conv.user2 && roleBadgeSmall(conv.user2.role)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">{conv.totalMessages} msg{conv.totalMessages !== 1 ? "s" : ""}</span>
                      {conv.reportedMessages > 0 && (
                        <span className="text-xs text-amber-600 flex items-center gap-0.5">
                          <Flag size={9} /> {conv.reportedMessages} reported
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(conv.lastAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  {conv.user1 && conv.user2 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 text-xs gap-1.5"
                      onClick={() => setViewHistory({ u1: conv.user1Id, u2: conv.user2Id })}
                      data-testid={`view-history-${conv.user1Id}-${conv.user2Id}`}
                    >
                      <Eye size={12} /> View
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* History dialog */}
      {viewHistory && (
        <ChatHistoryDialog
          user1Id={viewHistory.u1}
          user2Id={viewHistory.u2}
          open={true}
          onClose={() => setViewHistory(null)}
          isSuperAdmin={isSuperAdmin}
        />
      )}
    </div>
  );
}
