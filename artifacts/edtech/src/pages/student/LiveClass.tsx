import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, Download, WifiOff, Loader2, Video, Send, MessageSquare, BarChart2, CheckCircle2, Volume2, VolumeX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Material { id: number; name: string; mimeType: string; uploadedAt: string; }
interface ChatMsg { senderId: number; senderName: string; senderRole: string; text: string; timestamp: number; }

interface LivePoll {
  pollId: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  active: boolean;
  myVote: number | null;
}

type LiveState = "connecting" | "waiting" | "watching" | "ended";

export default function StudentLiveClass() {
  const { id } = useParams<{ id: string }>();
  const classId = parseInt(id, 10);
  const { user } = useAuth();
  const { toast } = useToast();

  const frameImgRef = useRef<HTMLImageElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Audio playback via MediaSource
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isAppendingRef = useRef(false);
  const audioReadyRef = useRef(false);

  const [audioMuted, setAudioMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const [liveState, setLiveState] = useState<LiveState>("connecting");
  const [downloading, setDownloading] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Poll state
  const [poll, setPoll] = useState<LivePoll | null>(null);

  const { data: materials = [], refetch: refetchMaterials } = useQuery<Material[]>({
    queryKey: ["materials", classId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${classId}/materials`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed"); return r.json();
    },
  });

  // ── Audio playback setup via MediaSource ──────────────────────────────────
  useEffect(() => {
    if (typeof MediaSource === "undefined") return;
    const mimeType = MediaSource.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaSource.isTypeSupported("audio/webm")
      ? "audio/webm"
      : null;
    if (!mimeType) return;

    const audio = new Audio();
    audio.autoplay = true;
    const ms = new MediaSource();
    const url = URL.createObjectURL(ms);
    audio.src = url;
    audioElementRef.current = audio;

    ms.addEventListener("sourceopen", () => {
      try {
        const sb = ms.addSourceBuffer(mimeType);
        sourceBufferRef.current = sb;
        audioReadyRef.current = true;

        const appendNext = () => {
          if (sb.updating || audioQueueRef.current.length === 0) return;
          try {
            // Trim old data to keep buffer from growing indefinitely
            if (sb.buffered.length > 0) {
              const buffEnd = sb.buffered.end(sb.buffered.length - 1);
              if (buffEnd > 30) {
                sb.remove(0, buffEnd - 20);
                return; // updateend fires again after remove
              }
            }
            isAppendingRef.current = true;
            sb.appendBuffer(audioQueueRef.current.shift()!);
          } catch {}
        };

        sb.addEventListener("updateend", () => {
          isAppendingRef.current = false;
          appendNext();
        });
      } catch (e) {
        console.warn("SourceBuffer init failed:", e);
      }
    });

    audio.play().catch(() => setAudioBlocked(true));

    return () => {
      audioReadyRef.current = false;
      sourceBufferRef.current = null;
      audioQueueRef.current = [];
      isAppendingRef.current = false;
      try { ms.endOfStream(); } catch {}
      URL.revokeObjectURL(url);
      audioElementRef.current = null;
    };
  }, []);

  // Sync muted state with audio element
  useEffect(() => {
    if (audioElementRef.current) audioElementRef.current.muted = audioMuted;
  }, [audioMuted]);

  useEffect(() => {
    let cancelled = false;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${BASE}/api/live/${classId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) { ws.close(); return; }
      ws.send(JSON.stringify({ type: "join", role: "student", userId: user?.id, name: user?.fullName }));
    };

    ws.onmessage = (e) => {
      if (cancelled) return;
      if (e.data instanceof Blob) return;
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === "room-state") setLiveState("waiting");
      if (msg.type === "teacher-joined") setLiveState("waiting");
      if (msg.type === "video-frame" && msg.data) {
        const now = Date.now();
        if (now - lastFrameTimeRef.current < 50) return;
        lastFrameTimeRef.current = now;
        if (frameImgRef.current) {
          frameImgRef.current.src = msg.data;
          setLiveState((prev) => prev !== "watching" ? "watching" : prev);
        }
      }
      if (msg.type === "teacher-left") {
        setLiveState("ended");
        if (frameImgRef.current) frameImgRef.current.src = "";
      }

      // Audio playback
      if (msg.type === "audio-chunk" && msg.data && audioReadyRef.current) {
        try {
          const base64 = (msg.data as string).split(",")[1];
          if (base64) {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const buffer = bytes.buffer;
            const sb = sourceBufferRef.current;
            if (sb && !sb.updating && !isAppendingRef.current && audioQueueRef.current.length === 0) {
              isAppendingRef.current = true;
              sb.appendBuffer(buffer);
            } else if (sb) {
              audioQueueRef.current.push(buffer);
              // Prevent queue from growing too large — drop oldest chunks under load
              if (audioQueueRef.current.length > 15) {
                audioQueueRef.current = audioQueueRef.current.slice(-8);
              }
            }
            // Resume playback if stalled (e.g., after browser autoplay block lifted)
            const audio = audioElementRef.current;
            if (audio && audio.paused && !audioMuted) {
              audio.play().catch(() => setAudioBlocked(true));
            }
          }
        } catch (e) {
          // ignore decode errors
        }
      }
      if (msg.type === "slides-updated") { refetchMaterials(); toast({ title: "Teacher shared new slides!" }); }
      if (msg.type === "chat") {
        setChatMessages((prev) => [...prev, msg as ChatMsg]);
        setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, 50);
      }

      // Poll events
      if (msg.type === "poll-start") {
        setPoll({ pollId: msg.pollId, options: msg.options, votes: msg.votes, totalVotes: 0, active: true, myVote: null });
        toast({ title: "📊 Poll started!" });
      }
      if (msg.type === "poll-update") {
        setPoll((prev) => prev ? { ...prev, votes: msg.votes, totalVotes: msg.totalVotes } : null);
      }
      if (msg.type === "poll-ended") {
        setPoll((prev) => prev ? { ...prev, votes: msg.votes, totalVotes: msg.totalVotes, active: false } : null);
        toast({ title: "Poll ended", description: "See the final results below" });
      }
    };

    ws.onerror = () => { if (!cancelled) setLiveState("ended"); };
    ws.onclose = () => { if (!cancelled) setLiveState((s) => s === "watching" ? "ended" : s); };

    return () => { cancelled = true; ws.close(); };
  }, [classId, user?.id, user?.fullName, refetchMaterials, toast]);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "chat", text }));
    setChatInput("");
  }, [chatInput]);

  const votePoll = useCallback((optionIdx: number) => {
    if (!poll || !poll.active || poll.myVote !== null) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "poll-vote", pollId: poll.pollId, optionIdx }));
    setPoll((prev) => prev ? { ...prev, myVote: optionIdx } : null);
  }, [poll]);

  const downloadMaterial = async (material: Material) => {
    setDownloading(material.id);
    try {
      const r = await fetch(`${BASE}/api/classes/${classId}/materials/${material.id}/download`, { credentials: "include" });
      if (!r.ok) throw new Error("Download failed");
      const { fileData, name } = await r.json();
      const a = document.createElement("a"); a.href = fileData; a.download = name; a.click();
    } catch { toast({ title: "Download failed", variant: "destructive" }); }
    finally { setDownloading(null); }
  };

  const isConnected = liveState !== "connecting";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/student/class/${classId}`}>
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Back</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Live Class</h1>
          <p className="text-sm text-muted-foreground">
            {liveState === "watching" ? "You are watching the live stream" :
             liveState === "waiting" ? "Waiting for teacher to start streaming..." :
             liveState === "ended" ? "Class has ended" : "Connecting..."}
          </p>
        </div>
        <Badge variant={liveState === "watching" ? "destructive" : liveState === "waiting" ? "secondary" : "outline"}>
          {liveState === "watching" ? "● LIVE" : liveState === "waiting" ? "Waiting" : liveState === "ended" ? "Ended" : "Connecting"}
        </Badge>
        {liveState === "watching" && (
          <Button size="sm" variant="ghost" onClick={() => {
            setAudioMuted((m) => !m);
            if (audioBlocked && audioElementRef.current) {
              audioElementRef.current.play().then(() => setAudioBlocked(false)).catch(() => {});
            }
          }} title={audioMuted ? "Unmute" : "Mute"}>
            {audioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Video + Poll */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="overflow-hidden bg-black border-2 border-border">
            <div className="relative bg-black flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
              <img ref={frameImgRef} alt="Live stream"
                className={`w-full h-full object-contain ${liveState !== "watching" ? "hidden" : ""}`}
                data-testid="video-teacher-stream" />

              {liveState !== "watching" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                  {liveState === "connecting" && (<><Loader2 size={40} className="animate-spin text-white/60" /><p className="text-white/70 text-sm">Connecting to class...</p></>)}
                  {liveState === "waiting" && (
                    <>
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center animate-pulse"><Video size={28} className="text-white/60" /></div>
                      <p className="text-white/80 font-medium">Waiting for teacher</p>
                      <p className="text-white/50 text-sm text-center px-8">The class will start when the teacher goes live</p>
                    </>
                  )}
                  {liveState === "ended" && (
                    <>
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center"><WifiOff size={28} className="text-white/60" /></div>
                      <p className="text-white/80 font-medium">Class ended</p>
                      <p className="text-white/50 text-sm">The teacher has left</p>
                    </>
                  )}
                </div>
              )}

              {liveState === "watching" && (
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-semibold tracking-wide animate-pulse">● LIVE</span>
                  {audioBlocked && (
                    <button
                      onClick={() => {
                        audioElementRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {});
                      }}
                      className="text-xs bg-black/70 text-white px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-black/90 transition-colors"
                    >
                      <VolumeX size={11} /> Tap to enable audio
                    </button>
                  )}
                </div>
              )}

              {/* Live Poll overlay on video */}
              {poll && poll.active && (
                <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart2 size={14} className="text-primary" />
                    <span className="text-white text-xs font-semibold">Live Poll</span>
                    {poll.myVote !== null && (
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5">Voted ✓</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {poll.options.map((opt, i) => {
                      const pct = poll.totalVotes > 0 ? Math.round((poll.votes[i] / poll.totalVotes) * 100) : 0;
                      const isMyVote = poll.myVote === i;
                      const hasVoted = poll.myVote !== null;
                      return (
                        <button key={i} onClick={() => votePoll(i)} disabled={hasVoted}
                          className={`relative text-left rounded-lg px-3 py-2 text-sm font-medium transition-all overflow-hidden border ${isMyVote ? "border-primary bg-primary text-primary-foreground" : hasVoted ? "border-white/20 bg-white/10 text-white cursor-not-allowed" : "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50"}`}>
                          {/* Vote bar background */}
                          {hasVoted && (
                            <div className="absolute inset-0 bg-primary/20 transition-all" style={{ width: `${pct}%` }} />
                          )}
                          <div className="relative flex items-center justify-between gap-2">
                            <span className="truncate">{opt}</span>
                            {hasVoted && (
                              <span className="text-xs font-bold shrink-0">{pct}%</span>
                            )}
                            {isMyVote && <CheckCircle2 size={13} className="shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {poll.myVote !== null && (
                    <p className="text-white/60 text-[11px] mt-2 text-center">{poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""} so far</p>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Poll ended results */}
          {poll && !poll.active && (
            <Card className="border-primary/20">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart2 size={14} className="text-primary" />Poll Results
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {poll.options.map((opt, i) => {
                    const pct = poll.totalVotes > 0 ? Math.round((poll.votes[i] / poll.totalVotes) * 100) : 0;
                    const isMyVote = poll.myVote === i;
                    const isWinner = poll.votes[i] === Math.max(...poll.votes);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1.5">
                            {isMyVote && <CheckCircle2 size={13} className="text-primary" />}
                            <span className={isWinner ? "font-semibold" : ""}>{opt}</span>
                            {isWinner && <Badge variant="secondary" className="text-[10px] h-4 px-1">Most votes</Badge>}
                          </div>
                          <span className="text-muted-foreground text-xs">{poll.votes[i]} ({pct}%)</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${isWinner ? "bg-primary" : "bg-primary/40"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground mt-2">Total: {poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Slides Download */}
          {materials.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><FileText size={14} className="text-primary" />Class Slides</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {materials.map((m) => (
                    <Button key={m.id} size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={downloading === m.id} onClick={() => downloadMaterial(m)} data-testid={`button-download-material-${m.id}`}>
                      {downloading === m.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      {m.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Chat Panel */}
        <Card className="flex flex-col" style={{ minHeight: 440 }}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare size={14} className="text-primary" />Live Chat
              {chatMessages.length > 0 && <Badge variant="secondary" className="ml-auto text-xs">{chatMessages.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 px-3 pb-3 gap-2" style={{ minHeight: 0 }}>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 360 }}>
              {chatMessages.length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Be the first to say hi!</p>
                </div>
              ) : chatMessages.map((m, i) => {
                const isTeacher = m.senderRole === "teacher";
                const isMe = m.senderId === user?.id;
                return (
                  <div key={i} className={`flex gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${isTeacher ? "bg-primary text-primary-foreground" : isMe ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}>
                      {m.senderName.charAt(0).toUpperCase()}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-2.5 py-1.5 ${isMe ? "bg-blue-500 text-white rounded-tr-sm" : isTeacher ? "bg-primary text-primary-foreground rounded-tl-sm" : "bg-muted rounded-tl-sm"}`}>
                      {!isMe && <p className={`text-[10px] font-semibold mb-0.5 ${isTeacher ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{isTeacher ? `${m.senderName} (Teacher)` : m.senderName}</p>}
                      <p className="text-xs break-words leading-snug">{m.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              <Input className="h-8 text-xs flex-1" placeholder={isConnected ? "Type a message..." : "Connecting..."}
                value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                disabled={!isConnected || liveState === "ended"} data-testid="chat-input-student" />
              <Button size="sm" className="h-8 w-8 p-0 shrink-0" onClick={sendChat}
                disabled={!isConnected || !chatInput.trim() || liveState === "ended"} data-testid="button-send-chat-student">
                <Send size={13} />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
