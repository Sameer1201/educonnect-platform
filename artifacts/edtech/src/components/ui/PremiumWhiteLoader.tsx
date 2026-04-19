import { motion } from "framer-motion";

const pearlDots = [
  { x: 0, y: -74, delay: 0, size: 9, color: "#2563eb" },
  { x: 62, y: -38, delay: 0.18, size: 7, color: "#7c3aed" },
  { x: 62, y: 38, delay: 0.36, size: 8, color: "#06b6d4" },
  { x: 0, y: 74, delay: 0.54, size: 6, color: "#f59e0b" },
  { x: -62, y: 38, delay: 0.72, size: 8, color: "#ec4899" },
  { x: -62, y: -38, delay: 0.9, size: 7, color: "#10b981" },
];

export function PremiumWhiteLoader({ progress = 0 }: { progress?: number }) {
  const progressDegrees = Math.max(8, Math.min(360, progress * 3.6));

  return (
    <div className="relative flex h-[520px] w-full items-center justify-center overflow-hidden rounded-3xl bg-white">
      <motion.div
        className="absolute h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.12)_0%,rgba(124,58,237,0.06)_42%,rgba(255,255,255,0)_70%)] blur-2xl"
        animate={{ scale: [0.94, 1.08, 0.94], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex h-56 w-56 items-center justify-center">
        <motion.div
          className="absolute h-52 w-52 rounded-full border border-slate-100 shadow-[inset_0_0_40px_rgba(15,23,42,0.04)]"
          animate={{ scale: [0.9, 1.08, 0.9], opacity: [0.25, 0.75, 0.25] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute h-40 w-40 rounded-full border border-slate-200/70"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute left-1/2 top-[-5px] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.6)]" />
        </motion.div>
        <motion.div
          className="absolute h-28 w-28 rounded-full border border-dashed border-slate-200/80"
          animate={{ rotate: -360 }}
          transition={{ duration: 13, repeat: Infinity, ease: "linear" }}
        />

        {pearlDots.map((dot) => (
          <motion.div
            key={`${dot.x}-${dot.y}`}
            className="absolute rounded-full"
            style={{
              width: dot.size,
              height: dot.size,
              backgroundColor: dot.color,
              boxShadow: `0 0 18px ${dot.color}66`,
            }}
            initial={{ x: dot.x, y: dot.y, scale: 0.5, opacity: 0.3 }}
            animate={{
              x: [dot.x, dot.x * 0.74, dot.x],
              y: [dot.y, dot.y * 0.74, dot.y],
              scale: [0.65, 1.3, 0.65],
              opacity: [0.35, 1, 0.35],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: dot.delay,
            }}
          />
        ))}

        <motion.div
          className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-slate-100 shadow-[0_18px_60px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,1)]"
          animate={{ y: [-3, 3, -3], scale: [1, 1.035, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            className="absolute inset-[9px] rounded-full p-[2px] opacity-80 transition-all duration-300"
            style={{
              background: `conic-gradient(from -90deg, #2563eb ${progressDegrees}deg, rgba(226,232,240,0.65) ${progressDegrees}deg)`,
            }}
          >
            <div className="h-full w-full rounded-full bg-white" />
          </div>
          <motion.div
            className="absolute inset-3 rounded-full bg-[conic-gradient(from_0deg,#2563eb,#8b5cf6,#06b6d4,#f59e0b,#ec4899,#2563eb)] p-[2px]"
            animate={{ rotate: 360 }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "linear" }}
          >
            <div className="h-full w-full rounded-full bg-white" />
          </motion.div>
          <motion.div
            className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950"
            animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </div>
  );
}
