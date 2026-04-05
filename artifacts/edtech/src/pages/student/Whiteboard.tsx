import { useParams } from "wouter";
import { useEffect, useRef, useState, useCallback } from "react";
import { useGetWhiteboardData, useSaveWhiteboardData, getGetWhiteboardDataQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Save, Trash2, Circle, Square, Minus, Pen, Eraser, Download,
  Undo2, Redo2, ZoomIn, ZoomOut, Type, ArrowRight, MousePointer,
  Pencil, StickyNote, Triangle, RotateCcw, Grid, Maximize2, Minimize2,
  Copy, Clipboard, BringToFront, SendToBack, ImagePlus, Zap,
  Star, Hexagon, MessageSquare, RectangleHorizontal, MoveHorizontal, Minus as LineIcon,
  CornerUpLeft, Layers,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

/* ═══════════════════════════ TYPES ════════════════════════════ */
type Tool =
  | "select" | "pen" | "highlighter" | "eraser" | "laser"
  | "line" | "arrow"
  | "rect" | "roundrect" | "ellipse" | "triangle" | "diamond" | "star" | "hexagon" | "callout"
  | "text" | "sticky" | "image";

type DashStyle = "solid" | "dashed" | "dotted";
type BgStyle = "white" | "dark" | "grid" | "dotgrid" | "lined" | "darkgrid" | "iso" | "graph";

interface DrawAction {
  id: string;
  tool: Tool;
  color: string;
  fillColor: string | null;
  lineWidth: number;
  opacity: number;
  dashStyle: DashStyle;
  shiftLock?: boolean;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  imageData?: string;
  cornerRadius?: number;
}

/* ═══════════════════════════ CONSTANTS ════════════════════════ */
const CW = 2400, CH = 1600;

const COLORS = [
  "#1a1a1a", "#ffffff", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#f43f5e", "#64748b",
  "#a16207", "#065f46", "#1e40af", "#6d28d9",
];

const STICKY_COLORS = ["#fef08a", "#86efac", "#93c5fd", "#f9a8d4", "#c4b5fd", "#fdba74", "#a7f3d0", "#fca5a5"];

const BG_OPTIONS: { key: BgStyle; label: string }[] = [
  { key: "white", label: "White" }, { key: "dark", label: "Dark" }, { key: "grid", label: "Grid" },
  { key: "dotgrid", label: "Dots" }, { key: "lined", label: "Lines" },
  { key: "darkgrid", label: "Dark Grid" }, { key: "iso", label: "Iso" }, { key: "graph", label: "Graph" },
];

const FONT_FAMILIES = ["Inter, sans-serif", "Georgia, serif", "'Courier New', monospace", "Arial, sans-serif"];
const FONT_FAMILY_LABELS = ["Sans", "Serif", "Mono", "Arial"];

const TOOL_GROUPS = [
  [{ id: "select" as Tool, label: "Select & Move  [V]", icon: "↖" }],
  [
    { id: "pen" as Tool, label: "Pen  [P]", icon: "✏" },
    { id: "highlighter" as Tool, label: "Highlighter  [H]", icon: "🖊" },
    { id: "eraser" as Tool, label: "Eraser  [E]", icon: "⌫" },
    { id: "laser" as Tool, label: "Laser Pointer  [G]", icon: "🔴" },
  ],
  [
    { id: "line" as Tool, label: "Line  [L]", icon: "╱" },
    { id: "arrow" as Tool, label: "Arrow  [A]", icon: "→" },
  ],
  [
    { id: "rect" as Tool, label: "Rectangle  [R]", icon: "▭" },
    { id: "roundrect" as Tool, label: "Rounded Rect  [U]", icon: "▢" },
    { id: "ellipse" as Tool, label: "Ellipse  [O]", icon: "◯" },
    { id: "triangle" as Tool, label: "Triangle  [T]", icon: "△" },
    { id: "diamond" as Tool, label: "Diamond  [D]", icon: "◇" },
    { id: "star" as Tool, label: "Star  [S]", icon: "☆" },
    { id: "hexagon" as Tool, label: "Hexagon  [Y]", icon: "⬡" },
    { id: "callout" as Tool, label: "Callout  [B]", icon: "💬" },
  ],
  [
    { id: "text" as Tool, label: "Text  [X]", icon: "T" },
    { id: "sticky" as Tool, label: "Sticky Note  [N]", icon: "📌" },
    { id: "image" as Tool, label: "Insert Image  [I]", icon: "🖼" },
  ],
];

const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: "select", p: "pen", h: "highlighter", e: "eraser", g: "laser",
  l: "line", a: "arrow", r: "rect", u: "roundrect", o: "ellipse",
  t: "triangle", d: "diamond", s: "star", y: "hexagon", b: "callout",
  x: "text", n: "sticky", i: "image",
};

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ═══════════════════════════ BACKGROUNDS ══════════════════════ */
function getBgFill(bg: BgStyle) {
  return bg === "dark" || bg === "darkgrid" ? "#1e1e2e" : "#ffffff";
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: BgStyle) {
  ctx.fillStyle = getBgFill(bg);
  ctx.fillRect(0, 0, CW, CH);
  const G = 40;
  if (bg === "grid") {
    ctx.strokeStyle = "rgba(0,0,0,0.07)"; ctx.lineWidth = 1;
    for (let x = 0; x <= CW; x += G) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y <= CH; y += G) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(0,0,0,0.03)";
    for (let x = 0; x <= CW; x += G / 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y <= CH; y += G / 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }
  } else if (bg === "graph") {
    ctx.strokeStyle = "rgba(59,130,246,0.1)"; ctx.lineWidth = 1;
    for (let x = 0; x <= CW; x += G) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y <= CH; y += G) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(59,130,246,0.25)"; ctx.lineWidth = 1.5;
    for (let x = 0; x <= CW; x += G * 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y <= CH; y += G * 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }
  } else if (bg === "darkgrid") {
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
    for (let x = 0; x <= CW; x += G) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y <= CH; y += G) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }
  } else if (bg === "dotgrid") {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let x = G; x < CW; x += G) for (let y = G; y < CH; y += G) {
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (bg === "lined") {
    ctx.strokeStyle = "rgba(0,0,0,0.07)"; ctx.lineWidth = 1;
    for (let y = 48; y < CH; y += G) { ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(CW, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(220,38,38,0.18)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, CH); ctx.stroke();
  } else if (bg === "iso") {
    ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.lineWidth = 1;
    const sp = 40, sq3 = Math.sqrt(3);
    for (let x = -CH; x < CW + CH; x += sp) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + CH / sq3 * 2, CH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - CH / sq3 * 2, CH); ctx.stroke();
    }
    for (let y = 0; y <= CH; y += sp * sq3 / 2) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
    }
  }
}

/* ═══════════════════════════ SHAPE RENDERING ══════════════════ */
function starPath(cx: number, cy: number, r: number, n = 5): Path2D {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) {
    const angle = (i * Math.PI / n) - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.4;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    i === 0 ? p.moveTo(x, y) : p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

function hexPath(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI / 3) - Math.PI / 6;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    i === 0 ? p.moveTo(x, y) : p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

function calloutPath(x: number, y: number, w: number, h: number): Path2D {
  const r = 12, tw = 30, th = 20;
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + tw + 20, y + h);
  p.lineTo(x + tw, y + h + th);
  p.lineTo(x + tw + 10, y + h);
  p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r);
  p.closePath();
  return p;
}

function renderAction(ctx: CanvasRenderingContext2D, action: DrawAction) {
  ctx.save();
  ctx.globalAlpha = action.opacity;
  ctx.strokeStyle = action.color;
  ctx.lineWidth = action.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (action.dashStyle === "dashed") ctx.setLineDash([action.lineWidth * 4, action.lineWidth * 2]);
  else if (action.dashStyle === "dotted") ctx.setLineDash([action.lineWidth, action.lineWidth * 2.5]);
  else ctx.setLineDash([]);

  const doFill = (path: Path2D) => {
    if (action.fillColor) {
      ctx.save();
      ctx.globalAlpha = action.opacity * 0.4;
      ctx.fillStyle = action.fillColor;
      ctx.setLineDash([]);
      ctx.fill(path);
      ctx.restore();
    }
  };

  if (action.tool === "pen") {
    const pts = action.points;
    if (!pts || pts.length < 1) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) { ctx.arc(pts[0].x, pts[0].y, action.lineWidth / 2, 0, Math.PI * 2); ctx.fillStyle = action.color; ctx.fill(); }
    else {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  } else if (action.tool === "highlighter") {
    const pts = action.points;
    if (!pts || pts.length < 2) { ctx.restore(); return; }
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = action.lineWidth * 8;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  } else if (action.tool === "eraser") {
    const pts = action.points;
    if (!pts || pts.length < 1) { ctx.restore(); return; }
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = action.lineWidth * 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  } else if (action.tool === "line" && action.start && action.end) {
    ctx.beginPath(); ctx.moveTo(action.start.x, action.start.y); ctx.lineTo(action.end.x, action.end.y); ctx.stroke();
  } else if (action.tool === "arrow" && action.start && action.end) {
    const dx = action.end.x - action.start.x, dy = action.end.y - action.start.y;
    const angle = Math.atan2(dy, dx);
    const headLen = Math.max(18, action.lineWidth * 5);
    ctx.beginPath(); ctx.moveTo(action.start.x, action.start.y); ctx.lineTo(action.end.x, action.end.y); ctx.stroke();
    ctx.setLineDash([]);
    const p = new Path2D();
    p.moveTo(action.end.x, action.end.y);
    p.lineTo(action.end.x - headLen * Math.cos(angle - Math.PI / 6), action.end.y - headLen * Math.sin(angle - Math.PI / 6));
    p.lineTo(action.end.x - headLen * Math.cos(angle + Math.PI / 6), action.end.y - headLen * Math.sin(angle + Math.PI / 6));
    p.closePath();
    ctx.fillStyle = action.color; ctx.globalAlpha = action.opacity; ctx.fill(p);
  } else if ((action.tool === "rect" || action.tool === "roundrect") && action.start && action.end) {
    let x = Math.min(action.start.x, action.end.x), y = Math.min(action.start.y, action.end.y);
    let w = Math.abs(action.end.x - action.start.x), h = Math.abs(action.end.y - action.start.y);
    if (action.shiftLock) { const s = Math.min(w, h); w = s; h = s; }
    const cr = action.tool === "roundrect" ? Math.min(16, w / 4, h / 4) : 0;
    const p = new Path2D();
    if (cr > 0) {
      p.moveTo(x + cr, y); p.lineTo(x + w - cr, y); p.arcTo(x + w, y, x + w, y + cr, cr);
      p.lineTo(x + w, y + h - cr); p.arcTo(x + w, y + h, x + w - cr, y + h, cr);
      p.lineTo(x + cr, y + h); p.arcTo(x, y + h, x, y + h - cr, cr);
      p.lineTo(x, y + cr); p.arcTo(x, y, x + cr, y, cr); p.closePath();
    } else { p.rect(x, y, w, h); }
    doFill(p); ctx.stroke(p);
  } else if (action.tool === "ellipse" && action.start && action.end) {
    let rx = Math.abs(action.end.x - action.start.x) / 2;
    let ry = Math.abs(action.end.y - action.start.y) / 2;
    if (action.shiftLock) { const r = Math.max(rx, ry); rx = r; ry = r; }
    const cx = (action.start.x + action.end.x) / 2, cy = (action.start.y + action.end.y) / 2;
    const p = new Path2D(); p.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    doFill(p); ctx.stroke(p);
  } else if (action.tool === "triangle" && action.start && action.end) {
    const cxx = (action.start.x + action.end.x) / 2;
    const p = new Path2D();
    p.moveTo(cxx, action.start.y); p.lineTo(action.end.x, action.end.y); p.lineTo(action.start.x, action.end.y); p.closePath();
    doFill(p); ctx.stroke(p);
  } else if (action.tool === "diamond" && action.start && action.end) {
    const cxx = (action.start.x + action.end.x) / 2, cyy = (action.start.y + action.end.y) / 2;
    const p = new Path2D();
    p.moveTo(cxx, action.start.y); p.lineTo(action.end.x, cyy); p.lineTo(cxx, action.end.y); p.lineTo(action.start.x, cyy); p.closePath();
    doFill(p); ctx.stroke(p);
  } else if (action.tool === "star" && action.start && action.end) {
    const cxx = (action.start.x + action.end.x) / 2, cyy = (action.start.y + action.end.y) / 2;
    const r = Math.min(Math.abs(action.end.x - action.start.x), Math.abs(action.end.y - action.start.y)) / 2;
    const p = starPath(cxx, cyy, r);
    doFill(p); ctx.stroke(p);
  } else if (action.tool === "hexagon" && action.start && action.end) {
    const cxx = (action.start.x + action.end.x) / 2, cyy = (action.start.y + action.end.y) / 2;
    const r = Math.min(Math.abs(action.end.x - action.start.x), Math.abs(action.end.y - action.start.y)) / 2;
    const p = hexPath(cxx, cyy, r);
    doFill(p); ctx.stroke(p);
  } else if (action.tool === "callout" && action.start && action.end) {
    const x = Math.min(action.start.x, action.end.x), y = Math.min(action.start.y, action.end.y);
    const w = Math.abs(action.end.x - action.start.x), h = Math.abs(action.end.y - action.start.y);
    if (w > 20 && h > 20) {
      const p = calloutPath(x, y, w, h);
      doFill(p); ctx.stroke(p);
      if (action.text) {
        ctx.globalAlpha = action.opacity;
        ctx.fillStyle = action.color;
        const fs = action.fontSize ?? 14;
        const fw = action.fontBold ? "bold" : "normal";
        const fi = action.fontItalic ? "italic" : "normal";
        ctx.font = `${fi} ${fw} ${fs}px ${action.fontFamily ?? "Inter, sans-serif"}`;
        ctx.textBaseline = "top";
        const pad = 12;
        const words = (action.text ?? "").split(" ");
        let line = "", yl = y + pad;
        for (const word of words) {
          const test = line + word + " ";
          if (ctx.measureText(test).width > w - pad * 2 && line) {
            ctx.fillText(line.trim(), x + pad, yl); line = word + " "; yl += fs + 4;
            if (yl > y + h - 40) break;
          } else line = test;
        }
        if (line.trim()) ctx.fillText(line.trim(), x + pad, yl);
      }
    }
  } else if (action.tool === "text" && action.start && action.text) {
    const fs = action.fontSize ?? 20;
    const fw = action.fontBold ? "bold" : "normal";
    const fi = action.fontItalic ? "italic" : "normal";
    ctx.font = `${fi} ${fw} ${fs}px ${action.fontFamily ?? "Inter, sans-serif"}`;
    ctx.fillStyle = action.color;
    ctx.textBaseline = "top";
    ctx.setLineDash([]);
    // Multiline support
    const lines = action.text.split("\n");
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], action.start.x, action.start.y + li * (fs + 4));
    }
  } else if (action.tool === "sticky" && action.start) {
    const sw = 240, sh = 140, pad = 12;
    const sx = action.start.x, sy = action.start.y;
    ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 12; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
    ctx.fillStyle = action.fillColor ?? "#fef08a";
    ctx.setLineDash([]);
    const p = new Path2D(); p.roundRect(sx, sy, sw, sh, 6); ctx.fill(p);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = action.color;
    const hdrP = new Path2D(); hdrP.roundRect(sx, sy, sw, 24, [6, 6, 0, 0]); ctx.fill(hdrP);
    ctx.fillStyle = action.color === "#1a1a1a" || action.color === "#000000" ? "#fff" : "#1a1a1a";
    ctx.font = "bold 11px Inter, sans-serif"; ctx.textBaseline = "middle";
    ctx.fillText("📌 Note", sx + pad, sy + 12);
    ctx.fillStyle = "#1a1a1a";
    const fs = action.fontSize ?? 13;
    ctx.font = `${fs}px Inter, sans-serif`; ctx.textBaseline = "top";
    const words = (action.text ?? "").split(" ");
    let line = "", yl = sy + 32;
    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > sw - pad * 2 && line) {
        ctx.fillText(line.trim(), sx + pad, yl); line = word + " "; yl += fs + 4;
        if (yl > sy + sh - 12) break;
      } else line = test;
    }
    if (line.trim()) ctx.fillText(line.trim(), sx + pad, yl);
  } else if (action.tool === "image" && action.start && action.imageData) {
    const img = new Image();
    img.src = action.imageData;
    const w = action.end ? Math.abs(action.end.x - action.start.x) : 200;
    const h = action.end ? Math.abs(action.end.y - action.start.y) : 150;
    ctx.drawImage(img, action.start.x, action.start.y, w || 200, h || 150);
  }
  ctx.restore();
}

/* ═══════════════════════════ HIT TESTING ══════════════════════ */
function getBBox(action: DrawAction): { x: number; y: number; w: number; h: number } | null {
  if (action.tool === "pen" || action.tool === "highlighter" || action.tool === "eraser" || action.tool === "laser") {
    const pts = action.points;
    if (!pts || pts.length === 0) return null;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (action.start && action.end) {
    const x = Math.min(action.start.x, action.end.x), y = Math.min(action.start.y, action.end.y);
    const w = Math.abs(action.end.x - action.start.x), h = Math.abs(action.end.y - action.start.y);
    if (action.tool === "sticky") return { x: action.start.x, y: action.start.y, w: 240, h: 140 };
    return { x, y, w: Math.max(w, 4), h: Math.max(h, 4) };
  }
  if (action.start && (action.tool === "text" || action.tool === "sticky")) {
    return { x: action.start.x - 5, y: action.start.y - 5, w: 200, h: 40 };
  }
  return null;
}

function hitTest(action: DrawAction, x: number, y: number, pad = 10): boolean {
  const bb = getBBox(action);
  if (!bb) return false;
  return x >= bb.x - pad && x <= bb.x + bb.w + pad && y >= bb.y - pad && y <= bb.y + bb.h + pad;
}

function snapToGrid(v: number, gs: number): number { return Math.round(v / gs) * gs; }

/* ═══════════════════════════ COMPONENT ════════════════════════ */
export default function StudentWhiteboard() {
  const { classId } = useParams<{ classId: string }>();
  const cid = parseInt(classId, 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserCanvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Drawing state
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1a1a1a");
  const [fillColor, setFillColor] = useState("#3b82f6");
  const [fillEnabled, setFillEnabled] = useState(false);
  const [lineWidth, setLineWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [dashStyle, setDashStyle] = useState<DashStyle>("solid");
  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0]);
  const [fontBold, setFontBold] = useState(false);
  const [fontItalic, setFontItalic] = useState(false);
  const [bgStyle, setBgStyle] = useState<BgStyle>("white");
  const [gridSnap, setGridSnap] = useState(false);
  const gridSize = 20;

  // Canvas state
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawAction[]>([]);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Text overlay
  const [textOverlay, setTextOverlay] = useState<{ x: number; y: number; cx: number; cy: number; forTool: Tool } | null>(null);
  const [textVal, setTextVal] = useState("");

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDraggingSelectedRef = useRef(false);
  const dragStartRef = useRef<{ mx: number; my: number; origAction: DrawAction } | null>(null);

  // Laser pointer
  const laserRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const laserAnimRef = useRef<number | null>(null);
  const isLaserActiveRef = useRef(false);

  // Pending image placement
  const pendingImageRef = useRef<{ x: number; y: number } | null>(null);

  // UI state
  const [spaceDown, setSpaceDown] = useState(false);
  const [saved, setSaved] = useState(true);
  const [presentMode, setPresentMode] = useState(false);
  const [copyBuffer, setCopyBuffer] = useState<DrawAction | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: wbData } = useGetWhiteboardData(cid, { query: { enabled: !!cid } });
  const saveWb = useSaveWhiteboardData();

  // Load whiteboard data
  useEffect(() => {
    if (wbData?.data) {
      try {
        const parsed = JSON.parse(wbData.data);
        if (Array.isArray(parsed)) setActions(parsed);
        else if (parsed.actions) { setActions(parsed.actions ?? []); if (parsed.bgStyle) setBgStyle(parsed.bgStyle); }
      } catch { /* ignore */ }
    }
  }, [wbData]);

  /* ── Redraw ── */
  const redraw = useCallback((acts: DrawAction[], preview?: DrawAction | null, selId?: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);
    drawBackground(ctx, bgStyle);
    acts.forEach(a => renderAction(ctx, a));
    if (preview) renderAction(ctx, preview);

    // Selection highlight
    const sid = selId !== undefined ? selId : selectedId;
    if (sid) {
      const sel = acts.find(a => a.id === sid);
      if (sel) {
        const bb = getBBox(sel);
        if (bb) {
          ctx.save();
          ctx.strokeStyle = "#6366f1";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(bb.x - 6, bb.y - 6, bb.w + 12, bb.h + 12);
          ctx.fillStyle = "rgba(99,102,241,0.08)";
          ctx.fillRect(bb.x - 6, bb.y - 6, bb.w + 12, bb.h + 12);
          // Corner handles
          ctx.fillStyle = "#6366f1"; ctx.setLineDash([]);
          const handles = [
            [bb.x - 6, bb.y - 6], [bb.x + bb.w + 6, bb.y - 6],
            [bb.x - 6, bb.y + bb.h + 6], [bb.x + bb.w + 6, bb.y + bb.h + 6],
          ];
          handles.forEach(([hx, hy]) => { ctx.fillRect(hx - 4, hy - 4, 8, 8); });
          ctx.restore();
        }
      }
    }
  }, [bgStyle, selectedId]);

  useEffect(() => { redraw(actions, currentAction); }, [actions, currentAction, redraw]);

  /* ── Laser animation ── */
  const renderLaser = useCallback(() => {
    const canvas = laserCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const now = Date.now();
    laserRef.current = laserRef.current.filter(p => now - p.t < 1200);
    ctx.clearRect(0, 0, CW, CH);
    if (laserRef.current.length > 1) {
      const pts = laserRef.current;
      for (let i = 1; i < pts.length; i++) {
        const age = (now - pts[i].t) / 1200;
        const a = 1 - age;
        ctx.save();
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = Math.max(1, 5 * a);
        ctx.lineCap = "round";
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
      }
      // Dot at latest point
      if (pts.length > 0) {
        const last = pts[pts.length - 1];
        ctx.save();
        ctx.fillStyle = "#ef4444";
        ctx.shadowColor = "#ff6666"; ctx.shadowBlur = 16;
        ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(last.x, last.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    laserAnimRef.current = null;
    if (laserRef.current.length > 0) {
      laserAnimRef.current = requestAnimationFrame(renderLaser);
    } else {
      ctx.clearRect(0, 0, CW, CH);
    }
  }, []);

  /* ── Position helpers ── */
  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let x = (clientX - rect.left) * (CW / rect.width);
    let y = (clientY - rect.top) * (CH / rect.height);
    if (gridSnap) { x = snapToGrid(x, gridSize); y = snapToGrid(y, gridSize); }
    return { x, y };
  }, [gridSnap]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.code === "Space") { e.preventDefault(); setSpaceDown(true); return; }
      if (e.code === "Delete" || e.code === "Backspace") {
        if (selectedId) {
          setActions(prev => { const next = prev.filter(a => a.id !== selectedId); scheduleAutoSave(next); return next; });
          setSelectedId(null);
        }
        return;
      }
      if (e.code === "Escape") { setSelectedId(null); setTextOverlay(null); setTextVal(""); return; }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoAction(); return; }
        if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redoAction(); return; }
        if (e.key === "s") { e.preventDefault(); doSave(undefined); return; }
        if (e.key === "c" && selectedId) {
          e.preventDefault();
          const sel = actions.find(a => a.id === selectedId);
          if (sel) setCopyBuffer(sel);
          return;
        }
        if (e.key === "v" && copyBuffer) {
          e.preventDefault();
          const newA = { ...copyBuffer, id: uid(), start: copyBuffer.start ? { x: copyBuffer.start.x + 20, y: copyBuffer.start.y + 20 } : undefined, end: copyBuffer.end ? { x: copyBuffer.end.x + 20, y: copyBuffer.end.y + 20 } : undefined, points: copyBuffer.points?.map(p => ({ x: p.x + 20, y: p.y + 20 })) };
          setActions(prev => { const next = [...prev, newA]; scheduleAutoSave(next); return next; });
          setSelectedId(newA.id);
          return;
        }
        if (e.key === "a") { e.preventDefault(); setSelectedId(null); setTool("select"); return; }
        if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom(z => Math.min(5, +(z + 0.15).toFixed(2))); return; }
        if (e.key === "-") { e.preventDefault(); setZoom(z => Math.max(0.15, +(z - 0.15).toFixed(2))); return; }
        if (e.key === "0") { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); return; }
        if (e.key === "d" && selectedId) {
          e.preventDefault();
          const sel = actions.find(a => a.id === selectedId);
          if (sel) {
            const newA = { ...sel, id: uid(), start: sel.start ? { x: sel.start.x + 20, y: sel.start.y + 20 } : undefined, end: sel.end ? { x: sel.end.x + 20, y: sel.end.y + 20 } : undefined, points: sel.points?.map(p => ({ x: p.x + 20, y: p.y + 20 })) };
            setActions(prev => { const next = [...prev, newA]; scheduleAutoSave(next); return next; });
            setSelectedId(newA.id);
          }
          return;
        }
      }

      const t = TOOL_SHORTCUTS[e.key.toLowerCase()];
      if (t) setTool(t);
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [selectedId, actions, copyBuffer]);

  /* ── Undo/Redo ── */
  const undoAction = useCallback(() => {
    setActions(prev => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setRedoStack(r => [...r, last]);
      setSaved(false);
      return prev.slice(0, -1);
    });
    setSelectedId(null);
  }, []);

  const redoAction = useCallback(() => {
    setRedoStack(prev => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setActions(a => { scheduleAutoSave([...a, last]); return [...a, last]; });
      setSaved(false);
      return prev.slice(0, -1);
    });
  }, []);

  /* ── Auto-save ── */
  const scheduleAutoSave = (acts: DrawAction[]) => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      saveWb.mutate(
        { classId: cid, data: { data: JSON.stringify({ actions: acts, bgStyle }) } },
        { onSuccess: () => { setSaved(true); queryClient.invalidateQueries({ queryKey: getGetWhiteboardDataQueryKey(cid) }); } }
      );
    }, 2500);
  };

  const doSave = (actsOverride?: DrawAction[]) => {
    const toSave = actsOverride ?? actions;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    saveWb.mutate(
      { classId: cid, data: { data: JSON.stringify({ actions: toSave, bgStyle }) } },
      { onSuccess: () => { setSaved(true); queryClient.invalidateQueries({ queryKey: getGetWhiteboardDataQueryKey(cid) }); toast({ title: "Whiteboard saved!" }); } }
    );
  };

  /* ── Pointer events ── */
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const isPan = spaceDown || tool === "select" && !hitTestAny(e) || e.button === 1;

    if (tool === "laser") {
      const pos = getCanvasPos(e.clientX, e.clientY);
      laserRef.current = [{ x: pos.x, y: pos.y, t: Date.now() }];
      isLaserActiveRef.current = true;
      if (laserAnimRef.current) cancelAnimationFrame(laserAnimRef.current);
      laserAnimRef.current = requestAnimationFrame(renderLaser);
      return;
    }

    if (e.button === 1 || (spaceDown && tool !== "select")) {
      isPanningRef.current = true;
      panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }

    const pos = getCanvasPos(e.clientX, e.clientY);

    // Select mode: find topmost hit shape
    if (tool === "select") {
      const hit = [...actions].reverse().find(a => hitTest(a, pos.x, pos.y));
      if (hit) {
        setSelectedId(hit.id);
        isDraggingSelectedRef.current = true;
        dragStartRef.current = { mx: pos.x, my: pos.y, origAction: { ...hit, start: hit.start ? { ...hit.start } : undefined, end: hit.end ? { ...hit.end } : undefined, points: hit.points?.map(p => ({ ...p })) } };
      } else {
        setSelectedId(null);
        isPanningRef.current = true;
        panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      }
      return;
    }

    // Image tool: open file picker
    if (tool === "image") {
      pendingImageRef.current = pos;
      imageInputRef.current?.click();
      return;
    }

    // Text / sticky: show overlay
    if (tool === "text" || tool === "callout" || tool === "sticky") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setTextOverlay({ x: pos.x, y: pos.y, cx: e.clientX - rect.left, cy: e.clientY - rect.top, forTool: tool });
      setTextVal("");
      setTimeout(() => textRef.current?.focus(), 30);
      return;
    }

    // Normal drawing
    setIsDrawing(true);
    setRedoStack([]);
    const act: DrawAction = {
      id: uid(), tool, color,
      fillColor: fillEnabled ? fillColor : null,
      lineWidth, opacity, dashStyle, fontSize, fontFamily, fontBold, fontItalic,
    };
    if (tool === "pen" || tool === "highlighter" || tool === "eraser") act.points = [pos];
    else { act.start = pos; act.end = pos; }
    setCurrentAction(act);
  };

  function hitTestAny(e: React.PointerEvent<HTMLCanvasElement>) {
    const pos = getCanvasPos(e.clientX, e.clientY);
    return actions.some(a => hitTest(a, pos.x, pos.y));
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e.clientX, e.clientY);

    // Laser pointer
    if (tool === "laser" && isLaserActiveRef.current) {
      laserRef.current.push({ x: pos.x, y: pos.y, t: Date.now() });
      if (!laserAnimRef.current) laserAnimRef.current = requestAnimationFrame(renderLaser);
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mx;
      const dy = e.clientY - panStartRef.current.my;
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
      return;
    }

    // Drag selected shape
    if (isDraggingSelectedRef.current && dragStartRef.current && selectedId) {
      const orig = dragStartRef.current.origAction;
      const dx = pos.x - dragStartRef.current.mx;
      const dy = pos.y - dragStartRef.current.my;
      setActions(prev => prev.map(a => {
        if (a.id !== selectedId) return a;
        return {
          ...a,
          start: orig.start ? { x: orig.start.x + dx, y: orig.start.y + dy } : undefined,
          end: orig.end ? { x: orig.end.x + dx, y: orig.end.y + dy } : undefined,
          points: orig.points?.map(p => ({ x: p.x + dx, y: p.y + dy })),
        };
      }));
      return;
    }

    if (!isDrawing || !currentAction) return;

    if (currentAction.tool === "pen" || currentAction.tool === "highlighter" || currentAction.tool === "eraser") {
      setCurrentAction(p => p ? { ...p, points: [...(p.points ?? []), pos] } : null);
    } else {
      let end = pos;
      if (e.shiftKey) {
        const s = currentAction.start!;
        const dx = pos.x - s.x, dy = pos.y - s.y;
        const len = Math.max(Math.abs(dx), Math.abs(dy));
        const angle = Math.atan2(dy, dx);
        const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        end = { x: s.x + len * Math.cos(snap), y: s.y + len * Math.sin(snap) };
      }
      setCurrentAction(p => p ? { ...p, end, shiftLock: e.shiftKey } : null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "laser") {
      isLaserActiveRef.current = false;
      // Let renderLaser naturally fade the trail over 1.2s via the animation loop
      return;
    }

    if (isPanningRef.current) { isPanningRef.current = false; return; }

    if (isDraggingSelectedRef.current) {
      isDraggingSelectedRef.current = false;
      dragStartRef.current = null;
      setSaved(false);
      scheduleAutoSave(actions);
      return;
    }

    if (!isDrawing || !currentAction) return;
    setIsDrawing(false);
    const act = { ...currentAction };
    const hasContent = (act.points?.length ?? 0) > 0 ||
      (act.start && act.end && (Math.abs(act.end.x - act.start.x) > 2 || Math.abs(act.end.y - act.start.y) > 2));
    if (hasContent) {
      setActions(prev => { const next = [...prev, act]; setSaved(false); scheduleAutoSave(next); return next; });
    }
    setCurrentAction(null);
  };

  /* ── Text commit ── */
  const commitText = () => {
    if (!textOverlay || !textVal.trim()) { setTextOverlay(null); return; }
    const ft = textOverlay.forTool;
    const act: DrawAction = {
      id: uid(), tool: ft, color,
      fillColor: ft === "sticky" ? (fillColor ?? "#fef08a") : (fillEnabled ? fillColor : null),
      lineWidth, opacity, dashStyle, fontSize, fontFamily, fontBold, fontItalic,
      text: textVal,
      start: { x: textOverlay.x, y: textOverlay.y },
      end: ft === "callout" ? { x: textOverlay.x + 260, y: textOverlay.y + 140 } : undefined,
    };
    setActions(prev => { const next = [...prev, act]; setSaved(false); scheduleAutoSave(next); return next; });
    setRedoStack([]);
    setTextOverlay(null); setTextVal("");
  };

  /* ── Image import ── */
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingImageRef.current) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const imgData = evt.target?.result as string;
      if (!imgData || !pendingImageRef.current) return;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const w = Math.min(400, img.width), h = w / aspect;
        const act: DrawAction = {
          id: uid(), tool: "image", color, fillColor: null,
          lineWidth: 0, opacity: 1, dashStyle: "solid",
          start: { ...pendingImageRef.current! },
          end: { x: pendingImageRef.current!.x + w, y: pendingImageRef.current!.y + h },
          imageData: imgData,
        };
        setActions(prev => { const next = [...prev, act]; setSaved(false); scheduleAutoSave(next); return next; });
        pendingImageRef.current = null;
      };
      img.src = imgData;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  /* ── Clipboard paste (Ctrl+V to paste image) ── */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find(i => i.type.startsWith("image/"));
      if (imgItem) {
        e.preventDefault();
        const file = imgItem.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const imgData = evt.target?.result as string;
          if (!imgData) return;
          const img = new Image();
          img.onload = () => {
            const aspect = img.width / img.height;
            const w = Math.min(400, img.width), h = w / aspect;
            const pos = { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 };
            const act: DrawAction = {
              id: uid(), tool: "image", color, fillColor: null,
              lineWidth: 0, opacity: 1, dashStyle: "solid",
              start: pos, end: { x: pos.x + w, y: pos.y + h }, imageData: imgData,
            };
            setActions(prev => { const next = [...prev, act]; setSaved(false); scheduleAutoSave(next); return next; });
            toast({ title: "Image pasted!" });
          };
          img.src = imgData;
        };
        reader.readAsDataURL(file);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  /* ── Zoom / wheel ── */
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => Math.min(5, Math.max(0.15, z - e.deltaY * 0.001)));
    }
  };

  /* ── Export ── */
  const handleExport = (format: "png" | "jpeg" = "png") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `whiteboard-${cid}-${Date.now()}.${format}`;
    link.href = format === "jpeg" ? canvas.toDataURL("image/jpeg", 0.92) : canvas.toDataURL("image/png");
    link.click();
    toast({ title: `Exported as ${format.toUpperCase()}!` });
  };

  /* ── Layer reorder ── */
  const bringToFront = () => {
    if (!selectedId) return;
    setActions(prev => { const i = prev.findIndex(a => a.id === selectedId); if (i < 0) return prev; const n = [...prev]; n.splice(i, 1); n.push(prev[i]); scheduleAutoSave(n); return n; });
  };
  const sendToBack = () => {
    if (!selectedId) return;
    setActions(prev => { const i = prev.findIndex(a => a.id === selectedId); if (i < 0) return prev; const n = [...prev]; n.splice(i, 1); n.unshift(prev[i]); scheduleAutoSave(n); return n; });
  };

  const handleClear = () => {
    if (!confirm("Clear the entire whiteboard?")) return;
    setActions([]); setRedoStack([]); setSelectedId(null); setSaved(false);
  };

  const zoomToFit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const isDark = bgStyle === "dark" || bgStyle === "darkgrid";
  const tb = isDark ? "bg-gray-900 border-gray-700 text-gray-200" : "bg-white border-gray-200 text-gray-800";
  const tbSub = isDark ? "bg-gray-800/70 border-gray-700" : "bg-gray-50 border-gray-200";
  const btnBase = `transition-all border text-xs rounded-md flex items-center justify-center`;
  const toolActive = "bg-primary text-white border-primary shadow-sm scale-105";
  const toolInactive = isDark ? "text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-gray-200" : "text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700";

  const canvasCursor = isPanningRef.current ? "grabbing" : spaceDown || (tool === "select" && !selectedId) ? "grab" : tool === "eraser" ? "cell" : tool === "text" || tool === "sticky" || tool === "callout" ? "text" : tool === "laser" ? "none" : tool === "image" ? "copy" : "crosshair";

  if (presentMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <button className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-lg" onClick={() => setPresentMode(false)}>Exit</button>
        </div>
        <div className="flex-1 overflow-auto">
          <canvas ref={canvasRef} width={CW} height={CH} className="w-full h-full object-contain" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-screen select-none overflow-hidden ${isDark ? "bg-gray-950" : "bg-slate-100"}`} style={{ userSelect: "none" }}>

      {/* ── Hidden file input ── */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* ══ TOP BAR ══ */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 border-b flex-shrink-0 flex-wrap ${tb}`}>
        <Link href={`/student/class/${cid}`}>
          <button className={`${btnBase} h-7 px-2 gap-1 ${toolInactive}`}><ArrowLeft size={13} /><span>Back</span></button>
        </Link>
        <div className={`h-4 w-px ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />
        <span className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>My Whiteboard</span>
        <div className={`h-4 w-px ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

        {/* Undo / Redo */}
        <button className={`${btnBase} h-7 w-7 ${toolInactive} ${!actions.length ? "opacity-30" : ""}`} title="Undo (Ctrl+Z)" disabled={!actions.length} onClick={undoAction}><Undo2 size={13} /></button>
        <button className={`${btnBase} h-7 w-7 ${toolInactive} ${!redoStack.length ? "opacity-30" : ""}`} title="Redo (Ctrl+Y)" disabled={!redoStack.length} onClick={redoAction}><Redo2 size={13} /></button>
        <div className={`h-4 w-px ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

        {/* Zoom */}
        <button className={`${btnBase} h-7 w-7 ${toolInactive}`} title="Zoom Out" onClick={() => setZoom(z => Math.max(0.15, +(z - 0.15).toFixed(2)))}><ZoomOut size={13} /></button>
        <button className={`text-xs font-mono w-10 text-center rounded px-1 py-0.5 border ${isDark ? "bg-gray-800 border-gray-600 text-gray-200" : "bg-gray-50 border-gray-200"}`} onClick={zoomToFit} title="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button className={`${btnBase} h-7 w-7 ${toolInactive}`} title="Zoom In" onClick={() => setZoom(z => Math.min(5, +(z + 0.15).toFixed(2)))}><ZoomIn size={13} /></button>
        <div className={`h-4 w-px ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

        {/* Background */}
        <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>BG:</span>
        <div className="flex gap-0.5 flex-wrap">
          {BG_OPTIONS.map(bg => (
            <button key={bg.key} onClick={() => setBgStyle(bg.key)}
              className={`text-xs px-1.5 py-0.5 rounded border transition-all ${bgStyle === bg.key ? "bg-primary text-white border-primary" : isDark ? "border-gray-600 text-gray-400 hover:bg-gray-700" : "border-gray-200 hover:bg-gray-100"}`}>
              {bg.label}
            </button>
          ))}
        </div>
        <div className={`h-4 w-px ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

        {/* Snap to grid */}
        <button onClick={() => setGridSnap(g => !g)} title="Snap to grid"
          className={`${btnBase} h-7 px-2 gap-1 text-xs ${gridSnap ? "bg-emerald-600 text-white border-emerald-600" : toolInactive}`}>
          <Grid size={12} />Snap
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <span className={`text-xs font-medium ${saved ? "text-green-500" : "text-amber-500"}`}>{saved ? "✓ Saved" : "● Unsaved"}</span>
          <button onClick={() => handleExport("png")} className={`${btnBase} h-7 px-2 gap-1 ${toolInactive}`} title="Export PNG"><Download size={12} />PNG</button>
          <button onClick={() => handleExport("jpeg")} className={`${btnBase} h-7 px-2 gap-1 ${toolInactive}`} title="Export JPEG"><Download size={12} />JPG</button>
          <button onClick={() => setPresentMode(true)} className={`${btnBase} h-7 w-7 ${toolInactive}`} title="Presentation mode"><Maximize2 size={13} /></button>
          <button className={`${btnBase} h-7 w-7 text-red-500 ${isDark ? "hover:bg-red-900/30" : "hover:bg-red-50"} border-transparent`} title="Clear all" onClick={handleClear}><Trash2 size={13} /></button>
          <button className={`${btnBase} h-7 px-3 gap-1 bg-primary text-white border-primary hover:bg-primary/90`} onClick={() => doSave()} disabled={saveWb.isPending}><Save size={12} />{saveWb.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ══ LEFT TOOL SIDEBAR ══ */}
        <div className={`flex flex-col items-center gap-0.5 py-2 px-1 border-r flex-shrink-0 overflow-y-auto ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
          {TOOL_GROUPS.map((group, gi) => (
            <div key={gi} className="flex flex-col items-center gap-0.5 w-full">
              {group.map(({ id, label, icon }) => (
                <button key={id} onClick={() => setTool(id)} title={label}
                  className={`w-10 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-all border ${tool === id ? toolActive : toolInactive}`}>
                  <span style={{ fontSize: 15 }}>{icon}</span>
                </button>
              ))}
              {gi < TOOL_GROUPS.length - 1 && <div className={`h-px w-8 my-1 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />}
            </div>
          ))}

          {/* Selection actions */}
          {selectedId && (
            <>
              <div className={`h-px w-8 my-1 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />
              <button onClick={bringToFront} title="Bring to front" className={`w-10 h-9 rounded-lg border text-xs ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                <span style={{ fontSize: 12 }}>▲▲</span>
              </button>
              <button onClick={sendToBack} title="Send to back" className={`w-10 h-9 rounded-lg border text-xs ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                <span style={{ fontSize: 12 }}>▼▼</span>
              </button>
              <button title="Delete selected (Del)" onClick={() => { setActions(prev => { const n = prev.filter(a => a.id !== selectedId); scheduleAutoSave(n); return n; }); setSelectedId(null); }}
                className={`w-10 h-9 rounded-lg border text-red-500 ${isDark ? "border-gray-600 hover:bg-red-900/30" : "border-gray-200 hover:bg-red-50"}`}>
                <Trash2 size={13} />
              </button>
              <button title="Duplicate (Ctrl+D)" onClick={() => {
                const sel = actions.find(a => a.id === selectedId);
                if (sel) {
                  const newA = { ...sel, id: uid(), start: sel.start ? { x: sel.start.x + 20, y: sel.start.y + 20 } : undefined, end: sel.end ? { x: sel.end.x + 20, y: sel.end.y + 20 } : undefined, points: sel.points?.map(p => ({ x: p.x + 20, y: p.y + 20 })) };
                  setActions(prev => { const n = [...prev, newA]; scheduleAutoSave(n); return n; }); setSelectedId(newA.id);
                }
              }} className={`w-10 h-9 rounded-lg border ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                <Copy size={13} />
              </button>
            </>
          )}

          {/* Hint */}
          <div className={`mt-auto pt-2 border-t w-full text-center ${isDark ? "border-gray-700 text-gray-600" : "border-gray-200 text-gray-400"}`}>
            <div className="text-[8px] leading-tight px-0.5">Shift=lock<br />Space=pan<br />Del=del</div>
          </div>
        </div>

        {/* ══ RIGHT: STYLE + CANVAS ══ */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* ── Style Toolbar ── */}
          <div className={`flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0 flex-wrap overflow-x-auto ${tbSub}`}>

            {/* Stroke color */}
            <div className="flex items-center gap-0.5 flex-wrap shrink-0">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} title={c}
                  className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 shrink-0 ${color === c ? "border-primary scale-110 ring-2 ring-primary/30" : "border-transparent hover:border-gray-300"}`}
                  style={{ backgroundColor: c, boxShadow: c === "#ffffff" ? "inset 0 0 0 1px #d1d5db" : undefined }} />
              ))}
              <label className="w-5 h-5 rounded-full overflow-hidden border-2 border-dashed border-gray-300 cursor-pointer hover:border-primary" title="Custom color">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="opacity-0 w-0 h-0" />
                <div className="w-full h-full" style={{ backgroundColor: color }} />
              </label>
            </div>

            <div className={`h-4 w-px shrink-0 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

            {/* Fill */}
            <div className="flex items-center gap-1 shrink-0">
              <label className={`flex items-center gap-1 text-xs cursor-pointer ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                <input type="checkbox" checked={fillEnabled} onChange={e => setFillEnabled(e.target.checked)} className="w-3 h-3 accent-primary" />Fill
              </label>
              {fillEnabled && (
                <label className="w-5 h-5 rounded border-2 border-gray-300 cursor-pointer overflow-hidden" title="Fill color">
                  <input type="color" value={fillColor} onChange={e => setFillColor(e.target.value)} className="opacity-0 w-0 h-0" />
                  <div className="w-full h-full" style={{ backgroundColor: fillColor }} />
                </label>
              )}
            </div>

            <div className={`h-4 w-px shrink-0 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

            {/* Stroke width */}
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>W:</span>
              <div className="w-14"><Slider min={1} max={40} step={1} value={[lineWidth]} onValueChange={([v]) => setLineWidth(v)} /></div>
              <span className={`text-xs w-4 tabular-nums ${isDark ? "text-gray-300" : ""}`}>{lineWidth}</span>
            </div>

            <div className={`h-4 w-px shrink-0 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

            {/* Opacity */}
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>α:</span>
              <div className="w-14"><Slider min={10} max={100} step={5} value={[Math.round(opacity * 100)]} onValueChange={([v]) => setOpacity(v / 100)} /></div>
              <span className={`text-xs w-7 tabular-nums ${isDark ? "text-gray-300" : ""}`}>{Math.round(opacity * 100)}%</span>
            </div>

            <div className={`h-4 w-px shrink-0 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />

            {/* Dash */}
            <div className="flex items-center gap-0.5 shrink-0">
              {(["solid", "dashed", "dotted"] as DashStyle[]).map(d => (
                <button key={d} onClick={() => setDashStyle(d)}
                  className={`text-xs px-1.5 py-0.5 rounded border transition-all ${dashStyle === d ? "bg-primary text-white border-primary" : isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-200 hover:bg-gray-100"}`}>
                  {d === "solid" ? "━" : d === "dashed" ? "╌╌" : "·····"}
                </button>
              ))}
            </div>

            {/* Text / Font controls */}
            {(tool === "text" || tool === "sticky" || tool === "callout") && (
              <>
                <div className={`h-4 w-px shrink-0 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Font:</span>
                  <div className="w-14"><Slider min={10} max={72} step={2} value={[fontSize]} onValueChange={([v]) => setFontSize(v)} /></div>
                  <span className={`text-xs tabular-nums ${isDark ? "text-gray-300" : ""}`}>{fontSize}px</span>
                </div>
                <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
                  className={`text-xs rounded border px-1.5 py-0.5 ${isDark ? "bg-gray-800 border-gray-600 text-gray-200" : "bg-white border-gray-200"}`}>
                  {FONT_FAMILIES.map((f, i) => <option key={f} value={f}>{FONT_FAMILY_LABELS[i]}</option>)}
                </select>
                <button onClick={() => setFontBold(b => !b)} className={`text-xs px-1.5 py-0.5 rounded border font-bold transition-all ${fontBold ? "bg-primary text-white border-primary" : isDark ? "border-gray-600 text-gray-300" : "border-gray-200"}`}>B</button>
                <button onClick={() => setFontItalic(b => !b)} className={`text-xs px-1.5 py-0.5 rounded border italic transition-all ${fontItalic ? "bg-primary text-white border-primary" : isDark ? "border-gray-600 text-gray-300" : "border-gray-200"}`}>I</button>
              </>
            )}

            {/* Sticky color presets */}
            {tool === "sticky" && (
              <>
                <div className={`h-4 w-px shrink-0 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />
                <div className="flex items-center gap-0.5 shrink-0">
                  {STICKY_COLORS.map(c => (
                    <button key={c} onClick={() => setFillColor(c)}
                      className={`w-5 h-5 rounded border-2 ${fillColor === c ? "border-primary scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </>
            )}

            <span className={`ml-auto text-[10px] whitespace-nowrap shrink-0 ${isDark ? "text-gray-700" : "text-gray-400"}`}>
              Ctrl+Z undo · Shift=lock · Space=pan · Ctrl+scroll=zoom · Del=delete
            </span>
          </div>

          {/* ── Canvas area ── */}
          <div className="flex-1 overflow-auto relative" style={{ background: isDark ? "#0f0f1a" : "#e2e8f0" }} onWheel={handleWheel}>
            <div style={{ width: CW * zoom + 80, height: CH * zoom + 80, display: "flex", alignItems: "center", justifyContent: "center", minWidth: "100%", minHeight: "100%", paddingTop: 40, paddingLeft: 40 }}>
              <div style={{ position: "relative", width: CW * zoom, height: CH * zoom, flexShrink: 0 }}>

                {/* Main canvas */}
                <canvas
                  ref={canvasRef}
                  width={CW} height={CH}
                  style={{ width: CW * zoom, height: CH * zoom, display: "block", cursor: canvasCursor, borderRadius: 8, boxShadow: isDark ? "0 4px 40px rgba(0,0,0,0.6)" : "0 4px 32px rgba(0,0,0,0.15)" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  data-testid="canvas-whiteboard"
                />

                {/* Laser overlay canvas */}
                <canvas
                  ref={laserCanvasRef}
                  width={CW} height={CH}
                  style={{ position: "absolute", top: 0, left: 0, width: CW * zoom, height: CH * zoom, pointerEvents: "none", borderRadius: 8 }}
                />

                {/* Text / sticky overlay */}
                {textOverlay && (
                  <div style={{ position: "absolute", left: textOverlay.cx, top: textOverlay.cy, zIndex: 20, pointerEvents: "auto" }}>
                    <textarea
                      ref={textRef}
                      value={textVal}
                      onChange={e => setTextVal(e.target.value)}
                      onBlur={commitText}
                      onKeyDown={e => {
                        if (e.key === "Escape") { setTextOverlay(null); setTextVal(""); }
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitText(); }
                      }}
                      rows={textOverlay.forTool === "sticky" ? 4 : 2}
                      placeholder={textOverlay.forTool === "sticky" ? "Sticky note… (Ctrl+Enter to commit)" : textOverlay.forTool === "callout" ? "Callout text…" : "Type text… (Ctrl+Enter to commit)"}
                      className="border-2 border-primary rounded-lg px-2 py-1 outline-none resize shadow-xl min-w-40"
                      style={{ fontSize: Math.max(11, fontSize * zoom), color, backgroundColor: isDark ? "#1e1e2e" : "#fff", minWidth: 160 }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Status bar ── */}
          <div className={`flex items-center gap-4 px-4 py-1 border-t text-[10px] flex-shrink-0 ${isDark ? "bg-gray-900 border-gray-700 text-gray-500" : "bg-white border-gray-200 text-gray-400"}`}>
            <span>{actions.length} object{actions.length !== 1 ? "s" : ""}</span>
            <span>Zoom {Math.round(zoom * 100)}%</span>
            <span>Tool: <strong className={isDark ? "text-gray-300" : "text-gray-600"}>{tool}</strong></span>
            <span>W: {lineWidth}px · α: {Math.round(opacity * 100)}%</span>
            {selectedId && <span className="text-indigo-500 font-medium">● 1 selected · Del=delete · Ctrl+D=duplicate</span>}
            {!saved && <span className="text-amber-500 font-medium ml-auto">Auto-saving…</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
