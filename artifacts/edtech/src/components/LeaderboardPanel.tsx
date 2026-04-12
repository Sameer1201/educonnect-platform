import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, ClipboardList, FileText, UserCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { api } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LeaderboardEntry {
  id: number;
  fullName: string;
  username: string;
  points: number;
  rank: number;
  avgTestScore: number;
  avgAssignmentGrade: number;
  attendancePercentage: number;
  testsCompleted: number;
  assignmentsSubmitted: number;
}

const rankColors = ["text-yellow-500", "text-slate-400", "text-amber-600"];
const medalIcons = [
  <Trophy size={15} className="text-yellow-500" />,
  <Medal size={15} className="text-slate-400" />,
  <Medal size={15} className="text-amber-600" />,
];

export default function LeaderboardPanel({ showLabel = true }: { showLabel?: boolean }) {
  const { user } = useAuth();
  const { data: platformSettings } = usePlatformSettings(!!user);
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState<string>("all");
  const learningAccessEnabled = platformSettings?.learningAccessEnabled ?? true;

  const { data: classes = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["classes-for-leaderboard-panel"],
    queryFn: () => api.get("/classes").then((data) => data.map((c: any) => ({ id: c.id, title: c.title }))),
    enabled: open && learningAccessEnabled && user?.role !== "student",
    staleTime: 60_000,
  });

  const { data: leaderboard = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard-panel", classId],
    queryFn: () => {
      const params = classId !== "all" ? `?classId=${classId}` : "";
      return api.get(`/leaderboard${params}`);
    },
    enabled: open,
    staleTime: 30_000,
  });

  const topEntries = leaderboard.slice(0, 8);
  const myEntry = user?.role === "student" ? leaderboard.find((entry) => entry.id === user.id) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] transition-colors hover:bg-[#F5F7FB] hover:text-[#111827] ${showLabel ? "flex items-center gap-2 px-3 py-1.5 text-xs" : "flex h-9 w-9 items-center justify-center p-2"}`}
          title="Leaderboard"
          data-testid={showLabel ? "button-top-leaderboard" : "button-top-leaderboard-mobile"}
        >
          <Trophy size={showLabel ? 13 : 16} />
          {showLabel ? <span>Leaderboard</span> : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        collisionPadding={12}
        className="z-[80] w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-0 shadow-2xl"
      >
        <div className="border-b border-[#E5E7EB] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FEF3C7] text-[#D97706]">
                <Trophy size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111827]">Leaderboard</p>
                <p className="text-[11px] text-[#6B7280]">Top performers</p>
              </div>
            </div>
            {learningAccessEnabled && user?.role !== "student" ? (
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="h-8 w-[132px] border-[#E5E7EB] bg-white text-xs">
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes.map((entry) => (
                    <SelectItem key={entry.id} value={String(entry.id)}>
                      {entry.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        {myEntry ? (
          <div className="border-b border-[#E5E7EB] bg-[#F8FAFF] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#6B7280]">Your rank</p>
                <p className="mt-1 text-lg font-semibold text-[#111827]">#{myEntry.rank}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[#5B4DFF]">{myEntry.points} pts</p>
                <p className="text-[11px] text-[#6B7280]">{myEntry.testsCompleted} tests</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="max-h-[min(28rem,calc(100vh-140px))] overflow-y-auto px-3 py-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-[#F3F4F6]" />
              ))}
            </div>
          ) : topEntries.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#6B7280]">
              <Trophy size={28} className="mx-auto mb-2 text-[#CBD5E1]" />
              No ranking data yet.
            </div>
          ) : (
            <div className="space-y-2">
              {topEntries.map((entry) => {
                const isMe = entry.id === user?.id;
                const isTop3 = entry.rank <= 3;
                return (
                  <div
                    key={entry.id}
                    className={`rounded-2xl border px-3 py-3 ${isMe ? "border-[#C7D2FE] bg-[#EEF2FF]" : "border-[#E5E7EB] bg-white"} `}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F8FAFC] text-sm font-semibold text-[#475569]">
                        {isTop3 ? medalIcons[entry.rank - 1] : <span>#{entry.rank}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[#111827]">
                            {entry.fullName}
                          </p>
                          {isMe ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#5B4DFF]">You</span> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#6B7280]">
                          <span className="flex items-center gap-1"><ClipboardList size={10} /> {entry.avgTestScore}%</span>
                          {learningAccessEnabled ? <span className="flex items-center gap-1"><FileText size={10} /> {entry.avgAssignmentGrade > 0 ? entry.avgAssignmentGrade : "–"}</span> : null}
                          {learningAccessEnabled ? <span className="flex items-center gap-1"><UserCheck size={10} /> {entry.attendancePercentage}%</span> : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${isTop3 ? rankColors[entry.rank - 1] : "text-[#111827]"}`}>{entry.points}</p>
                        <p className="text-[10px] text-[#94A3B8]">pts</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
