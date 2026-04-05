import type { CSSProperties, ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function DashboardScene({
  children,
  accent = "from-cyan-500/20 via-blue-500/10 to-fuchsia-500/20",
  className = "",
}: {
  children: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={`relative isolate overflow-hidden rounded-[2rem] p-1 ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-90`} />
      <div className="absolute inset-[1px] rounded-[calc(2rem-2px)] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
        <div className="absolute -top-14 left-[8%] h-40 w-40 rounded-full bg-cyan-400/12 blur-3xl animate-pulse" />
        <div className="absolute top-[18%] right-[9%] h-52 w-52 rounded-full bg-fuchsia-500/10 blur-3xl animate-pulse [animation-delay:700ms]" />
        <div className="absolute bottom-[-4rem] left-[30%] h-64 w-64 rounded-full bg-blue-500/10 blur-3xl animate-pulse [animation-delay:1200ms]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:90px_90px] opacity-[0.12]" />
      </div>
      <div className="relative z-10 rounded-[calc(2rem-4px)] border border-white/10 bg-slate-950/35 p-5 backdrop-blur-md md:p-6">
        {children}
      </div>
    </div>
  );
}

export function TiltCard({
  children,
  className = "",
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  glare?: boolean;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [2, -2]), { stiffness: 150, damping: 22 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-2, 2]), { stiffness: 150, damping: 22 });
  const glareX = useTransform(mouseX, [-0.5, 0.5], ["20%", "80%"]);
  const glareY = useTransform(mouseY, [-0.5, 0.5], ["20%", "80%"]);

  return (
    <motion.div
      className={`relative transform-gpu ${className}`}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      whileHover={{ y: -1, scale: 1.002 }}
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        mouseX.set(clamp(x, -0.5, 0.5));
        mouseY.set(clamp(y, -0.5, 0.5));
      }}
      onMouseLeave={() => {
        mouseX.set(0);
        mouseY.set(0);
      }}
    >
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: "radial-gradient(circle at var(--gx) var(--gy), rgba(255,255,255,0.18), transparent 35%)",
            "--gx": glareX,
            "--gy": glareY,
          } as CSSProperties}
        />
      )}
      {children}
    </motion.div>
  );
}

export function HoloGrid({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:30px_30px] opacity-20" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
      {(title || subtitle) && (
        <div className="relative z-10 border-b border-white/10 px-5 py-4">
          {title && <h2 className="text-sm font-semibold tracking-[0.18em] text-white/85 uppercase">{title}</h2>}
          {subtitle && <p className="mt-1 text-xs text-white/55">{subtitle}</p>}
        </div>
      )}
      <div className="relative z-10 p-5">{children}</div>
    </div>
  );
}
