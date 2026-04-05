import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Medal, Star, TrendingUp, ClipboardList, FileText, UserCheck } from "lucide-react";

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
  // Note: avatarUrl not in schema
}

const rankColors = ["text-yellow-500", "text-slate-400", "text-amber-600"];
const rankBg = ["bg-yellow-50 border-yellow-200", "bg-slate-50 border-slate-200", "bg-amber-50 border-amber-200"];
const medalIcons = [
  <Trophy size={20} className="text-yellow-500" />,
  <Medal size={20} className="text-slate-400" />,
  <Medal size={20} className="text-amber-600" />,
];

export default function Leaderboard() {
  const { user } = useAuth();
  const [classId, setClassId] = useState<string>("all");

  const { data: classes = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["classes-for-leaderboard"],
    queryFn: () => {
      const endpoint = user?.role === "student" ? "/classes" : "/classes";
      return api.get(endpoint).then((data) => data.map((c: any) => ({ id: c.id, title: c.title })));
    },
  });

  const { data: leaderboard = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", classId],
    queryFn: () => {
      const params = classId !== "all" ? `?classId=${classId}` : "";
      return api.get(`/leaderboard${params}`);
    },
    refetchInterval: 60000,
  });

  const myEntry = user?.role === "student" ? leaderboard.find((e) => e.id === user.id) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy size={24} className="text-yellow-500" />
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">Ranked by test scores, assignments & attendance</p>
        </div>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* My rank banner */}
      {myEntry && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                #{myEntry.rank}
              </div>
              <div>
                <p className="font-semibold">Your Rank</p>
                <p className="text-sm text-muted-foreground">{myEntry.points} points</p>
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><ClipboardList size={12} /> {myEntry.testsCompleted} tests</span>
              <span className="flex items-center gap-1"><FileText size={12} /> {myEntry.assignmentsSubmitted} assignments</span>
              <span className="flex items-center gap-1"><UserCheck size={12} /> {myEntry.attendancePercentage}% attendance</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : leaderboard.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Trophy size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No data yet. Complete tests and assignments to appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry) => {
            const isMe = entry.id === user?.id;
            const isTop3 = entry.rank <= 3;
            return (
              <Card key={entry.id} className={`transition-all ${isMe ? "ring-2 ring-primary" : ""} ${isTop3 ? rankBg[entry.rank - 1] : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${isTop3 ? "" : "bg-muted text-muted-foreground"}`}>
                      {isTop3 ? medalIcons[entry.rank - 1] : <span className="text-base">#{entry.rank}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isMe ? "text-primary" : ""}`}>{entry.fullName}</span>
                        {isMe && <Badge className="text-xs">You</Badge>}
                        <span className="text-xs text-muted-foreground">@{entry.username}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ClipboardList size={11} />
                          Tests: <strong className="text-foreground">{entry.avgTestScore}%</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText size={11} />
                          Assignments: <strong className="text-foreground">{entry.avgAssignmentGrade > 0 ? entry.avgAssignmentGrade : "–"}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <UserCheck size={11} />
                          Attendance: <strong className="text-foreground">{entry.attendancePercentage}%</strong>
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-2xl font-bold ${isTop3 ? rankColors[entry.rank - 1] : ""}`}>{entry.points}</p>
                      <p className="text-xs text-muted-foreground">pts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
