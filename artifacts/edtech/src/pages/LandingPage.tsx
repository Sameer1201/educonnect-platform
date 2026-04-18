import { useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Mail,
  MessageSquare,
  ShieldCheck,
  Timer,
  Zap,
  LineChart,
} from "lucide-react";
import { motion } from "framer-motion";
import { BrandLogo } from "@/components/ui/brand-logo";
import { RankPulseLandingPreview } from "@/components/marketing/RankPulseLandingPreview";

const features = [
  {
    icon: <Timer className="h-5 w-5" />,
    iconBg: "bg-purple-100 text-purple-500",
    title: "Timed Tests",
    desc: "Full-screen mock tests with section switching, save-and-next flow, and an exam-style experience.",
  },
  {
    icon: <BookOpen className="h-5 w-5" />,
    iconBg: "bg-green-100 text-green-500",
    title: "Exam Question Bank",
    desc: "Practice by exam, subject, and chapter, then return to the exact weak areas that need another pass.",
  },
  {
    icon: <LineChart className="h-5 w-5" />,
    iconBg: "bg-orange-100 text-orange-500",
    title: "Advanced Analysis",
    desc: "Performance, time, attempt, difficulty, and question-wise analysis with visual graphs.",
  },
  {
    icon: <MessageSquare className="h-5 w-5" />,
    iconBg: "bg-blue-100 text-blue-500",
    title: "Review Bucket",
    desc: "Keep incorrect and unattempted questions in one clean place and revise them with solutions later.",
  },
];

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const analysisRef = useRef<HTMLElement | null>(null);
  const contactRef = useRef<HTMLElement | null>(null);
  const featuresRef = useRef<HTMLElement | null>(null);

  const openContactEmail = () => {
    const subject = encodeURIComponent("RankPulse inquiry");
    const body = encodeURIComponent("Hi RankPulse team,\n\nI want help with:\n");
    window.location.href = `mailto:support@rankpulse.in?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="fixed inset-x-0 top-0 z-50 border-b border-gray-100 bg-white/95 shadow-sm backdrop-blur"
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo
              variant="icon"
              showLabel
              className="gap-2.5"
              imageClassName="h-9 w-9"
              labelClassName="text-xl font-extrabold tracking-tight"
            />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <button className="text-sm font-medium text-gray-600 transition-colors hover:text-indigo-600" onClick={() => featuresRef.current?.scrollIntoView({ behavior: "smooth" })}>
              Features
            </button>
            <button className="text-sm font-medium text-gray-600 transition-colors hover:text-indigo-600" onClick={() => analysisRef.current?.scrollIntoView({ behavior: "smooth" })}>
              Analysis
            </button>
            <button className="text-sm font-medium text-gray-600 transition-colors hover:text-indigo-600" onClick={() => contactRef.current?.scrollIntoView({ behavior: "smooth" })}>
              Contact
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <button className="hidden text-sm font-medium text-gray-600 transition-colors hover:text-indigo-600 sm:block" onClick={() => setLocation("/login")}>
              Log In
            </button>
            <button
              className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
              onClick={() => setLocation("/register")}
            >
              Sign Up
            </button>
          </div>
        </div>
      </motion.header>

      <main className="w-full">
        <section
          ref={analysisRef}
          className="relative overflow-hidden pb-24 pt-32 md:pb-32 md:pt-44"
          style={{ background: "linear-gradient(135deg, #1a0533 0%, #2d1060 40%, #1e1b6e 100%)" }}
        >
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #a855f7, transparent)" }} />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, #6366f1, transparent)" }} />
          <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-4 lg:grid-cols-2 lg:items-center sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="max-w-2xl"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Student-first exam intelligence
              </div>
              <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-white md:text-6xl lg:text-7xl">
                Don&apos;t just practice.
                <br />
                <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Climb faster.</span>
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-purple-200 md:text-xl">
                RankPulse gives serious students timed tests, a smart review bucket, structured question practice, and deep analysis in one clean workspace.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <button
                  className="group flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-lg font-semibold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", boxShadow: "0 0 40px -5px rgba(168,85,247,0.6)" }}
                  onClick={() => setLocation("/register")}
                >
                  Start for Free
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  className="flex items-center justify-center rounded-lg border border-purple-400/40 px-8 py-4 text-lg font-semibold text-purple-200 transition-colors hover:bg-white/10"
                  onClick={() => featuresRef.current?.scrollIntoView({ behavior: "smooth" })}
                >
                  Explore Features
                </button>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-6 text-sm font-medium text-purple-300">
                {["Timed tests", "Review bucket", "Detailed graphs"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="relative"
            >
              <RankPulseLandingPreview />
            </motion.div>
          </div>
        </section>

        <section className="border-y border-gray-100 bg-white py-12">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 text-center md:grid-cols-4 sm:px-6 lg:px-8">
            {[
              { label: "Students Practicing", value: "50,000+" },
              { label: "Questions Attempted", value: "10M+" },
              { label: "Mock Tests", value: "5,000+" },
              { label: "Improvement Lift", value: "3.4x" },
            ].map((stat) => (
              <div key={stat.label} className="space-y-2">
                <div className="text-3xl font-bold text-gray-900 md:text-4xl">{stat.value}</div>
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" ref={featuresRef} className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Core Features</p>
              <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Everything important, without clutter.</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45 }}
                  whileHover={{ y: -4 }}
                  className="cursor-default rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md"
                >
                  <div className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl ${feature.iconBg}`}>
                    {feature.icon}
                  </div>
                  <h3 className="mb-2 text-base font-bold text-gray-900">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-500">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-y border-gray-100 bg-gray-50 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 max-w-3xl text-center mx-auto">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Advanced Analysis</p>
              <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Deep insight into every attempt</h2>
              <p className="text-lg text-gray-500">
                Stop guessing what went wrong. RankPulse breaks down accuracy, time, difficulty, and question journey clearly after every test.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { title: "Subject-wise Accuracy", desc: "See exactly which subjects are dragging your score down." },
                { title: "Negative Marking Control", desc: "Track unforced errors and learn where to hold back." },
                { title: "Peer Comparison", desc: "Compare your sectional performance against strong attempts." },
              ].map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                  className="flex items-start gap-4"
                >
                  <div className="mt-1 rounded p-1.5 text-indigo-600 bg-indigo-100 shrink-0">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-900">{item.title}</h4>
                    <p className="text-gray-500">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-16 px-4 lg:grid-cols-2 lg:items-center sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="space-y-8"
            >
              <div>
                <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Built for the grind</h2>
                <p className="text-lg text-gray-500">
                  Late nights, long revision loops, and repeated mock analysis. RankPulse is designed for students who actually sit and solve.
                </p>
              </div>
              <div className="space-y-4">
                <p className="text-gray-500">
                  The platform keeps your tests, weak-question review bucket, and analysis together so you can move from attempt to revision without losing context.
                </p>
                <p className="text-gray-500">
                  Build a practice habit around the exact chapters and question styles that still need work instead of random repetition.
                </p>
              </div>
              <button
                className="group flex items-center gap-2 rounded-lg px-8 py-4 text-lg font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", boxShadow: "0 0 30px -5px rgba(124,58,237,0.5)" }}
                onClick={() => setLocation("/register")}
              >
                Get Started Free
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="space-y-6 rounded-2xl border border-gray-100 bg-gray-50 p-8 shadow-lg"
            >
              <h3 className="text-xl font-bold text-gray-900">Built around student practice</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: "Mock Tests", color: "bg-blue-100 text-blue-700" },
                  { name: "Question Bank", color: "bg-green-100 text-green-700" },
                  { name: "Review Bucket", color: "bg-purple-100 text-purple-700" },
                  { name: "Deep Analysis", color: "bg-orange-100 text-orange-700" },
                  { name: "Time Tracking", color: "bg-red-100 text-red-700" },
                  { name: "Progress Graphs", color: "bg-indigo-100 text-indigo-700" },
                ].map((item) => (
                  <div key={item.name} className={`${item.color} rounded-lg px-3 py-2 text-center text-xs font-bold`}>
                    {item.name}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <BarChart3 className="h-5 w-5 shrink-0 text-indigo-600" />
                  <span>Clean full-screen test flow, bucket-based revision, and post-test analytics in one place.</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section ref={contactRef} className="border-t border-gray-100 bg-gray-50 py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 md:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-8 shadow-sm"
              >
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Contact</p>
                  <h2 className="text-2xl font-extrabold text-gray-900">Need help getting started?</h2>
                  <p className="leading-relaxed text-gray-500">
                    Send a message if you need help with access, test flow, revision flow, or understanding your analysis.
                  </p>
                </div>
                <div className="mt-10 space-y-4">
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 shrink-0">
                      <Mail className="h-4 w-4" />
                    </div>
                    <span>support@rankpulse.in</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm"
              >
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Reach the team directly</p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">
                      We removed the old in-platform support workflow, so the cleanest contact path is direct email.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                        <Mail className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">support@rankpulse.in</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Best for access issues, billing help, test flow questions, or product feedback.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {["Access setup", "Billing questions", "Product feedback"].map((item) => (
                      <div key={item} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                        {item}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                    onClick={openContactEmail}
                  >
                    Email the Team
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
