import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import {
  Download,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StudentProfileInsights } from "@/components/student/StudentProfileInsightsPanel";

const CHART_COLORS = {
  purple: "#795EFF",
  orange: "#FF8A00",
  blue: "#0079F2",
  green: "#009118",
  red: "#A60808",
  pink: "#EC4899",
};

const CHART_COLOR_LIST = [
  CHART_COLORS.purple,
  CHART_COLORS.orange,
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.red,
  CHART_COLORS.pink,
];

const DATA_SOURCES = ["Student DB", "Sessions", "Test Records"];
const PAGE_SIZE = 8;

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return parsed.toLocaleString("en-US", withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(value: string | null | undefined) {
  if (!value) return "No recent activity";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No recent activity";
  const diffMs = Date.now() - parsed.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${diffMins} min ago`;
  }
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(0, totalSeconds)}s`;
}

function DownloadCsvButton({
  rows,
  filename,
}: {
  rows: Array<Record<string, string | number | null>>;
  filename: string;
}) {
  const handleDownload = () => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header] ?? "";
            return `"${String(value).replace(/"/g, "\"\"")}"`;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
      style={{ backgroundColor: "#F0F1F2", color: "#4B5563" }}
      aria-label={`Export ${filename} data as CSV`}
    >
      <Download className="w-3.5 h-3.5" />
    </button>
  );
}

function DashboardHeader({ studentName }: { studentName: string }) {
  const lastRefreshed = useMemo(() => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
    const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${time} on ${date}`;
  }, []);

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="pt-2">
        <h1 className="font-bold text-[32px] flex items-center gap-2">
          <span className="text-[#795EFF]">RankPulse</span>
          <span>Analytics</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[14px]">Verified student analytics dashboard for {studentName}</p>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[12px] text-muted-foreground shrink-0">Data Sources:</span>
          {DATA_SOURCES.map((source) => (
            <span
              key={source}
              className="text-[12px] font-bold rounded px-2 py-0.5 truncate"
              title={source}
              style={{ maxWidth: "20ch", backgroundColor: "rgb(229, 231, 235)", color: "rgb(75, 85, 99)" }}
            >
              {source}
            </span>
          ))}
        </div>

        <p className="text-[12px] text-muted-foreground mt-3">Last refresh: {lastRefreshed}</p>
      </div>

      <div className="flex items-center gap-3 pt-2 print:hidden">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="relative flex items-center rounded-[6px] overflow-visible h-[26px] text-[12px] px-2 gap-1.5"
          style={{ backgroundColor: "#F0F1F2", color: "#4b5563" }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors"
          style={{ backgroundColor: "#F0F1F2", color: "#4b5563" }}
          aria-label="Export as PDF"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  trend,
  change,
  suffix = "",
}: {
  title: string;
  value?: string | number;
  trend?: "up" | "down";
  change?: string;
  suffix?: string;
}) {
  const trendColor = trend === "up" ? "text-green-600" : "text-red-600";
  const trendSymbol = trend === "up" ? "▲" : "▼";

  return (
    <Card>
      <CardContent className="p-6 flex flex-col justify-center">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold mt-1" style={{ color: "#795EFF" }}>
          {value !== undefined ? `${value}${suffix}` : "--"}
        </p>
        {change ? (
          <div className={`flex items-center gap-1 mt-1 text-[12px] ${trendColor}`}>
            <span>{trendSymbol}</span>
            <span>{change}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "6px", padding: "10px 14px", border: "1px solid #e0e0e0", color: "#1a1a1a", fontSize: "13px" }}>
      <div style={{ marginBottom: "6px", fontWeight: 500 }}>{label}</div>
      {payload.map((entry: any, index: number) => (
        <div key={`${entry.name}-${index}`} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
          {entry.color ? <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} /> : null}
          <span style={{ color: "#444" }}>{entry.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({ payload }: any) {
  if (!payload || payload.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 16px", fontSize: "13px" }}>
      {payload.map((entry: any, index: number) => (
        <div key={`${entry.value}-${index}`} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  data,
  filename,
  children,
}: {
  title: string;
  data?: any[];
  filename: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {data && data.length > 0 ? <DownloadCsvButton rows={data} filename={filename} /> : null}
      </CardHeader>
      <CardContent className="flex-1">
        {!data || data.length === 0 ? (
          <div className="w-full h-[300px] flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}

function AreaChartCard({ title, data, dataKey }: { title: string; data: any[]; dataKey: string }) {
  return (
    <ChartCard title={title} data={data} filename={title.toLowerCase().replace(/\s+/g, "-")}>
      <ResponsiveContainer width="100%" height={300} debounce={0}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.purple} stopOpacity={0.5} />
              <stop offset="100%" stopColor={CHART_COLORS.purple} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#71717a" }} stroke="#71717a" />
          <YAxis tick={{ fontSize: 12, fill: "#71717a" }} stroke="#71717a" />
          <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
          <Area type="monotone" dataKey={dataKey} name="Value" fill={`url(#gradient-${dataKey})`} stroke={CHART_COLORS.purple} fillOpacity={1} strokeWidth={2} activeDot={{ r: 5, fill: CHART_COLORS.purple, stroke: "#ffffff", strokeWidth: 3 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function BarChartCard({
  title,
  data,
  xKey = "label",
  yKey = "count",
  layout = "horizontal",
}: {
  title: string;
  data: any[];
  xKey?: string;
  yKey?: string;
  layout?: "horizontal" | "vertical";
}) {
  return (
    <ChartCard title={title} data={data} filename={title.toLowerCase().replace(/\s+/g, "-")}>
      <ResponsiveContainer width="100%" height={300} debounce={0}>
        <BarChart data={data} layout={layout} margin={{ top: 10, right: 10, left: layout === "vertical" ? 20 : -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          {layout === "horizontal" ? (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "#71717a" }} stroke="#71717a" interval={0} angle={-20} textAnchor="end" height={52} />
              <YAxis tick={{ fontSize: 12, fill: "#71717a" }} stroke="#71717a" />
            </>
          ) : (
            <>
              <XAxis type="number" tick={{ fontSize: 12, fill: "#71717a" }} stroke="#71717a" />
              <YAxis dataKey={xKey} type="category" tick={{ fontSize: 12, fill: "#71717a" }} stroke="#71717a" width={100} />
            </>
          )}
          <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
          <Bar dataKey={yKey} name="Value" fill={CHART_COLORS.orange} fillOpacity={0.8} isAnimationActive={false} radius={layout === "horizontal" ? [2, 2, 0, 0] : [0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DonutChartCard({ title, data, nameKey = "label", dataKey = "count" }: { title: string; data: any[]; nameKey?: string; dataKey?: string }) {
  return (
    <ChartCard title={title} data={data} filename={title.toLowerCase().replace(/\s+/g, "-")}>
      <ResponsiveContainer width="100%" height={300} debounce={0}>
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="45%" innerRadius={60} outerRadius={100} cornerRadius={2} paddingAngle={2} isAnimationActive={false} stroke="none">
            {data.map((entry, index) => (
              <Cell key={`${entry[nameKey]}-${index}`} fill={CHART_COLOR_LIST[index % CHART_COLOR_LIST.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
          <Legend content={<CustomLegend />} verticalAlign="bottom" height={40} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function SessionAuditTable({ rows }: { rows: StudentProfileInsights["sessionsHistory"] }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");

  const devices = useMemo(
    () => Array.from(new Set(rows.map((row) => row.deviceType || "Unknown device"))),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const searchBlob = [row.ipAddress, row.locationLabel, row.browserName, row.deviceType].join(" ").toLowerCase();
        const matchesSearch = !search || searchBlob.includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? row.isActive : !row.isActive);
        const matchesDevice = deviceFilter === "all" || (row.deviceType || "Unknown device") === deviceFilter;
        return matchesSearch && matchesStatus && matchesDevice;
      }),
    [deviceFilter, rows, search, statusFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by IP, browser, location..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-8 max-w-sm"
          />
        </div>

        <div className="w-[180px]">
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[180px]">
          <Select value={deviceFilter} onValueChange={(value) => { setDeviceFilter(value); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="All Devices" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              {devices.map((device) => (
                <SelectItem key={device} value={device}>{device}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80">
              {["Started", "IP", "Location", "Device", "Browser", "Duration", "Status"].map((header) => (
                <th key={header} className="px-4 py-3 text-left font-medium text-slate-500">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="h-24 px-4 text-center text-muted-foreground">
                  No session audit records found.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{formatDate(row.startedAt, true)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.ipAddress || "Unknown IP"}</td>
                  <td className="px-4 py-3">{row.locationLabel || "Unknown location"}</td>
                  <td className="px-4 py-3">{row.deviceType || "Unknown device"}</td>
                  <td className="px-4 py-3">{row.browserName || "Unknown browser"}</td>
                  <td className="px-4 py-3">{formatDuration(row.totalSeconds)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={row.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
                      {row.isActive ? "Active" : "Closed"}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          Showing {filteredRows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0} to {Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} results
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
            Previous
          </Button>
          <span className="text-sm px-2">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StudentProfileAnalysisPanel({ insights }: { insights: StudentProfileInsights }) {
  const scoreTrendData = useMemo(
    () =>
      insights.scoreTrend.map((item, index) => ({
        label: item.label || `T${index + 1}`,
        count: item.percentage,
      })),
    [insights.scoreTrend],
  );

  const activityBreakdownData = useMemo(
    () => insights.activityBreakdown.map((item) => ({ label: item.name, count: item.value })),
    [insights.activityBreakdown],
  );

  const activityTrendData = useMemo(
    () => insights.activityTrend.map((item) => ({ label: item.label, count: item.count })),
    [insights.activityTrend],
  );

  const practiceData = useMemo(
    () =>
      insights.questionBankPerformance.map((item) => ({
        label: item.subject,
        count: item.accuracy,
      })),
    [insights.questionBankPerformance],
  );

  const sessionDurationData = useMemo(
    () =>
      insights.sessionsHistory.slice(0, 8).map((item, index) => ({
        label: `S${index + 1}`,
        count: Math.max(1, Math.round(item.totalSeconds / 60)),
      })),
    [insights.sessionsHistory],
  );

  const emailStatusData = useMemo(() => {
    const counts = insights.emailHistory.reduce<Record<string, number>>((acc, item) => {
      const key = item.status || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([label, count]) => ({ label, count }));
  }, [insights.emailHistory]);

  const profileCompletionData = useMemo(() => {
    const complete = insights.profileCompletion.steps.filter((step) => step.complete).length;
    const incomplete = insights.profileCompletion.steps.length - complete;
    return [
      { label: "Completed", count: complete },
      { label: "Incomplete", count: incomplete },
    ];
  }, [insights.profileCompletion.steps]);

  return (
    <div className="min-h-full bg-background px-5 py-4 pt-[32px] pb-[32px] pl-[24px] pr-[24px]">
      <div className="max-w-[1400px] mx-auto">
        <DashboardHeader studentName={insights.student.fullName} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard title="Total Tests" value={insights.overview.testsAttempted} />
          <KPICard title="Avg Score" value={insights.overview.averageScore} suffix="%" />
          <KPICard title="Best Score" value={insights.overview.bestScore} suffix="%" />
          <KPICard title="Practice Accuracy" value={insights.overview.practiceAccuracy} suffix="%" />
          <KPICard title="Saved Questions" value={insights.overview.savedQuestions} />
          <KPICard title="Active Days (7d)" value={insights.overview.activeDaysLast7} />
          <KPICard title="Account Age" value={insights.overview.accountAgeDays} suffix=" days" />
          <KPICard title="Last Active" value={formatRelative(insights.overview.lastActiveAt)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2">
            <AreaChartCard title="Score Momentum" data={scoreTrendData} dataKey="count" />
          </div>

          <DonutChartCard title="Activity Mix" data={activityBreakdownData} />

          <BarChartCard title="Daily Activity Trend" data={activityTrendData} />

          <DonutChartCard title="Profile Completion" data={profileCompletionData} />

          <BarChartCard title="Question Bank Accuracy" data={practiceData} />

          <DonutChartCard title="Email Status" data={emailStatusData} />

          <BarChartCard title="Session Durations" data={sessionDurationData} />
        </div>

        <Card>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-base">Login Audit</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionAuditTable rows={insights.sessionsHistory} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
