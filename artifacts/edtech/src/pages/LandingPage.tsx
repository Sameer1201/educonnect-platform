import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Brain,
  Clock3,
  Globe2,
  GraduationCap,
  Layers3,
  Orbit,
  PlayCircle,
  Radar,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

const courseCards = [
  { title: "Live Classes", subtitle: "Teacher-led sessions, whiteboard flow, and clear classroom access", tone: "from-cyan-400/30 to-blue-500/20" },
  { title: "Question Bank", subtitle: "Subject and chapter-wise practice built for daily preparation", tone: "from-violet-400/25 to-fuchsia-500/20" },
  { title: "Practice Mode", subtitle: "Simple, focused preparation without distractions or ads", tone: "from-orange-300/25 to-rose-400/20" },
];

const testimonials = [
  { name: "Aarav", role: "Student", text: "Live class aur question bank ek hi jagah milne se preparation kaafi simple ho gayi." },
  { name: "Mira", role: "Student", text: "Practice chapter-wise milti hai, isliye padhai zyada focused feel hoti hai." },
  { name: "Rohit", role: "Teacher", text: "Class manage karna, students ko guide karna, aur practice maintain karna kaafi easy ho gaya." },
];

export default function LandingPage() {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [portalOpening, setPortalOpening] = useState(false);
  const [stars, setStars] = useState<Array<{ left: string; top: string; delay: string; duration: string }>>([]);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [submittingContact, setSubmittingContact] = useState(false);
  const coursesRef = useRef<HTMLElement | null>(null);
  const contactRef = useRef<HTMLElement | null>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 80, damping: 18 });
  const smoothY = useSpring(mouseY, { stiffness: 80, damping: 18 });

  const heroRotateY = useTransform(smoothX, [-0.5, 0.5], [10, -10]);
  const heroRotateX = useTransform(smoothY, [-0.5, 0.5], [-10, 10]);
  const orbX = useTransform(smoothX, [-0.5, 0.5], [-20, 20]);
  const orbY = useTransform(smoothY, [-0.5, 0.5], [20, -20]);
  const layerDeepX = useTransform(smoothX, [-0.5, 0.5], [-32, 32]);
  const layerDeepY = useTransform(smoothY, [-0.5, 0.5], [26, -26]);
  const layerNearX = useTransform(smoothX, [-0.5, 0.5], [18, -18]);
  const layerNearY = useTransform(smoothY, [-0.5, 0.5], [-14, 14]);

  useEffect(() => {
    const generated = Array.from({ length: 44 }, (_, index) => ({
      left: `${(index * 17) % 100}%`,
      top: `${(index * 29) % 100}%`,
      delay: `${(index % 9) * 0.45}s`,
      duration: `${5 + (index % 5)}s`,
    }));
    setStars(generated);
  }, []);

  const stats = useMemo(
    () => [
      { value: "Free", label: "For all users" },
      { value: "No Ads", label: "Distraction free" },
      { value: "2 Roles", label: "Teachers and students" },
    ],
    [],
  );

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const openLoginPortal = () => {
    if (portalOpening) return;
    setPortalOpening(true);
    window.setTimeout(() => setLocation("/login"), 700);
  };

  const scrollToCourses = () => {
    coursesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitContactForm = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittingContact(true);
    try {
      const response = await fetch(`${BASE}/api/support/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: contactSubject,
          message: contactMessage,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not send message");
      }

      setContactName("");
      setContactEmail("");
      setContactSubject("");
      setContactMessage("");
      toast({ title: "Message sent", description: "Your message has been sent to the super admin team." });
    } catch (error: any) {
      toast({ title: "Submission failed", description: error.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmittingContact(false);
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#040816] text-white"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        mouseX.set(0);
        mouseY.set(0);
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#223f8f_0%,#0b1431_36%,#040816_72%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(61,129,255,0.15),transparent_22%,transparent_70%,rgba(179,84,255,0.12))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(65,231,255,0.12),transparent_28%)]" />

      {stars.map((star, index) => (
        <span
          key={`${star.left}-${star.top}-${index}`}
          className="landing-star absolute h-1 w-1 rounded-full bg-white/70"
          style={{ left: star.left, top: star.top, animationDelay: star.delay, animationDuration: star.duration }}
        />
      ))}

      <div className="pointer-events-none absolute -left-32 top-20 h-80 w-80 rounded-full bg-cyan-400/18 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-40 h-96 w-96 rounded-full bg-fuchsia-500/14 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-blue-500/12 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/8 shadow-[0_0_40px_rgba(85,191,255,0.22)] backdrop-blur-xl">
              <GraduationCap size={24} className="text-cyan-200" />
            </div>
            <div>
              <p className="text-lg font-black tracking-[0.18em] text-white">EDUCONNECT</p>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Free Learning Portal</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={scrollToContact}>
              Contact
            </Button>
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setLocation("/login")}>
              Login
            </Button>
            <Button className="rounded-full bg-white text-slate-950 hover:bg-cyan-100" onClick={() => setLocation("/register")}>
              Get Started
            </Button>
          </div>
        </header>

        <section className="grid min-h-[calc(100vh-5rem)] items-center gap-14 py-10 lg:grid-cols-[1.02fr_0.98fr]">
          <motion.div {...fadeUp} className="max-w-2xl">
            <Badge className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-4 py-1 text-cyan-100 shadow-[0_0_30px_rgba(97,214,255,0.18)]">
              <Orbit size={14} className="mr-2" />
              Free Teacher Student Platform
            </Badge>

            <h1 className="mt-7 font-serif text-5xl font-black leading-[0.92] tracking-tight md:text-7xl">
              Connect.
              <span className="block bg-[linear-gradient(90deg,#9ce6ff_0%,#ffffff_38%,#b38dff_100%)] bg-clip-text text-transparent">
                Learn. Grow.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-white/72 md:text-lg">
              EduConnect is a free platform for teachers and students to run live classes, share question bank practice, and keep study flow simple without ads or clutter.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="group rounded-full bg-cyan-300 px-7 text-slate-950 hover:bg-cyan-200" onClick={openLoginPortal}>
                Get Started
                <ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-white/15 bg-white/6 px-7 text-white hover:bg-white/10 hover:text-white"
                onClick={scrollToCourses}
              >
                <PlayCircle size={16} className="mr-2" />
                Explore Features
              </Button>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.08 * index, duration: 0.55 }}
                  className="rounded-3xl border border-white/10 bg-white/7 p-4 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
                >
                  <p className="text-3xl font-black text-white">{stat.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div style={{ rotateY: heroRotateY, rotateX: heroRotateX }} className="relative mx-auto h-[640px] w-full max-w-[600px] transform-gpu [transform-style:preserve-3d]">
            <motion.div style={{ x: orbX, y: orbY }} className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/12 blur-3xl" />
            <motion.div
              style={{ x: layerDeepX, y: layerDeepY }}
              className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/8 opacity-40"
            />
            <motion.div
              style={{ x: layerNearX, y: layerNearY }}
              className="absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/5 shadow-[0_0_50px_rgba(133,220,255,0.2)]"
            />
            <div className="portal-grid absolute inset-x-2 bottom-12 top-28 opacity-35" />

            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 22, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/20"
            />

            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 28, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-200/16"
            />

            <div className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#dff8ff_0%,#7dd9ff_18%,#2249d5_42%,rgba(5,10,28,0.1)_68%)] shadow-[0_0_90px_rgba(83,205,255,0.35)]" />
            <div className="absolute left-1/2 top-1/2 h-[268px] w-[268px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 shadow-[inset_0_0_40px_rgba(255,255,255,0.14)]" />

            <motion.div
              animate={{ y: [0, -16, 0], rotateZ: [-2, 2, -2] }}
              transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              className="group absolute left-8 top-18 rounded-[2rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_28px_90px_rgba(87,196,255,0.24)]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
                <BookOpen size={24} />
              </div>
              <p className="mt-4 text-sm font-semibold text-white">Floating Knowledge Stack</p>
              <p className="mt-1 max-w-[180px] text-xs leading-5 text-white/60">Subjects, chapters, and practice flow organized in one place.</p>
            </motion.div>

            <motion.div
              animate={{ y: [0, 14, 0], rotateZ: [2, -1, 2] }}
              transition={{ duration: 7.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              className="group absolute right-6 top-8 rounded-[2rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_28px_90px_rgba(180,98,255,0.24)]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-300/10 text-fuchsia-100">
                <GraduationCap size={24} />
              </div>
              <p className="mt-4 text-sm font-semibold text-white">3D Mentor Portal</p>
              <p className="mt-1 max-w-[190px] text-xs leading-5 text-white/60">Teachers can run classes and guide students from a clean dashboard.</p>
            </motion.div>

            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 5.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              className="group absolute bottom-26 right-14 rounded-[2rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_28px_90px_rgba(91,233,198,0.24)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-100">
                  <Globe2 size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Global Education</p>
                  <p className="text-xs text-white/60">Connected class access</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {["Delhi", "Berlin", "Seoul"].map((city) => (
                  <div key={city} className="rounded-xl bg-white/6 px-3 py-2 text-center text-[11px] uppercase tracking-[0.16em] text-white/65">
                    {city}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              style={{ x: layerNearX, y: layerNearY }}
              animate={{ y: [0, -10, 0], rotateZ: [-4, 0, -4] }}
              transition={{ duration: 6.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              className="group absolute bottom-36 left-6 rounded-[2rem] border border-white/10 bg-white/8 p-4 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_28px_90px_rgba(125,215,255,0.24)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-300/10 text-cyan-100">
                  <Wifi size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Live Network Grid</p>
                  <p className="text-xs text-white/58">Class and practice sync</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {[92, 76, 98, 84].map((value, index) => (
                  <div key={value} className="flex-1 rounded-xl bg-white/6 p-2 text-center">
                    <p className="text-sm font-semibold text-white">{value}%</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Node {index + 1}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              style={{ x: layerDeepX, y: layerNearY }}
              animate={{ y: [0, 12, 0], rotateZ: [1, -2, 1] }}
              transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              className="group absolute right-2 top-1/2 w-52 rounded-[2rem] border border-white/10 bg-white/8 p-4 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_28px_90px_rgba(185,117,255,0.22)]"
            >
              <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Digital Screen</p>
                <Sparkles size={16} className="text-fuchsia-200" />
              </div>
              <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(88,196,255,0.12),rgba(176,108,255,0.08))] p-4">
                <div className="flex items-end gap-2">
                  {[34, 62, 48, 80, 71].map((height, index) => (
                    <div
                      key={height}
                      className="flex-1 rounded-full bg-[linear-gradient(180deg,rgba(114,226,255,0.9),rgba(105,120,255,0.35))]"
                      style={{ height: `${height}px`, opacity: 0.7 + index * 0.05 }}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/52">Student progress view</p>
              </div>
            </motion.div>

            <div className="absolute inset-0">
              {[
                { left: "18%", top: "35%" },
                { left: "30%", top: "20%" },
                { left: "52%", top: "26%" },
                { left: "68%", top: "38%" },
                { left: "60%", top: "62%" },
                { left: "34%", top: "66%" },
              ].map((node, index) => (
                <span key={`${node.left}-${node.top}-${index}`} className="absolute h-3 w-3 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(130,230,255,0.9)]" style={node} />
              ))}

              <svg className="absolute inset-0 h-full w-full opacity-75" viewBox="0 0 600 640" fill="none">
                {[
                  ["108", "224", "180", "132"],
                  ["180", "132", "312", "170"],
                  ["312", "170", "410", "240"],
                  ["410", "240", "358", "398"],
                  ["358", "398", "204", "420"],
                  ["204", "420", "108", "224"],
                  ["180", "132", "358", "398"],
                ].map((line, index) => (
                  <motion.line
                    key={line.join("-")}
                    x1={line[0]}
                    y1={line[1]}
                    x2={line[2]}
                    y2={line[3]}
                    stroke="url(#networkGlow)"
                    strokeWidth="1.2"
                    strokeDasharray="5 8"
                    initial={{ pathLength: 0.2, opacity: 0.2 }}
                    animate={{ pathLength: [0.25, 1, 0.25], opacity: [0.25, 0.9, 0.25] }}
                    transition={{ duration: 4 + index * 0.3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                  />
                ))}
                <defs>
                  <linearGradient id="networkGlow" x1="0" y1="0" x2="600" y2="640">
                    <stop offset="0%" stopColor="#82e6ff" />
                    <stop offset="50%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#b778ff" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <motion.button
              onClick={openLoginPortal}
              className="group absolute bottom-4 left-1/2 w-[88%] -translate-x-1/2 overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-slate-950/55 p-5 text-left backdrop-blur-xl shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
              whileHover={{ y: -8, scale: 1.01 }}
              animate={portalOpening ? { scale: 1.18, opacity: 0, filter: "blur(10px)" } : { scale: 1, opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(79,196,255,0.14),transparent_38%,rgba(181,101,255,0.14))]" />
              <div className="relative flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/58">Login Entry</p>
                  <p className="mt-1 text-xl font-semibold text-white">Floating 3D Login Portal</p>
                  <p className="mt-1 text-sm text-white/58">Zoom-in transition opens the teacher and student login page.</p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_36px_rgba(90,206,255,0.28)] transition-all duration-300 group-hover:scale-110">
                  <ArrowRight size={24} />
                </div>
              </div>
            </motion.button>
          </motion.div>
        </section>

        <section className="space-y-24 pb-24">
          <motion.section {...fadeUp} className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-xl shadow-[0_24px_90px_rgba(0,0,0,0.35)] md:p-8">
            <div className="flex items-center gap-3">
              <Badge className="border border-white/10 bg-white/8 text-white">Features</Badge>
              <p className="text-sm text-white/55">Designed for modern students and mentors</p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {[
                {
                  icon: <Bot size={22} />,
                  title: "Question Bank Practice",
                  text: "Students can practice subject-wise and chapter-wise from the assigned batch question bank.",
                },
                {
                  icon: <Clock3 size={22} />,
                  title: "Live Classes",
                  text: "Teachers and students join focused live sessions with a clear classroom flow.",
                },
                {
                  icon: <TrendingUp size={22} />,
                  title: "Simple Progress Flow",
                  text: "Track preparation through classes, practice, and teacher-led learning without extra clutter.",
                },
              ].map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: index * 0.08 }}
                  whileHover={{ y: -10, rotateX: -4, rotateY: 3 }}
                  className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-100 shadow-[0_0_28px_rgba(96,201,255,0.18)]">
                    {feature.icon}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/62">{feature.text}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section {...fadeUp} ref={coursesRef}>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
              <Badge className="border border-white/10 bg-white/8 text-white">Platform Focus</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Built for class, practice, and teacher student connection</h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-white/58">
                EduConnect currently focuses on what matters most: live classes, question bank practice, and a clean free experience.
              </p>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {courseCards.map((course, index) => (
                <motion.div
                  key={course.title}
                  initial={{ opacity: 0, y: 26 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.08 }}
                  whileHover={{ y: -12, rotateX: -6, rotateY: index === 1 ? 0 : index === 0 ? 5 : -5, boxShadow: "0 32px 90px rgba(74,133,255,0.22)" }}
                  className={`rounded-[2rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl`}
                >
                  <div className={`rounded-[1.5rem] bg-gradient-to-br ${course.tone} p-5 ring-1 ring-white/10`}>
                    <div className="flex items-center justify-between">
                      <div className="rounded-2xl bg-white/10 p-3 text-white">
                        {index === 0 ? <Brain size={24} /> : index === 1 ? <Radar size={24} /> : <Layers3 size={24} />}
                      </div>
                      <span className="text-xs uppercase tracking-[0.2em] text-white/55">Core 0{index + 1}</span>
                    </div>
                    <h3 className="mt-12 text-2xl font-bold text-white">{course.title}</h3>
                    <p className="mt-2 max-w-[260px] text-sm leading-6 text-white/70">{course.subtitle}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section {...fadeUp} className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <Badge className="border border-white/10 bg-white/8 text-white">Teachers And Students</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">A platform that keeps teaching and preparation in one flow</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/58">
                The product is simple on purpose: classes, question bank, practice, and direct teacher student connection.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={testimonial.name}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.08 }}
                  animate={{ y: [0, index % 2 === 0 ? -8 : 8, 0] }}
                  whileHover={{ y: -12, scale: 1.02 }}
                  className="rounded-[2rem] border border-white/10 bg-white/7 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(122,225,255,0.9),rgba(181,110,255,0.9))] text-slate-950 font-bold">
                      {testimonial.name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{testimonial.name}</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">{testimonial.role}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-1 text-yellow-300">
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <Star key={starIndex} size={14} fill="currentColor" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-white/65">{testimonial.text}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section
            {...fadeUp}
            className="relative overflow-hidden rounded-[2.3rem] border border-cyan-200/12 bg-[linear-gradient(135deg,rgba(36,102,255,0.18),rgba(179,82,255,0.13)_55%,rgba(255,255,255,0.06))] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.38)] backdrop-blur-xl md:p-10"
          >
            <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-cyan-300/12 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-fuchsia-400/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <Badge className="border border-white/10 bg-white/8 text-white">Call To Action</Badge>
                <h2 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">Study and teach without ads, fees, or distractions</h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/65">
                  EduConnect is free for everything right now, with a focused experience built around classes and question bank practice.
                </p>
              </div>

              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Button size="lg" className="rounded-full bg-cyan-300 px-8 text-slate-950 shadow-[0_0_40px_rgba(90,206,255,0.35)] hover:bg-cyan-200" onClick={openLoginPortal}>
                  Enter Login Portal
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </motion.div>
            </div>
          </motion.section>

          <motion.section
            {...fadeUp}
            ref={contactRef}
            className="grid gap-6 rounded-[2.3rem] border border-white/10 bg-white/6 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-8 lg:grid-cols-[0.92fr_1.08fr]"
          >
            <div className="relative overflow-hidden rounded-[2rem] border border-cyan-200/10 bg-[linear-gradient(160deg,rgba(55,123,255,0.16),rgba(174,97,255,0.12),rgba(255,255,255,0.04))] p-6">
              <div className="absolute -left-10 top-8 h-36 w-36 rounded-full bg-cyan-300/12 blur-3xl" />
              <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-fuchsia-400/10 blur-3xl" />
              <div className="relative">
                <Badge className="border border-white/10 bg-white/8 text-white">Contact Us</Badge>
                <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Talk to the EduConnect team</h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-white/62">
                  For support, teacher onboarding, or student help, send a message here and it will go directly to the super admin team.
                </p>

                <div className="mt-8 rounded-[1.7rem] border border-white/10 bg-white/7 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">Direct Admin Routing</p>
                  <p className="mt-2 text-sm leading-6 text-white/62">
                    Every contact form submission from this page is stored inside the platform and shown to the super admin support panel.
                  </p>
                </div>
              </div>
            </div>

            <motion.div
              whileHover={{ rotateX: -3, rotateY: 4, y: -6 }}
              className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">Response Time</p>
                  <p className="mt-2 text-3xl font-black text-white">&lt; 24 hrs</p>
                  <p className="mt-2 text-sm text-white/58">Fast replies for support and onboarding queries.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">Pricing</p>
                  <p className="mt-2 text-3xl font-black text-white">Free</p>
                  <p className="mt-2 text-sm text-white/58">No ads and no paid barrier for current features.</p>
                </div>
              </div>

              <form onSubmit={submitContactForm} className="mt-4 rounded-[1.75rem] border border-cyan-200/10 bg-slate-950/45 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">Contact Form</p>
                    <p className="mt-1 text-xl font-semibold text-white">Send a message to super admin</p>
                  </div>
                  <Users size={22} className="text-cyan-100" />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-white/75">Name</Label>
                    <Input value={contactName} onChange={(e) => setContactName(e.target.value)} required className="mt-1 border-white/10 bg-white/6 text-white placeholder:text-white/35" placeholder="Your name" />
                  </div>
                  <div>
                    <Label className="text-white/75">Email</Label>
                    <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required className="mt-1 border-white/10 bg-white/6 text-white placeholder:text-white/35" placeholder="Your email" />
                  </div>
                </div>

                <div>
                  <Label className="text-white/75">Subject</Label>
                  <Input value={contactSubject} onChange={(e) => setContactSubject(e.target.value)} required className="mt-1 border-white/10 bg-white/6 text-white placeholder:text-white/35" placeholder="Support, onboarding, teacher query..." />
                </div>

                <div>
                  <Label className="text-white/75">Message</Label>
                  <Textarea value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} required rows={5} className="mt-1 border-white/10 bg-white/6 text-white placeholder:text-white/35" placeholder="Write your message here..." />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="submit" className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={submittingContact}>
                    {submittingContact ? "Sending..." : "Submit To Super Admin"}
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full border-white/15 bg-white/6 text-white hover:bg-white/10 hover:text-white" onClick={openLoginPortal}>
                    Enter Portal
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.section>
        </section>
      </div>
    </div>
  );
}
