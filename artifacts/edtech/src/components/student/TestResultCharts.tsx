import { Timer, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type QuestionType = "mcq" | "multi" | "integer";
type AnswerValue = number | number[] | string;

interface QuestionLike {
  id: number;
  questionType: QuestionType;
  correctAnswer?: number;
  correctAnswerMulti?: number[] | null;
  correctAnswerMin?: number | null;
  correctAnswerMax?: number | null;
}

interface PieDatum {
  name: string;
  value: number;
}

interface TimeBarDatum {
  name: string;
  seconds: number;
  qId: number;
}

interface TestResultChartsProps {
  pieData: PieDatum[];
  timeBarData: TimeBarDatum[];
  questions: QuestionLike[];
  submittedAnswers: Record<number, AnswerValue>;
  formatSeconds: (secs: number) => string;
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#94a3b8"];

function isAnswerCorrect(question: QuestionLike, answer: AnswerValue | undefined): boolean {
  if (answer === undefined || answer === null) return false;
  if (question.questionType === "multi") {
    const correct = [...(question.correctAnswerMulti ?? [])].sort((a, b) => a - b);
    const selected = Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : [];
    return JSON.stringify(selected) === JSON.stringify(correct);
  }
  if (question.questionType === "integer") {
    const numericAnswer = Number(answer);
    if (
      question.correctAnswerMin !== null &&
      question.correctAnswerMin !== undefined &&
      question.correctAnswerMax !== null &&
      question.correctAnswerMax !== undefined
    ) {
      return numericAnswer >= question.correctAnswerMin && numericAnswer <= question.correctAnswerMax;
    }
    return numericAnswer === question.correctAnswer;
  }
  return Number(answer) === question.correctAnswer;
}

export default function TestResultCharts({
  pieData,
  timeBarData,
  questions,
  submittedAnswers,
  formatSeconds,
}: TestResultChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="bg-muted/30 rounded-xl p-4">
        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Target size={13} className="text-primary" />
          Result Breakdown
        </p>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="value">
              {pieData.map((_, index) => (
                <Cell key={index} fill={PIE_COLORS[index]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-muted/30 rounded-xl p-4">
        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Timer size={13} className="text-primary" />
          Time per Question
        </p>
        {timeBarData.some((datum) => datum.seconds > 0) ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={timeBarData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${value}s`} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value) => [`${value}s`, "Time spent"]} />
              <Bar dataKey="seconds" radius={[4, 4, 0, 0]}>
                {timeBarData.map((datum) => {
                  const question = questions.find((entry) => entry.id === datum.qId);
                  const skipped = submittedAnswers[datum.qId] === undefined || submittedAnswers[datum.qId] === null;
                  const fill = question
                    ? isAnswerCorrect(question, submittedAnswers[datum.qId])
                      ? "#22c55e"
                      : skipped
                        ? "#94a3b8"
                        : "#ef4444"
                    : "#94a3b8";
                  return <Cell key={datum.qId} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
            No timing data — interact with questions during the test to record timings
          </div>
        )}
      </div>
    </div>
  );
}
