import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageSquare, Send, Reply, Trash2, Users, ImagePlus, X, Pin, PinOff, MessageCircle, Shield } from "lucide-react";
import DirectMessages from "@/components/DirectMessages";
import DMModeration from "@/components/DMModeration";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchPosts() {
  const r = await fetch(`${BASE}/api/community`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch posts");
  return r.json() as Promise<CommunityPostItem[]>;
}

async function createPost(body: { content: string; parentId?: number | null; imageUrl?: string | null }) {
  const r = await fetch(`${BASE}/api/community`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to post");
  }
  return r.json();
}

async function deletePost(id: number) {
  const r = await fetch(`${BASE}/api/community/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to delete");
}

async function togglePin(id: number) {
  const r = await fetch(`${BASE}/api/community/${id}/pin`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to pin/unpin");
  return r.json() as Promise<{ isPinned: boolean }>;
}

interface CommunityPostItem {
  id: number;
  authorId: number;
  authorName: string;
  authorRole: string;
  content: string;
  imageUrl: string | null;
  parentId: number | null;
  isPinned: boolean;
  createdAt: string;
  isOwnPost: boolean;
}

function roleColor(role: string) {
  if (role === "super_admin") return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
  if (role === "admin") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
}

function roleLabel(role: string) {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Teacher";
  return "Student";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PostCard({
  post,
  replies,
  currentUserRole,
  onReply,
  onDelete,
  onPin,
  onMessage,
}: {
  post: CommunityPostItem;
  replies: CommunityPostItem[];
  currentUserRole: string;
  onReply: (postId: number, authorName: string) => void;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onMessage?: (peer: { id: number; name: string; role: string }) => void;
}) {
  const canDelete =
    post.isOwnPost ||
    currentUserRole === "admin" ||
    currentUserRole === "super_admin";

  const canPin = currentUserRole === "admin" || currentUserRole === "super_admin";
  const canMessage =
    !!onMessage &&
    ((currentUserRole === "student" && post.authorRole === "student") ||
      (currentUserRole === "admin" && post.authorRole === "admin") ||
      currentUserRole === "super_admin");

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
        post.isPinned
          ? "border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]"
          : "border-border bg-card"
      }`}
      data-testid={`post-${post.id}`}
    >
      {post.isPinned && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-100/80 dark:bg-amber-900/30 border-b border-amber-300/50">
          <Pin size={11} className="text-amber-600" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Pinned message</span>
        </div>
      )}
      <div className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm ${
              post.authorRole === "super_admin"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30"
                : post.authorRole === "admin"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30"
                : "bg-primary/10 text-primary"
            }`}>
              {post.authorName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{post.authorName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColor(post.authorRole)}`}>
                  {roleLabel(post.authorRole)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onReply(post.id, post.authorName)}
              data-testid={`button-reply-${post.id}`}
            >
              <Reply size={13} className="mr-1" />
              Reply
            </Button>
            {canMessage && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
                onClick={() => onMessage?.({ id: post.authorId, name: post.authorName, role: post.authorRole })}
                data-testid={`button-message-${post.id}`}
              >
                <MessageCircle size={13} className="mr-1" />
                Message
              </Button>
            )}
            {canPin && (
              <Button
                size="sm"
                variant="ghost"
                className={`h-7 px-2 text-xs transition-colors ${
                  post.isPinned
                    ? "text-amber-600 hover:text-amber-700 hover:bg-amber-100/80"
                    : "text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                }`}
                onClick={() => onPin(post.id)}
                data-testid={`button-pin-${post.id}`}
                title={post.isPinned ? "Unpin" : "Pin to top"}
              >
                {post.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(post.id)}
                data-testid={`button-delete-post-${post.id}`}
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt="Post image"
            className="mt-3 max-h-64 rounded-lg object-cover border border-border"
          />
        )}
      </div>

      {replies.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
          {replies.map((reply) => {
            const canDelReply =
              reply.isOwnPost ||
              currentUserRole === "admin" ||
              currentUserRole === "super_admin";
            return (
              <div key={reply.id} className="flex items-start gap-2" data-testid={`reply-${reply.id}`}>
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-semibold text-primary text-xs mt-0.5">
                  {reply.authorName?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold">{reply.authorName}</span>
                    <span className={`text-xs px-1 py-0.5 rounded-full font-medium ${roleColor(reply.authorRole)}`}>
                      {roleLabel(reply.authorRole)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                    </span>
                    {canDelReply && (
                      <Button
                        size="sm"
                        variant="ghost"
                      className="h-5 w-5 p-0 text-destructive hover:text-destructive shrink-0"
                        onClick={() => onDelete(reply.id)}
                        data-testid={`button-delete-reply-${reply.id}`}
                      >
                        <Trash2 size={11} />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm">{reply.content}</p>
                  {reply.imageUrl && (
                    <img src={reply.imageUrl} alt="Reply image" className="mt-2 max-h-40 rounded-lg object-cover border border-border" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Tab = "board" | "messages" | "moderation";

export default function Community() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("board");
  const [dmLaunchKey, setDmLaunchKey] = useState<number>(0);
  const [dmTargetPeerId, setDmTargetPeerId] = useState<number | null>(null);

  const [newPost, setNewPost] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: number; name: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: allPosts = [], isLoading } = useQuery({
    queryKey: ["community"],
    queryFn: fetchPosts,
    refetchInterval: 15000,
  });

  const postMutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      setNewPost("");
      setPostImage(null);
      setReplyingTo(null);
      setReplyText("");
      setReplyImage(null);
      setError("");
      toast({ title: "Posted!" });
    },
    onError: (err: any) => setError(err.message ?? "Failed to post"),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast({ title: "Post deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const pinMutation = useMutation({
    mutationFn: togglePin,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast({ title: data.isPinned ? "Post pinned" : "Post unpinned" });
    },
    onError: () => toast({ title: "Failed to update pin", variant: "destructive" }),
  });

  const handleImageSelect = async (file: File, forReply: boolean) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please choose an image under 2MB", variant: "destructive" });
      return;
    }
    const base64 = await fileToBase64(file);
    if (forReply) setReplyImage(base64);
    else setPostImage(base64);
  };

  const topLevelPosts = allPosts.filter((p) => !p.parentId);
  const pinnedPosts = topLevelPosts.filter((p) => p.isPinned);
  const unpinnedPosts = topLevelPosts.filter((p) => !p.isPinned);
  const orderedPosts = [...pinnedPosts, ...unpinnedPosts];
  const getReplies = (postId: number) => allPosts.filter((p) => p.parentId === postId);

  const handlePost = () => {
    if (!newPost.trim()) { setError("Write something first"); return; }
    setError("");
    postMutation.mutate({ content: newPost.trim(), parentId: null, imageUrl: postImage });
  };

  const handleReply = () => {
    if (!replyText.trim() || !replyingTo) return;
    postMutation.mutate({ content: replyText.trim(), parentId: replyingTo.id, imageUrl: replyImage });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this post?")) return;
    deleteMutation.mutate(id);
  };

  const handlePin = (id: number) => {
    pinMutation.mutate(id);
  };

  const handleDirectMessage = (peer: { id: number; name: string; role: string }) => {
    setActiveTab("messages");
    setDmTargetPeerId(peer.id);
    setDmLaunchKey((prev) => prev + 1);
  };

  if (!user) return null;

  const isModeratorRole = user.role === "admin" || user.role === "super_admin";

  return (
    <div className="space-y-6">
      <DashboardScene accent="from-sky-500/20 via-indigo-500/10 to-fuchsia-500/20">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_360px]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-100/90">
              <Users size={12} />
              Social Space
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-white">
                <Users size={24} className="text-cyan-300" />
                Community
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground dark:text-slate-300">
                A shared communication layer for students, teachers, and admins with posts, replies, direct messages, and moderation in one immersive board.
              </p>
            </div>
          </div>
          <TiltCard className="rounded-3xl">
            <HoloGrid title="Presence" subtitle="Start a discussion, share an update, or move into direct messages without leaving the space.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs text-muted-foreground dark:text-white/70">
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]"><div className="text-lg font-semibold text-foreground dark:text-white">{orderedPosts.length}</div><div>Threads</div></div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]"><div className="text-lg font-semibold text-foreground dark:text-white">{pinnedPosts.length}</div><div>Pinned</div></div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]"><div className="text-lg font-semibold text-foreground dark:text-white">{activeTab === "messages" ? "DM" : "Board"}</div><div>Mode</div></div>
              </div>
            </HoloGrid>
          </TiltCard>
        </div>
      </DashboardScene>

      {/* Tab bar */}
      <div className="flex w-full flex-wrap gap-1 rounded-2xl border border-slate-200/80 bg-white/85 p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:w-fit dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_14px_40px_rgba(15,23,42,0.3)]">
        <button
          onClick={() => setActiveTab("board")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all sm:flex-none ${activeTab === "board" ? "bg-white dark:bg-gray-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-board"
        >
          <MessageSquare size={14} /> Community Board
        </button>
        <button
          onClick={() => setActiveTab("messages")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all sm:flex-none ${activeTab === "messages" ? "bg-white dark:bg-gray-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-messages"
        >
          <MessageCircle size={14} /> Direct Messages
        </button>
        {isModeratorRole && (
          <button
            onClick={() => setActiveTab("moderation")}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all sm:flex-none ${activeTab === "moderation" ? "bg-white dark:bg-gray-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-moderation"
          >
            <Shield size={14} /> DM Moderation
          </button>
        )}
      </div>

      {/* Direct Messages tab */}
      {activeTab === "messages" && <DirectMessages key={dmLaunchKey} initialPeerId={dmTargetPeerId} />}

      {/* DM Moderation tab (admin/super_admin only) */}
      {activeTab === "moderation" && isModeratorRole && <DMModeration />}

      {/* Community Board tab */}
      {activeTab === "board" && (<div className="space-y-4">

      {/* New Post Box */}
      <TiltCard className="rounded-3xl"><Card>
        <CardContent className="p-4 space-y-3">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm ${
              user.role === "super_admin" ? "bg-purple-100 text-purple-700" : user.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-primary/10 text-primary"
            }`}>
              {user.fullName?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Share something with the community..."
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                rows={3}
                className="resize-none"
                data-testid="input-new-post"
              />
              {postImage && (
                <div className="relative inline-block">
                  <img src={postImage} alt="Preview" className="max-h-40 rounded-lg border border-border object-cover" />
                  <button
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                    onClick={() => setPostImage(null)}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-between items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-attach-image"
            >
              <ImagePlus size={16} className="mr-1.5" />
              Photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], false)}
            />
            <Button
              onClick={handlePost}
              disabled={postMutation.isPending || !newPost.trim()}
              data-testid="button-post"
            >
              <Send size={14} className="mr-2" />
              {postMutation.isPending ? "Posting..." : "Post"}
            </Button>
          </div>
        </CardContent>
      </Card></TiltCard>

      {/* Reply box */}
      {replyingTo && (
        <TiltCard className="rounded-3xl"><Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-primary flex items-center gap-1.5">
                <Reply size={14} />
                Replying to {replyingTo.name}
              </p>
              <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyImage(null); }} className="h-7 px-2 text-xs">
                Cancel
              </Button>
            </div>
            <Textarea
              placeholder={`Reply to ${replyingTo.name}...`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              className="resize-none"
              data-testid="input-reply"
              autoFocus
            />
            {replyImage && (
              <div className="relative inline-block">
                <img src={replyImage} alt="Preview" className="max-h-32 rounded-lg border border-border object-cover" />
                <button
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                  onClick={() => setReplyImage(null)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="flex flex-wrap justify-between items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => replyFileInputRef.current?.click()}
              >
                <ImagePlus size={15} className="mr-1.5" />
                Photo
              </Button>
              <input
                ref={replyFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], true)}
              />
              <Button
                size="sm"
                onClick={handleReply}
                disabled={postMutation.isPending || !replyText.trim()}
                data-testid="button-send-reply"
              >
                <Send size={13} className="mr-1.5" />
                Reply
              </Button>
            </div>
          </CardContent>
        </Card></TiltCard>
      )}

      {/* Pinned count hint */}
      {pinnedPosts.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
          <Pin size={12} />
          <span>{pinnedPosts.length} pinned message{pinnedPosts.length > 1 ? "s" : ""} shown at top</span>
          {isModeratorRole && <span className="ml-auto text-muted-foreground">Click the pin icon on any post to pin/unpin</span>}
        </div>
      )}

      {/* Posts Feed */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)
        ) : orderedPosts.length === 0 ? (
          <TiltCard className="rounded-3xl"><Card>
            <CardContent className="py-12 text-center">
              <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No posts yet. Be the first to start a discussion!</p>
            </CardContent>
          </Card></TiltCard>
        ) : (
          orderedPosts.map((post) => (
            <TiltCard key={post.id} className="rounded-3xl">
              <PostCard
                post={post}
                replies={getReplies(post.id)}
                currentUserRole={user.role}
                onReply={(id, name) => { setReplyingTo({ id, name }); setReplyText(""); setReplyImage(null); }}
                onDelete={handleDelete}
                onPin={handlePin}
                onMessage={handleDirectMessage}
              />
            </TiltCard>
          ))
        )}
      </div>
      </div>)}
    </div>
  );
}
