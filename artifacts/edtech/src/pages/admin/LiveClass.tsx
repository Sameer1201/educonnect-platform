import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Mic, MicOff, Video, VideoOff, Users, Upload, FileText, Trash2,
  Presentation, PenLine, Eraser, Trash, ChevronLeft, ChevronRight, Download,
  Camera, Send, MessageSquare, Highlighter, Square, Circle, ArrowUpRight, Type,
  Undo2, Redo2, X, Plus, BarChart2, StopCircle, Move, StickyNote, ImageIcon,
  Zap, Eye, Grid3x3, Crosshair
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const FRAME_INTERVAL_MS = 100;
const FRAME_WIDTH = 960;
const FRAME_HEIGHT = 540;
const JPEG_QUALITY = 0.55;
const CAM_PIP_SIZE = 150;
const CAM_PIP_SIZE_MIN = 80;
const CAM_PIP_SIZE_MAX = 300;
const GRID_SIZE = 40;

interface Student { studentId: number; name: string; }
interface Material { id: number; name: string; mimeType: string; uploadedAt: string; }
interface ChatMsg { senderId: number; senderName: string; senderRole: string; text: string; timestamp: number; }
interface ActivePoll { pollId: string; options: string[]; votes: number[]; totalVotes: number; active: boolean; }
type DrawTool = "pen" | "highlighter" | "eraser" | "line" | "rect" | "circle" | "arrow" | "text" | "sticky" | "move" | "laser";
type SlideItem = { type: "pdf"; pageNum: number } | { type: "blank"; id: string };

const COLORS = ["#1a1a1a", "#e63946", "#2196F3", "#4CAF50", "#ff9800", "#9c27b0", "#ffffff", "#f4d03f"];
const SIZES = [2, 5, 10, 18];
const FONTS = ["sans-serif", "serif", "monospace", "cursive"];
const FONT_SIZES = [14, 18, 24, 32, 48];
const STICKY_COLORS = ["#fef08a", "#fda4af", "#93c5fd", "#86efac", "#fdba74"];

function drawArrowShape(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number) {
  const headLen = Math.max(18, w * 3);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawStickyNote(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bgColor: string) {
  const W = 220, H = 130, R = 6;
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 8; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.moveTo(x + R, y); ctx.lineTo(x + W - R, y); ctx.arcTo(x + W, y, x + W, y + R, R);
  ctx.lineTo(x + W, y + H - R); ctx.arcTo(x + W, y + H, x + W - R, y + H, R);
  ctx.lineTo(x + R, y + H); ctx.arcTo(x, y + H, x, y + H - R, R);
  ctx.lineTo(x, y + R); ctx.arcTo(x, y, x + R, y, R);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Header band
  ctx.save();
  ctx.fillStyle = bgColor === "#fef08a" ? "#fde047" : bgColor === "#fda4af" ? "#f9a8d4" : bgColor === "#93c5fd" ? "#60a5fa" : bgColor === "#86efac" ? "#4ade80" : "#fb923c";
  ctx.beginPath();
  ctx.moveTo(x + R, y); ctx.lineTo(x + W - R, y); ctx.arcTo(x + W, y, x + W, y + R, R); ctx.lineTo(x + W, y + 22);
  ctx.lineTo(x, y + 22); ctx.lineTo(x, y + R); ctx.arcTo(x, y, x + R, y, R);
  ctx.closePath(); ctx.fill(); ctx.restore();
  // Text
  ctx.save();
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "13px sans-serif";
  const words = text.split(" "); let line = "", lines: string[] = [];
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > W - 20 && line) { lines.push(line.trim()); line = word + " "; }
    else line = test;
  }
  lines.push(line.trim());
  lines.slice(0, 5).forEach((l, i) => ctx.fillText(l, x + 10, y + 38 + i * 18));
  ctx.restore();
}

export default function TeacherLiveClass() {
  const { id } = useParams<{ id: string }>();
  const classId = parseInt(id, 10);
  const { user } = useAuth();
  const { toast } = useToast();

  // ─── Refs ────────────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawContainerRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorHighlightRef = useRef<HTMLDivElement | null>(null);
  const laserDotRef = useRef<HTMLDivElement | null>(null);

  // Drawing refs
  const isDrawingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const baseImageRef = useRef<ImageData | null>(null);
  const moveBaseRef = useRef<ImageData | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);

  // Effect refs (streamed)
  const laserActiveRef = useRef(false);
  const laserPosRef = useRef<{ x: number; y: number } | null>(null);
  const spotlightActiveRef = useRef(false);
  const spotlightPosRef = useRef<{ x: number; y: number } | null>(null);
  const showGridRef = useRef(false);
  const snapToGridRef = useRef(false);
  const cursorHighlightActiveRef = useRef(false);
  const slideModeRef = useRef(false);
  const showCameraRef = useRef(true);
  const toolRef = useRef<DrawTool>("pen");
  const colorRef = useRef(COLORS[0]);
  const lineWidthRef = useRef(SIZES[1]);
  const fontSizeRef = useRef(24);
  const fontFamilyRef = useRef("sans-serif");
  const stickyColorRef = useRef(STICKY_COLORS[0]);

  // Camera PiP position/size (in canvas coords)
  const camPipCenterRef = useRef({ x: FRAME_WIDTH - CAM_PIP_SIZE / 2 - 14, y: FRAME_HEIGHT - CAM_PIP_SIZE / 2 - 14 });
  const camPipSizeRef = useRef(CAM_PIP_SIZE);
  const camDraggingRef = useRef(false);
  const camDragStartRef = useRef<{ mx: number; my: number; pipX: number; pipY: number } | null>(null);

  // Audio streaming
  const audioRecorderRef = useRef<MediaRecorder | null>(null);

  // Text tool
  const textPosRef = useRef<{ x: number; y: number } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const stickyPosRef = useRef<{ x: number; y: number } | null>(null);

  // ─── State ───────────────────────────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(true);

  // Slide state
  const [slideMode, setSlideMode] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [slideIdx, setSlideIdx] = useState(0);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [pageAnnotations, setPageAnnotations] = useState<Record<string, string>>({});

  // Drawing state
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(SIZES[1]);
  const [fontSize, setFontSize] = useState(24);
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Text + Sticky
  const [textToolActive, setTextToolActive] = useState(false);
  const [textInputValue, setTextInputValue] = useState("");
  const [stickyActive, setStickyActive] = useState(false);
  const [stickyText, setStickyText] = useState("");

  // Effects state
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [spotlightMode, setSpotlightMode] = useState(false);
  const [cursorHighlightMode, setCursorHighlightMode] = useState(false);
  const [laserMode, setLaserMode] = useState(false);

  // Camera PiP UI state
  const [camPipCenter, setCamPipCenter] = useState({ x: FRAME_WIDTH - CAM_PIP_SIZE / 2 - 14, y: FRAME_HEIGHT - CAM_PIP_SIZE / 2 - 14 });
  const [camPipSize, setCamPipSize] = useState(CAM_PIP_SIZE);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Poll state
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollOptions, setPollOptions] = useState(["Option A", "Option B", "Option C", ""]);

  // Sync refs with state
  useEffect(() => { slideModeRef.current = slideMode; }, [slideMode]);
  useEffect(() => { showCameraRef.current = showCamera; }, [showCamera]);
  useEffect(() => { toolRef.current = tool; laserActiveRef.current = tool === "laser"; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { lineWidthRef.current = lineWidth; }, [lineWidth]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { fontFamilyRef.current = fontFamily; }, [fontFamily]);
  useEffect(() => { stickyColorRef.current = stickyColor; }, [stickyColor]);
  useEffect(() => { spotlightActiveRef.current = spotlightMode; }, [spotlightMode]);
  useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  useEffect(() => { snapToGridRef.current = snapToGrid; }, [snapToGrid]);
  useEffect(() => { cursorHighlightActiveRef.current = cursorHighlightMode; }, [cursorHighlightMode]);
  useEffect(() => { camPipCenterRef.current = camPipCenter; }, [camPipCenter]);
  useEffect(() => { camPipSizeRef.current = camPipSize; }, [camPipSize]);

  // Camera PiP drag handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!camDraggingRef.current || !camDragStartRef.current) return;
      const container = drawContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scaleX = FRAME_WIDTH / rect.width;
      const scaleY = FRAME_HEIGHT / rect.height;
      const dx = (e.clientX - camDragStartRef.current.mx) * scaleX;
      const dy = (e.clientY - camDragStartRef.current.my) * scaleY;
      const r = camPipSizeRef.current / 2;
      const newX = Math.max(r, Math.min(FRAME_WIDTH - r, camDragStartRef.current.pipX + dx));
      const newY = Math.max(r, Math.min(FRAME_HEIGHT - r, camDragStartRef.current.pipY + dy));
      const newPos = { x: newX, y: newY };
      camPipCenterRef.current = newPos;
      setCamPipCenter(newPos);
    };
    const onUp = () => { camDraggingRef.current = false; camDragStartRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Draw grid canvas
  useEffect(() => {
    const gc = gridCanvasRef.current; if (!gc) return;
    const ctx = gc.getContext("2d")!;
    ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    if (!showGrid) return;
    ctx.strokeStyle = "rgba(99,102,241,0.2)"; ctx.lineWidth = 1;
    for (let x = 0; x < FRAME_WIDTH; x += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FRAME_HEIGHT); ctx.stroke(); }
    for (let y = 0; y < FRAME_HEIGHT; y += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FRAME_WIDTH, y); ctx.stroke(); }
  }, [showGrid]);

  const { data: materials = [], refetch: refetchMaterials } = useQuery<Material[]>({
    queryKey: ["materials", classId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${classId}/materials`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed"); return r.json();
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (materialId: number) => {
      await fetch(`${BASE}/api/classes/${classId}/materials/${materialId}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => { refetchMaterials(); toast({ title: "Slide removed" }); },
  });

  const wsSend = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(data));
  }, []);

  // ─── History ─────────────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    const dc = drawCanvasRef.current; if (!dc) return;
    const dataUrl = dc.toDataURL("image/png");
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(dataUrl); historyIdxRef.current = historyRef.current.length - 1;
    setCanUndo(true); setCanRedo(false);
  }, []);

  const restoreHistory = useCallback((dataUrl: string) => {
    const dc = drawCanvasRef.current; if (!dc) return;
    const ctx = dc.getContext("2d")!; ctx.clearRect(0, 0, dc.width, dc.height);
    const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = dataUrl;
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current < 0) return;
    if (historyIdxRef.current === 0) {
      drawCanvasRef.current?.getContext("2d")!.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      historyIdxRef.current = -1; setCanUndo(false); setCanRedo(true); return;
    }
    historyIdxRef.current--;
    restoreHistory(historyRef.current[historyIdxRef.current]);
    setCanUndo(historyIdxRef.current >= 0); setCanRedo(true);
  }, [restoreHistory]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    restoreHistory(historyRef.current[historyIdxRef.current]);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1); setCanUndo(true);
  }, [restoreHistory]);

  // ─── Frame streaming ──────────────────────────────────────────────────────
  const startFrameStream = useCallback(() => {
    if (frameTimerRef.current) return;
    const capture = document.createElement("canvas");
    capture.width = FRAME_WIDTH; capture.height = FRAME_HEIGHT;
    captureCanvasRef.current = capture;
    const ctx = capture.getContext("2d")!;

    frameTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      if (slideModeRef.current && pdfCanvasRef.current) {
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        ctx.drawImage(pdfCanvasRef.current, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        if (drawCanvasRef.current) ctx.drawImage(drawCanvasRef.current, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

        // Grid overlay
        if (showGridRef.current) {
          ctx.save(); ctx.strokeStyle = "rgba(99,102,241,0.2)"; ctx.lineWidth = 1;
          for (let x = 0; x < FRAME_WIDTH; x += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FRAME_HEIGHT); ctx.stroke(); }
          for (let y = 0; y < FRAME_HEIGHT; y += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FRAME_WIDTH, y); ctx.stroke(); }
          ctx.restore();
        }

        // Camera PiP
        if (showCameraRef.current) {
          const video = localVideoRef.current;
          if (video && video.readyState >= 2 && streamRef.current) {
            const { x: cx, y: cy } = camPipCenterRef.current;
            const size = camPipSizeRef.current;
            const r = size / 2;
            const px = cx - r, py = cy - r;
            ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(video, px, py, size, size); ctx.restore();
            ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
          }
        }

        // Spotlight mode
        if (spotlightActiveRef.current && spotlightPosRef.current) {
          const { x, y } = spotlightPosRef.current; const radius = 130;
          const ov = document.createElement("canvas"); ov.width = FRAME_WIDTH; ov.height = FRAME_HEIGHT;
          const oc = ov.getContext("2d")!;
          oc.fillStyle = "rgba(0,0,0,0.78)"; oc.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
          oc.globalCompositeOperation = "destination-out";
          const grad = oc.createRadialGradient(x, y, radius * 0.5, x, y, radius);
          grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
          oc.fillStyle = grad; oc.beginPath(); oc.arc(x, y, radius, 0, Math.PI * 2); oc.fill();
          ctx.drawImage(ov, 0, 0);
        }

        // Laser pointer
        if (laserActiveRef.current && laserPosRef.current) {
          const { x, y } = laserPosRef.current;
          ctx.save();
          const grad = ctx.createRadialGradient(x, y, 0, x, y, 28);
          grad.addColorStop(0, "rgba(255,0,50,0.95)");
          grad.addColorStop(0.3, "rgba(255,80,80,0.55)");
          grad.addColorStop(1, "rgba(255,0,0,0)");
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ff0030"; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      } else {
        const video = localVideoRef.current;
        if (video && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        } else if (video && video.readyState < 2 && video.srcObject) {
          // Video not ready yet — try to restart and send black frame so student sees "watching" state
          video.play().catch(() => {});
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        } else {
          return;
        }
      }

      capture.toBlob((blob) => {
        if (!blob || wsRef.current?.readyState !== WebSocket.OPEN) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "video-frame", data: reader.result }));
        };
        reader.readAsDataURL(blob);
      }, "image/jpeg", JPEG_QUALITY);
    }, FRAME_INTERVAL_MS);
  }, []);

  const stopFrameStream = useCallback(() => {
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
  }, []);

  // ─── WebSocket + Camera ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        if (cameraPreviewRef.current) {
          cameraPreviewRef.current.srcObject = stream;
          cameraPreviewRef.current.play().catch(() => {});
        }
      } catch { toast({ title: "Camera access failed", variant: "destructive" }); }
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}${BASE}/api/live/${classId}`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setIsConnected(true);
        ws.send(JSON.stringify({ type: "join", role: "teacher", userId: user?.id, name: user?.fullName }));
        if (streamRef.current) startFrameStream();

        // ── Audio streaming via MediaRecorder ──────────────────────────────
        const audioTracks = streamRef.current?.getAudioTracks() ?? [];
        if (audioTracks.length > 0) {
          try {
            const audioStream = new MediaStream(audioTracks);
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : MediaRecorder.isTypeSupported("audio/webm")
              ? "audio/webm"
              : "audio/ogg;codecs=opus";
            const recorder = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 32000 });
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                const reader = new FileReader();
                reader.onload = () => {
                  if (wsRef.current?.readyState === WebSocket.OPEN)
                    wsRef.current.send(JSON.stringify({ type: "audio-chunk", data: reader.result }));
                };
                reader.readAsDataURL(e.data);
              }
            };
            recorder.start(200);
            audioRecorderRef.current = recorder;
          } catch (err) {
            console.warn("Audio recording not supported:", err);
          }
        }
      };
      ws.onmessage = (e) => {
        if (cancelled) return;
        const msg = JSON.parse(e.data);
        if (msg.type === "room-state") setStudents(msg.students ?? []);
        if (msg.type === "student-joined") setStudents((prev) => prev.find((s) => s.studentId === msg.studentId) ? prev : [...prev, { studentId: msg.studentId, name: msg.name }]);
        if (msg.type === "student-left") setStudents((prev) => prev.filter((s) => s.studentId !== msg.studentId));
        if (msg.type === "chat") {
          setChatMessages((prev) => [...prev, msg as ChatMsg]);
          setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, 50);
        }
        if (msg.type === "poll-start" || msg.type === "poll-update") {
          setActivePoll((prev) => ({ pollId: msg.pollId, options: msg.options ?? prev?.options ?? [], votes: msg.votes, totalVotes: msg.totalVotes ?? 0, active: true }));
        }
        if (msg.type === "poll-ended") {
          setActivePoll({ pollId: msg.pollId, options: msg.options, votes: msg.votes, totalVotes: msg.totalVotes, active: false });
        }
      };
      ws.onclose = () => {
        if (!cancelled) {
          setIsConnected(false); stopFrameStream();
          try { if (audioRecorderRef.current?.state !== "inactive") audioRecorderRef.current?.stop(); } catch {}
          audioRecorderRef.current = null;
        }
      };
      ws.onerror = () => {
        if (!cancelled) {
          setIsConnected(false); stopFrameStream();
          try { if (audioRecorderRef.current?.state !== "inactive") audioRecorderRef.current?.stop(); } catch {}
          audioRecorderRef.current = null;
        }
      };
    }
    start();
    return () => {
      cancelled = true; stopFrameStream();
      try { if (audioRecorderRef.current?.state !== "inactive") audioRecorderRef.current?.stop(); } catch {}
      audioRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
    };
  }, [classId, user?.id, user?.fullName, startFrameStream, stopFrameStream, toast]);

  // ─── Clipboard paste (Ctrl+V image) ──────────────────────────────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!slideMode) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            const dc = drawCanvasRef.current; if (!dc) return;
            const ctx = dc.getContext("2d")!;
            const scale = Math.min((FRAME_WIDTH * 0.6) / img.width, (FRAME_HEIGHT * 0.6) / img.height, 1);
            const w = img.width * scale, h = img.height * scale;
            ctx.drawImage(img, (FRAME_WIDTH - w) / 2, (FRAME_HEIGHT - h) / 2, w, h);
            pushHistory(); URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [slideMode, pushHistory]);

  // ─── Slide key ────────────────────────────────────────────────────────────
  const slideKey = useCallback((item: SlideItem) => item.type === "pdf" ? `pdf-${item.pageNum}` : item.id, []);

  // ─── Snap helper ─────────────────────────────────────────────────────────
  const snap = useCallback((pos: { x: number; y: number }) => {
    if (!snapToGridRef.current) return pos;
    return { x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE, y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE };
  }, []);

  // ─── Slide rendering ──────────────────────────────────────────────────────
  const renderSlide = useCallback(async (slide: SlideItem, doc: pdfjs.PDFDocumentProxy | null, savedAnnotation?: string) => {
    const canvas = pdfCanvasRef.current; if (!canvas) return;
    canvas.width = FRAME_WIDTH; canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    if (slide.type === "pdf" && doc) {
      const page = await doc.getPage(slide.pageNum);
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(FRAME_WIDTH / vp.width, FRAME_HEIGHT / vp.height);
      const sv = page.getViewport({ scale });
      ctx.save(); ctx.translate((FRAME_WIDTH - sv.width) / 2, (FRAME_HEIGHT - sv.height) / 2);
      await page.render({ canvasContext: ctx, viewport: sv }).promise; ctx.restore();
    }
    const dc = drawCanvasRef.current;
    if (dc) {
      dc.width = FRAME_WIDTH; dc.height = FRAME_HEIGHT;
      const dctx = dc.getContext("2d")!; dctx.clearRect(0, 0, dc.width, dc.height);
      if (savedAnnotation) { const img = new Image(); img.onload = () => dctx.drawImage(img, 0, 0); img.src = savedAnnotation; }
    }
    historyRef.current = []; historyIdxRef.current = -1; setCanUndo(false); setCanRedo(false);
  }, []);

  useEffect(() => {
    if (!slideMode || slides.length === 0) return;
    let cancelled = false;
    requestAnimationFrame(() => { if (!cancelled) { const s = slides[slideIdx]; renderSlide(s, pdfDoc, pageAnnotations[slideKey(s)]); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideMode, slideIdx, slides.length]);

  // ─── Thumbnails ───────────────────────────────────────────────────────────
  const generateThumbnails = useCallback(async (doc: pdfjs.PDFDocumentProxy, slideList: SlideItem[]) => {
    const thumbs: Record<string, string> = {};
    for (const slide of slideList) {
      const key = slideKey(slide);
      if (slide.type === "blank") {
        const tc = document.createElement("canvas"); tc.width = 160; tc.height = 90;
        const tctx = tc.getContext("2d")!; tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, 160, 90);
        tctx.strokeStyle = "#e2e8f0"; tctx.strokeRect(0.5, 0.5, 159, 89);
        thumbs[key] = tc.toDataURL();
      } else {
        try {
          const page = await doc.getPage(slide.pageNum);
          const vp = page.getViewport({ scale: 1 });
          const scale = Math.min(160 / vp.width, 90 / vp.height);
          const sv = page.getViewport({ scale });
          const tc = document.createElement("canvas"); tc.width = 160; tc.height = 90;
          const tctx = tc.getContext("2d")!; tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, 160, 90);
          tctx.save(); tctx.translate((160 - sv.width) / 2, (90 - sv.height) / 2);
          await page.render({ canvasContext: tctx, viewport: sv }).promise; tctx.restore();
          thumbs[key] = tc.toDataURL();
        } catch { /* skip */ }
      }
    }
    setThumbnails(thumbs);
  }, [slideKey]);

  const loadPdf = useCallback(async (material: Material) => {
    setLoadingPdf(true);
    try {
      const r = await fetch(`${BASE}/api/classes/${classId}/materials/${material.id}/download`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      const { fileData } = await r.json();
      const base64 = fileData.includes(",") ? fileData.split(",")[1] : fileData;
      const binary = atob(base64); const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      const slideList: SlideItem[] = Array.from({ length: doc.numPages }, (_, i) => ({ type: "pdf" as const, pageNum: i + 1 }));
      setPdfDoc(doc); setPdfName(material.name); setSlides(slideList); setSlideIdx(0); setPageAnnotations({});
      setSlideMode(true); generateThumbnails(doc, slideList);
    } catch (err) { toast({ title: "Failed to load PDF", description: err instanceof Error ? err.message : "", variant: "destructive" }); }
    finally { setLoadingPdf(false); }
  }, [classId, toast, generateThumbnails]);

  const addBlankSlide = useCallback(() => {
    const blankId = `blank-${Date.now()}`;
    const tc = document.createElement("canvas"); tc.width = 160; tc.height = 90;
    const tctx = tc.getContext("2d")!; tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, 160, 90);
    tctx.strokeStyle = "#e2e8f0"; tctx.strokeRect(0.5, 0.5, 159, 89);
    setSlides((prev) => { setTimeout(() => setSlideIdx(prev.length), 0); return [...prev, { type: "blank", id: blankId }]; });
    setThumbnails((t) => ({ ...t, [blankId]: tc.toDataURL() }));
  }, []);

  const saveCurrentAnnotation = useCallback(() => {
    if (!drawCanvasRef.current || slides.length === 0) return;
    const key = slideKey(slides[slideIdx]);
    const dataUrl = drawCanvasRef.current.toDataURL("image/png");
    setPageAnnotations((prev) => ({ ...prev, [key]: dataUrl }));
    if (pdfCanvasRef.current) {
      const tc = document.createElement("canvas"); tc.width = 160; tc.height = 90;
      const tctx = tc.getContext("2d")!;
      tctx.drawImage(pdfCanvasRef.current, 0, 0, 160, 90);
      tctx.drawImage(drawCanvasRef.current, 0, 0, 160, 90);
      const slide = slides[slideIdx];
      setThumbnails((prev) => ({ ...prev, [slide.type === "blank" ? slide.id : `pdf-${(slide as any).pageNum}`]: tc.toDataURL() }));
    }
  }, [slideIdx, slides, slideKey]);

  const goToSlide = useCallback((idx: number) => {
    if (idx < 0 || idx >= slides.length) return;
    saveCurrentAnnotation(); setSlideIdx(idx);
  }, [slides, saveCurrentAnnotation]);

  const exitSlideMode = useCallback(() => { saveCurrentAnnotation(); setSlideMode(false); }, [saveCurrentAnnotation]);

  // Restore camera stream whenever slideMode changes (React remounts video elements in both branches)
  useEffect(() => {
    const assign = () => {
      if (cameraPreviewRef.current && streamRef.current) {
        cameraPreviewRef.current.srcObject = streamRef.current;
        cameraPreviewRef.current.play().catch(() => {});
      }
    };
    assign();
    const t = setTimeout(assign, 80);
    return () => clearTimeout(t);
  }, [slideMode]);

  // ─── Drawing handlers ─────────────────────────────────────────────────────
  const setupDrawCanvas = useCallback((el: HTMLCanvasElement | null) => {
    drawCanvasRef.current = el;
    if (el) { el.width = FRAME_WIDTH; el.height = FRAME_HEIGHT; }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, rect: DOMRect) => {
    const scaleX = FRAME_WIDTH / rect.width, scaleY = FRAME_HEIGHT / rect.height;
    let clientX: number, clientY: number;
    if ("touches" in e) { clientX = e.touches[0]?.clientX ?? 0; clientY = e.touches[0]?.clientY ?? 0; }
    else { clientX = e.clientX; clientY = e.clientY; }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const applyStroke = (ctx: CanvasRenderingContext2D) => {
    ctx.globalCompositeOperation = "source-over";
    const t = toolRef.current, c = colorRef.current, lw = lineWidthRef.current;
    if (t === "highlighter") { ctx.strokeStyle = c + "88"; ctx.lineWidth = lw * 5; }
    else { ctx.strokeStyle = c; ctx.lineWidth = lw; }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
  };

  // Track mouse for laser / spotlight / cursor highlight
  const onContainerMouseMove = useCallback((e: React.MouseEvent) => {
    const dc = drawCanvasRef.current; if (!dc) return;
    const rect = dc.getBoundingClientRect();
    const scaleX = FRAME_WIDTH / rect.width, scaleY = FRAME_HEIGHT / rect.height;
    const fx = (e.clientX - rect.left) * scaleX, fy = (e.clientY - rect.top) * scaleY;
    laserPosRef.current = { x: fx, y: fy };
    spotlightPosRef.current = { x: fx, y: fy };
    const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;
    if (laserDotRef.current) {
      laserDotRef.current.style.left = `${screenX}px`;
      laserDotRef.current.style.top = `${screenY}px`;
    }
    if (cursorHighlightRef.current) {
      cursorHighlightRef.current.style.left = `${screenX}px`;
      cursorHighlightRef.current.style.top = `${screenY}px`;
    }
  }, []);

  const onDrawStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const dc = drawCanvasRef.current; if (!dc) return;
    const rect = dc.getBoundingClientRect();
    let pos = getPos(e, rect);
    const t = toolRef.current;

    if (t === "laser") return; // laser just tracks position

    if (t === "text") {
      textPosRef.current = pos; setTextToolActive(true); setTextInputValue("");
      setTimeout(() => textInputRef.current?.focus(), 50); return;
    }
    if (t === "sticky") {
      stickyPosRef.current = pos; setStickyActive(true); setStickyText(""); return;
    }

    pos = snap(pos);
    startPosRef.current = pos;
    const ctx = dc.getContext("2d")!;

    if (t === "move") {
      moveBaseRef.current = ctx.getImageData(0, 0, dc.width, dc.height);
      isDrawingRef.current = true; return;
    }
    if (t === "pen" || t === "highlighter") { applyStroke(ctx); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
    else if (t === "eraser") { ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = lineWidthRef.current * 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
    else { baseImageRef.current = ctx.getImageData(0, 0, dc.width, dc.height); }
    isDrawingRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  const onDrawMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !startPosRef.current) return;
    const dc = drawCanvasRef.current; if (!dc) return;
    const rect = dc.getBoundingClientRect();
    let pos = getPos(e, rect);
    const t = toolRef.current, ctx = dc.getContext("2d")!;
    const start = startPosRef.current;

    if (t === "move" && moveBaseRef.current) {
      const dx = pos.x - start.x, dy = pos.y - start.y;
      ctx.clearRect(0, 0, dc.width, dc.height);
      ctx.putImageData(moveBaseRef.current, Math.round(dx), Math.round(dy)); return;
    }

    pos = snap(pos);
    if (t === "pen" || t === "highlighter") { applyStroke(ctx); ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
    else if (t === "eraser") { ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = lineWidthRef.current * 4; ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
    else if (baseImageRef.current) {
      ctx.putImageData(baseImageRef.current, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = colorRef.current; ctx.lineWidth = lineWidthRef.current; ctx.lineCap = "round";
      if (t === "line") { ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
      else if (t === "rect") { ctx.beginPath(); ctx.strokeRect(start.x, start.y, pos.x - start.x, pos.y - start.y); }
      else if (t === "circle") { const rx = Math.abs(pos.x - start.x) / 2, ry = Math.abs(pos.y - start.y) / 2; ctx.beginPath(); ctx.ellipse(start.x + (pos.x - start.x) / 2, start.y + (pos.y - start.y) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (t === "arrow") { drawArrowShape(ctx, start.x, start.y, pos.x, pos.y, lineWidthRef.current); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  const onDrawEnd = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false; startPosRef.current = null; baseImageRef.current = null; moveBaseRef.current = null;
    pushHistory();
  }, [pushHistory]);

  const commitText = useCallback(() => {
    if (!textInputValue.trim() || !drawCanvasRef.current || !textPosRef.current) { setTextToolActive(false); return; }
    const ctx = drawCanvasRef.current.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = colorRef.current;
    ctx.font = `bold ${fontSizeRef.current}px ${fontFamilyRef.current}`;
    ctx.fillText(textInputValue, textPosRef.current.x, textPosRef.current.y);
    pushHistory(); setTextToolActive(false); setTextInputValue("");
  }, [textInputValue, pushHistory]);

  const commitSticky = useCallback(() => {
    if (!stickyPosRef.current || !drawCanvasRef.current) { setStickyActive(false); return; }
    const ctx = drawCanvasRef.current.getContext("2d")!;
    drawStickyNote(ctx, stickyPosRef.current.x, stickyPosRef.current.y, stickyText || "Sticky note", stickyColorRef.current);
    pushHistory(); setStickyActive(false); setStickyText("");
  }, [stickyText, pushHistory]);

  const clearAnnotations = useCallback(() => {
    const dc = drawCanvasRef.current; if (!dc) return;
    dc.getContext("2d")!.clearRect(0, 0, dc.width, dc.height); pushHistory();
  }, [pushHistory]);

  // ─── Image upload ─────────────────────────────────────────────────────────
  const handleImageUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dc = drawCanvasRef.current; if (!dc) return;
      const ctx = dc.getContext("2d")!;
      const scale = Math.min((FRAME_WIDTH * 0.7) / img.width, (FRAME_HEIGHT * 0.7) / img.height, 1);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (FRAME_WIDTH - w) / 2, (FRAME_HEIGHT - h) / 2, w, h);
      pushHistory(); URL.revokeObjectURL(url);
      toast({ title: "Image added to slide" });
    };
    img.src = url;
  }, [pushHistory, toast]);

  // ─── Poll ─────────────────────────────────────────────────────────────────
  const launchPoll = useCallback(() => {
    const opts = pollOptions.filter((o) => o.trim());
    if (opts.length < 2) { toast({ title: "Add at least 2 options", variant: "destructive" }); return; }
    wsSend({ type: "poll-create", options: opts });
    setShowPollCreator(false); setPollOptions(["Option A", "Option B", "Option C", ""]);
  }, [pollOptions, wsSend, toast]);

  const endPoll = useCallback(() => { wsSend({ type: "poll-end" }); }, [wsSend]);

  // ─── PDF Export ───────────────────────────────────────────────────────────
  const downloadAnnotatedPdf = useCallback(async () => {
    if (!pdfDoc) return;
    toast({ title: "Generating PDF..." }); saveCurrentAnnotation();
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [FRAME_WIDTH, FRAME_HEIGHT] });
      const tmp = document.createElement("canvas"); tmp.width = FRAME_WIDTH; tmp.height = FRAME_HEIGHT;
      const tc = tmp.getContext("2d")!;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (i > 1) pdf.addPage();
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const scale = Math.min(FRAME_WIDTH / vp.width, FRAME_HEIGHT / vp.height);
        const sv = page.getViewport({ scale });
        const pc = document.createElement("canvas"); pc.width = FRAME_WIDTH; pc.height = FRAME_HEIGHT;
        const pctx = pc.getContext("2d")!; pctx.fillStyle = "#fff"; pctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        pctx.save(); pctx.translate((FRAME_WIDTH - sv.width) / 2, (FRAME_HEIGHT - sv.height) / 2);
        await page.render({ canvasContext: pctx, viewport: sv }).promise; pctx.restore();
        tc.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT); tc.drawImage(pc, 0, 0);
        const annot = pageAnnotations[`pdf-${i}`];
        if (annot) { await new Promise<void>((res) => { const img = new Image(); img.onload = () => { tc.drawImage(img, 0, 0); res(); }; img.src = annot; }); }
        pdf.addImage(tmp.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      }
      pdf.save(`${pdfName.replace(/\.pdf$/i, "")}-annotated.pdf`);
      toast({ title: "PDF downloaded!" });
    } catch { toast({ title: "Export failed", variant: "destructive" }); }
  }, [pdfDoc, pdfName, pageAnnotations, saveCurrentAnnotation, toast]);

  // ─── Slide upload ─────────────────────────────────────────────────────────
  const handlePdfUpload = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast({ title: "File too large", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const fileData = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      const resp = await fetch(`${BASE}/api/classes/${classId}/materials`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, fileData, mimeType: file.type || "application/pdf" }) });
      if (!resp.ok) throw new Error("Upload failed");
      await refetchMaterials(); wsSend({ type: "slides-updated" }); toast({ title: "Slide uploaded!" });
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const toggleMic = () => {
    setMicOn((v) => {
      const newOn = !v;
      streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = newOn; });
      try {
        if (!newOn && audioRecorderRef.current?.state === "recording") audioRecorderRef.current.pause();
        else if (newOn && audioRecorderRef.current?.state === "paused") audioRecorderRef.current.resume();
      } catch {}
      return newOn;
    });
  };
  const toggleCam = () => { streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; }); setCamOn((v) => !v); };
  const sendChat = useCallback(() => { const text = chatInput.trim(); if (!text) return; wsSend({ type: "chat", text }); setChatInput(""); }, [chatInput, wsSend]);

  const setCursorForTool = (t: DrawTool) => {
    if (t === "laser") return "none";
    if (t === "eraser") return "cell";
    if (t === "text") return "text";
    if (t === "move") return "move";
    return "crosshair";
  };

  const totalSlides = slides.length;

  const toolGroups = [
    {
      label: "Draw",
      tools: [
        { id: "pen" as DrawTool, icon: <PenLine size={13} />, label: "Pen" },
        { id: "highlighter" as DrawTool, icon: <Highlighter size={13} />, label: "Highlight" },
        { id: "eraser" as DrawTool, icon: <Eraser size={13} />, label: "Eraser" },
      ]
    },
    {
      label: "Shapes",
      tools: [
        { id: "line" as DrawTool, icon: <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="14" x2="14" y2="2" /></svg>, label: "Line" },
        { id: "rect" as DrawTool, icon: <Square size={13} />, label: "Rect" },
        { id: "circle" as DrawTool, icon: <Circle size={13} />, label: "Circle" },
        { id: "arrow" as DrawTool, icon: <ArrowUpRight size={13} />, label: "Arrow" },
      ]
    },
    {
      label: "Content",
      tools: [
        { id: "text" as DrawTool, icon: <Type size={13} />, label: "Text" },
        { id: "sticky" as DrawTool, icon: <StickyNote size={13} />, label: "Sticky" },
        { id: "move" as DrawTool, icon: <Move size={13} />, label: "Move" },
        { id: "laser" as DrawTool, icon: <Zap size={13} />, label: "Laser" },
      ]
    },
  ];

  return (
    <div className="space-y-3">
      <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/admin/class/${classId}`}>
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Back</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Live Class</h1>
          <p className="text-sm text-muted-foreground">
            {slideMode ? `${pdfName} · Slide ${slideIdx + 1}/${totalSlides}` : "Broadcasting live"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={micOn ? "secondary" : "destructive"} onClick={toggleMic}>{micOn ? <Mic size={14} /> : <MicOff size={14} />}</Button>
          <Button size="sm" variant={camOn ? "secondary" : "destructive"} onClick={toggleCam}>{camOn ? <Video size={14} /> : <VideoOff size={14} />}</Button>
          <Badge variant={isConnected ? "destructive" : "secondary"} className="gap-1.5 px-3 py-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-white animate-pulse" : "bg-muted-foreground/50"}`} />
            {isConnected ? `LIVE · ${students.length} viewer${students.length !== 1 ? "s" : ""}` : "Connecting..."}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Main area */}
        <div className="lg:col-span-3 space-y-3">
          {slideMode ? (
            <div className="space-y-2">
              {/* ── TOOLBAR ROW 1: Tools ── */}
              <Card className="border-primary/20">
                <CardContent className="p-2 space-y-2">
                  {/* Tool groups */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {toolGroups.map((grp, gi) => (
                      <div key={gi} className="flex items-center gap-0.5">
                        {gi > 0 && <div className="h-5 w-px bg-border mx-1" />}
                        {grp.tools.map((t) => (
                          <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${tool === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
                            {t.icon}<span className="hidden sm:inline">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                    <div className="h-5 w-px bg-border mx-1" />
                    {/* History */}
                    <button onClick={undo} disabled={!canUndo} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-muted text-muted-foreground disabled:opacity-30" title="Undo"><Undo2 size={13} /></button>
                    <button onClick={redo} disabled={!canRedo} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-muted text-muted-foreground disabled:opacity-30" title="Redo"><Redo2 size={13} /></button>
                    <button onClick={clearAnnotations} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-red-50 hover:text-red-600 text-muted-foreground" title="Clear all"><Trash size={13} /></button>
                    <div className="h-5 w-px bg-border mx-1" />
                    {/* Image upload */}
                    <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-muted text-muted-foreground" title="Upload Image"><ImageIcon size={13} /><span className="hidden sm:inline">Image</span></button>
                  </div>

                  {/* ── TOOLBAR ROW 2: Color + Size + Effects ── */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Colors */}
                    <div className="flex items-center gap-1">
                      {COLORS.map((c) => (
                        <button key={c} onClick={() => setColor(c)}
                          className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? "border-primary scale-125" : "border-border hover:scale-110"}`}
                          style={{ background: c }} />
                      ))}
                      <label className="w-5 h-5 rounded-full border-2 border-border cursor-pointer overflow-hidden" title="Custom color">
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="opacity-0 w-0 h-0 absolute" />
                        <div className="w-full h-full" style={{ background: "conic-gradient(red,yellow,green,cyan,blue,magenta,red)" }} />
                      </label>
                    </div>
                    {/* Brush sizes */}
                    <div className="flex items-center gap-1">
                      {SIZES.map((s) => (
                        <button key={s} onClick={() => setLineWidth(s)}
                          className={`flex items-center justify-center w-6 h-6 rounded border-2 ${lineWidth === s ? "border-primary bg-primary/10" : "border-border"}`}>
                          <div className="rounded-full bg-current" style={{ width: Math.min(s * 1.4 + 2, 18), height: Math.min(s * 1.4 + 2, 18) }} />
                        </button>
                      ))}
                    </div>

                    {/* Text font controls */}
                    {tool === "text" && (
                      <div className="flex items-center gap-1">
                        <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}
                          className="text-xs border rounded px-1.5 py-0.5 h-6 bg-background">
                          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                        </select>
                        <select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
                          className="text-xs border rounded px-1.5 py-0.5 h-6 bg-background w-14">
                          {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
                        </select>
                      </div>
                    )}

                    {/* Sticky note color */}
                    {tool === "sticky" && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Note color:</span>
                        {STICKY_COLORS.map((c) => (
                          <button key={c} onClick={() => setStickyColor(c)}
                            className={`w-5 h-5 rounded border-2 ${stickyColor === c ? "border-primary scale-125" : "border-border"}`}
                            style={{ background: c }} />
                        ))}
                      </div>
                    )}

                    <div className="ml-auto flex items-center gap-1 flex-wrap">
                      {/* Effects toggles */}
                      <button onClick={() => setShowGrid((v) => !v)} title="Toggle grid"
                        className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs border ${showGrid ? "bg-indigo-100 border-indigo-400 text-indigo-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
                        <Grid3x3 size={12} />
                      </button>
                      <button onClick={() => setSnapToGrid((v) => !v)} title="Snap to grid"
                        className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs border ${snapToGrid ? "bg-indigo-100 border-indigo-400 text-indigo-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
                        <Crosshair size={12} />
                      </button>
                      <button onClick={() => setSpotlightMode((v) => !v)} title="Spotlight mode (dark overlay)"
                        className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs border ${spotlightMode ? "bg-yellow-100 border-yellow-500 text-yellow-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
                        <Eye size={12} />
                      </button>
                      <button onClick={() => setCursorHighlightMode((v) => !v)} title="Cursor highlight"
                        className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs border ${cursorHighlightMode ? "bg-amber-100 border-amber-500 text-amber-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
                        <Zap size={12} />
                      </button>
                      <button onClick={() => setShowCamera((v) => !v)}
                        className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs border ${showCamera ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                        <Camera size={12} />
                      </button>
                      <button onClick={downloadAnnotatedPdf}
                        className="flex items-center gap-1 px-1.5 py-1 rounded text-xs border border-border hover:bg-muted text-muted-foreground">
                        <Download size={12} />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── SLIDE AREA ── */}
              <div className="flex gap-3">
                {/* Thumbnail strip */}
                <div className="flex flex-col gap-1.5 w-20 shrink-0">
                  <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto">
                    {slides.map((s, i) => {
                      const key = slideKey(s);
                      return (
                        <button key={key} onClick={() => goToSlide(i)}
                          className={`relative w-full rounded-md overflow-hidden border-2 transition-all ${i === slideIdx ? "border-primary shadow-md" : "border-border hover:border-primary/40"}`}
                          style={{ aspectRatio: "16/9" }}>
                          {thumbnails[key] ? (
                            <img src={thumbnails[key]} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-white flex items-center justify-center">
                              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          <div className={`absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold py-0.5 ${i === slideIdx ? "bg-primary text-primary-foreground" : "bg-black/40 text-white"}`}>{i + 1}</div>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={addBlankSlide}
                    className="w-full aspect-video border-2 border-dashed border-primary/40 rounded-md flex items-center justify-center hover:bg-primary/5">
                    <Plus size={16} className="text-primary" />
                  </button>
                </div>

                {/* Canvas */}
                <div className="flex-1">
                  <Card className="overflow-hidden bg-gray-50 border-2 border-primary/30">
                    <div ref={drawContainerRef} className="relative" style={{ aspectRatio: `${FRAME_WIDTH}/${FRAME_HEIGHT}`, background: "#f5f5f5" }}
                      onMouseMove={onContainerMouseMove}>
                      {/* Slide canvas */}
                      <canvas ref={(el) => { pdfCanvasRef.current = el; }} width={FRAME_WIDTH} height={FRAME_HEIGHT}
                        className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />

                      {/* Grid canvas */}
                      <canvas ref={(el) => { gridCanvasRef.current = el; }} width={FRAME_WIDTH} height={FRAME_HEIGHT}
                        className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />

                      {/* Draw canvas */}
                      <canvas ref={setupDrawCanvas} width={FRAME_WIDTH} height={FRAME_HEIGHT}
                        className="absolute inset-0 w-full h-full"
                        style={{ cursor: tool === "laser" ? "none" : setCursorForTool(tool), touchAction: "none" }}
                        onMouseDown={onDrawStart} onMouseMove={onDrawMove} onMouseUp={onDrawEnd} onMouseLeave={onDrawEnd}
                        onTouchStart={onDrawStart} onTouchMove={onDrawMove} onTouchEnd={onDrawEnd}
                        data-testid="draw-canvas" />

                      {/* Spotlight overlay (teacher view) */}
                      {spotlightMode && (
                        <div className="absolute inset-0 pointer-events-none" style={{
                          background: "radial-gradient(circle 130px at var(--sp-x,50%) var(--sp-y,50%), transparent 0%, transparent 60%, rgba(0,0,0,0.75) 100%)",
                        }} id="spotlight-overlay" />
                      )}

                      {/* Cursor highlight ring */}
                      {cursorHighlightMode && (
                        <div ref={cursorHighlightRef} className="absolute pointer-events-none rounded-full"
                          style={{ width: 40, height: 40, marginLeft: -20, marginTop: -20, top: 0, left: 0, boxShadow: "0 0 0 3px rgba(251,191,36,0.9), 0 0 20px 6px rgba(251,191,36,0.4)", zIndex: 10, transition: "none" }} />
                      )}

                      {/* Laser pointer visual */}
                      {tool === "laser" && (
                        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
                          <div ref={laserDotRef} className="absolute rounded-full"
                            style={{ width: 22, height: 22, marginLeft: -11, marginTop: -11, top: "-100px", left: "-100px", background: "radial-gradient(circle, #ff0000 0%, #ff4040 30%, transparent 80%)", boxShadow: "0 0 12px 5px rgba(255,0,0,0.6)", pointerEvents: "none", transition: "none" }} />
                        </div>
                      )}

                      {/* Camera PiP — draggable & resizable */}
                      {showCamera && (
                        <div
                          className="absolute rounded-full overflow-hidden border-2 border-white shadow-xl ring-2 ring-primary/60 cursor-move select-none group"
                          style={{
                            width: `${(camPipSize / FRAME_WIDTH) * 100}%`,
                            aspectRatio: "1/1",
                            left: `${((camPipCenter.x - camPipSize / 2) / FRAME_WIDTH) * 100}%`,
                            top: `${((camPipCenter.y - camPipSize / 2) / FRAME_HEIGHT) * 100}%`,
                            zIndex: 25,
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            camDraggingRef.current = true;
                            camDragStartRef.current = {
                              mx: e.clientX, my: e.clientY,
                              pipX: camPipCenterRef.current.x, pipY: camPipCenterRef.current.y,
                            };
                          }}
                        >
                          <video ref={cameraPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover pointer-events-none" />
                          {/* Size controls */}
                          <div className="absolute inset-0 flex items-end justify-center pb-1 gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <button
                              className="pointer-events-auto w-6 h-6 bg-black/75 text-white rounded-full text-sm font-bold flex items-center justify-center hover:bg-black"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); const ns = Math.max(CAM_PIP_SIZE_MIN, camPipSize - 25); setCamPipSize(ns); camPipSizeRef.current = ns; }}
                            >−</button>
                            <button
                              className="pointer-events-auto w-6 h-6 bg-black/75 text-white rounded-full text-sm font-bold flex items-center justify-center hover:bg-black"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); const ns = Math.min(CAM_PIP_SIZE_MAX, camPipSize + 25); setCamPipSize(ns); camPipSizeRef.current = ns; }}
                            >+</button>
                          </div>
                          {/* Drag hint */}
                          <div className="absolute inset-x-0 top-1 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <span className="text-[9px] text-white/80 bg-black/50 rounded px-1">drag to move</span>
                          </div>
                        </div>
                      )}

                      {/* Text input overlay */}
                      {textToolActive && textPosRef.current && (
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="pointer-events-auto absolute" style={{
                            left: `${(textPosRef.current.x / FRAME_WIDTH) * 100}%`,
                            top: `${(textPosRef.current.y / FRAME_HEIGHT) * 100}%`,
                            transform: "translate(0,-100%)", zIndex: 20
                          }}>
                            <div className="flex items-center gap-1 bg-background border-2 border-primary rounded-lg shadow-lg px-2 py-1">
                              <input ref={textInputRef} value={textInputValue} onChange={(e) => setTextInputValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextToolActive(false); }}
                                placeholder="Type text..." className="text-sm outline-none bg-transparent w-36" />
                              <button onClick={commitText} className="text-primary"><Send size={11} /></button>
                              <button onClick={() => setTextToolActive(false)} className="text-muted-foreground"><X size={11} /></button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sticky note editor overlay */}
                      {stickyActive && stickyPosRef.current && (
                        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
                          <div className="pointer-events-auto absolute" style={{
                            left: `${(stickyPosRef.current.x / FRAME_WIDTH) * 100}%`,
                            top: `${(stickyPosRef.current.y / FRAME_HEIGHT) * 100}%`,
                          }}>
                            <div className="bg-background border-2 border-primary rounded-xl shadow-xl p-3 w-52">
                              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><StickyNote size={11} />Sticky Note</p>
                              <textarea value={stickyText} onChange={(e) => setStickyText(e.target.value)}
                                placeholder="Type your note..." rows={3}
                                className="w-full text-xs border rounded p-1.5 resize-none outline-none focus:ring-1 focus:ring-primary" autoFocus />
                              <div className="flex items-center gap-1 mt-2">
                                {STICKY_COLORS.map((c) => (
                                  <button key={c} onClick={() => setStickyColor(c)}
                                    className={`w-4 h-4 rounded border-2 ${stickyColor === c ? "border-primary scale-125" : "border-transparent"}`}
                                    style={{ background: c }} />
                                ))}
                                <div className="ml-auto flex gap-1">
                                  <button onClick={commitSticky} className="px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded">Add</button>
                                  <button onClick={() => setStickyActive(false)} className="px-2 py-0.5 text-xs border rounded">Cancel</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide nav */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 text-white rounded-full px-3 py-1">
                        <button onClick={() => goToSlide(slideIdx - 1)} disabled={slideIdx <= 0} className="disabled:opacity-40"><ChevronLeft size={14} /></button>
                        <span className="text-xs font-medium">{slideIdx + 1} / {totalSlides}</span>
                        <button onClick={() => goToSlide(slideIdx + 1)} disabled={slideIdx >= totalSlides - 1} className="disabled:opacity-40"><ChevronRight size={14} /></button>
                      </div>
                    </div>
                  </Card>

                  {/* Tool hint */}
                  {tool === "laser" && (
                    <p className="text-xs text-center text-muted-foreground mt-1">
                      <Zap size={10} className="inline mr-1" />Laser pointer active — move mouse to highlight content
                    </p>
                  )}
                  {tool === "move" && (
                    <p className="text-xs text-center text-muted-foreground mt-1">
                      <Move size={10} className="inline mr-1" />Drag to move all annotations
                    </p>
                  )}
                </div>
              </div>

              {/* ── Poll bar ── */}
              <Card className="border-primary/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {!activePoll?.active ? (
                        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setShowPollCreator((v) => !v)}>
                          <BarChart2 size={13} />Poll
                        </Button>
                      ) : (
                        <Button size="sm" variant="destructive" className="gap-1.5 h-8" onClick={endPoll}><StopCircle size={13} />End Poll</Button>
                      )}
                      <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={exitSlideMode}><Camera size={13} />Camera Mode</Button>
                    </div>
                    {activePoll && (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {activePoll.votes.map((v, i) => (
                          <div key={i} className="flex items-center gap-1 bg-primary/10 rounded px-1.5 py-0.5 text-xs">
                            <span className="text-primary font-medium">{activePoll.options[i]?.slice(0, 8)}</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{v}</Badge>
                          </div>
                        ))}
                        <span className="text-xs text-muted-foreground">{activePoll.totalVotes} vote{activePoll.totalVotes !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                  {showPollCreator && !activePoll?.active && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      <p className="text-xs font-semibold">Poll Options</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {pollOptions.map((opt, i) => (
                          <Input key={i} className="h-7 text-xs" placeholder={`Option ${i + 1}`} value={opt}
                            onChange={(e) => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }} />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={launchPoll}><BarChart2 size={11} />Launch</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPollCreator(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  {activePoll && !activePoll.active && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-semibold mb-2">Poll Results</p>
                      <div className="space-y-1.5">
                        {activePoll.options.map((opt, i) => {
                          const pct = activePoll.totalVotes > 0 ? Math.round((activePoll.votes[i] / activePoll.totalVotes) * 100) : 0;
                          return (
                            <div key={i} className="space-y-0.5">
                              <div className="flex justify-between text-xs"><span>{opt}</span><span className="font-medium">{activePoll.votes[i]} ({pct}%)</span></div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button onClick={() => setActivePoll(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            // ── CAMERA MODE ──
            <div className="space-y-3">
              <Card className="overflow-hidden bg-black border-2 border-border">
                <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
                  <video ref={cameraPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} data-testid="video-teacher-preview" />
                  {!camOn && <div className="absolute inset-0 bg-black/80 flex items-center justify-center"><VideoOff size={40} className="text-white/40" /></div>}
                  <div className="absolute top-3 left-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isConnected ? "bg-red-600 text-white animate-pulse" : "bg-gray-600 text-white/60"}`}>
                      {isConnected ? "● LIVE" : "● OFF"}
                    </span>
                  </div>
                </div>
              </Card>
              {materials.length > 0 && (
                <Card><CardContent className="p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Presentation size={12} />Click to present:</p>
                  <div className="flex flex-wrap gap-2">
                    {materials.map((m) => (
                      <Button key={m.id} size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={loadingPdf} onClick={() => loadPdf(m)}>
                        <Presentation size={12} />{m.name}
                      </Button>
                    ))}
                  </div>
                </CardContent></Card>
              )}
            </div>
          )}

          {/* Slide manager */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2 justify-between">
                <span className="flex items-center gap-1.5"><FileText size={14} className="text-primary" />Slides</span>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload size={12} />{uploading ? "Uploading..." : "Upload PDF"}
                </Button>
              </CardTitle>
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }} />
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {materials.length === 0 ? (
                <p className="text-xs text-muted-foreground">No slides uploaded yet.</p>
              ) : (
                <div className="space-y-1">
                  {materials.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 group">
                      <FileText size={13} className="text-primary shrink-0" />
                      <span className="text-xs flex-1 truncate">{m.name}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-primary opacity-0 group-hover:opacity-100" onClick={() => loadPdf(m)}><Presentation size={11} /></Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100"
                        onClick={() => { if (confirm("Remove?")) deleteMaterialMutation.mutate(m.id); }}><Trash2 size={11} /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><Users size={14} className="text-primary" />Students<Badge variant="secondary" className="ml-auto text-xs">{students.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {students.length === 0 ? <p className="text-xs text-muted-foreground">Waiting for students...</p> : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {students.map((s) => (
                    <div key={s.studentId} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{s.name.charAt(0).toUpperCase()}</div>
                      <span className="text-xs">{s.name}</span>
                      <span className="ml-auto w-2 h-2 rounded-full bg-green-400" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col flex-1" style={{ minHeight: 300 }}>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><MessageSquare size={14} className="text-primary" />Live Chat
                {chatMessages.length > 0 && <Badge variant="secondary" className="ml-auto text-xs">{chatMessages.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 px-3 pb-3 gap-2" style={{ minHeight: 0 }}>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 260 }}>
                {chatMessages.length === 0 ? (
                  <div className="text-center py-8"><MessageSquare size={22} className="mx-auto text-muted-foreground/30 mb-1" /><p className="text-xs text-muted-foreground">No messages yet</p></div>
                ) : chatMessages.map((m, i) => {
                  const isMe = m.senderId === user?.id;
                  return (
                    <div key={i} className={`flex gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${m.senderRole === "teacher" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {m.senderName.charAt(0).toUpperCase()}
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-2.5 py-1.5 ${isMe ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"}`}>
                        {!isMe && <p className="text-[10px] font-semibold mb-0.5 text-muted-foreground">{m.senderName}</p>}
                        <p className="text-xs break-words">{m.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                <Input className="h-8 text-xs flex-1" placeholder="Type a message..." value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                  data-testid="chat-input-teacher" />
                <Button size="sm" className="h-8 w-8 p-0 shrink-0" onClick={sendChat} disabled={!chatInput.trim()} data-testid="button-send-chat-teacher"><Send size={13} /></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
