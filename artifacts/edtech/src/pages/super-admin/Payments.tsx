import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, CheckCircle, Clock, AlertTriangle, Bell, Plus, IndianRupee, Search, TrendingUp, Users, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const NOW = new Date();

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-xs font-semibold"><CheckCircle size={11}/> Paid</span>;
  if (status === "overdue")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold"><AlertTriangle size={11}/> Overdue</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs font-semibold"><Clock size={11}/> Pending</span>;
}

export default function SuperAdminPayments() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState(NOW.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(NOW.getFullYear());
  const [showGenModal, setShowGenModal] = useState(false);
  const [genMonth, setGenMonth] = useState(NOW.getMonth() + 1);
  const [genYear, setGenYear] = useState(NOW.getFullYear());
  const [genAmount, setGenAmount] = useState("5000");
  const [genDueDay, setGenDueDay] = useState(10);
  const [genMsg, setGenMsg] = useState("");
  const [reminderMsg, setReminderMsg] = useState("");

  const { data: payments = [], isLoading } = useQuery<any[]>({
    queryKey: ["sa-payments"],
    queryFn: () => fetch(`${BASE}/api/payments`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["sa-payment-stats"],
    queryFn: () => fetch(`${BASE}/api/payments/stats`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/payments/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ month: genMonth, year: genYear, amount: genAmount, dueDay: genDueDay }),
      });
      return r.json();
    },
    onSuccess: (data) => {
      setGenMsg(data.message ?? "Done");
      qc.invalidateQueries({ queryKey: ["sa-payments"] });
      qc.invalidateQueries({ queryKey: ["sa-payment-stats"] });
      setTimeout(() => { setShowGenModal(false); setGenMsg(""); }, 2500);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/payments/${id}/mark-paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sa-payments"] }),
  });

  const markOverdueMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/payments/${id}/mark-overdue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sa-payments"] }),
  });

  const sendRemindersMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/payments/send-reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ month: filterMonth, year: filterYear }),
      });
      return r.json();
    },
    onSuccess: (data) => {
      setReminderMsg(data.message ?? "Reminders sent!");
      setTimeout(() => setReminderMsg(""), 3000);
    },
  });

  const filtered = payments.filter((p: any) => {
    const matchMonth = p.month === filterMonth && p.year === filterYear;
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchSearch = !search ||
      (p.fullName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.username ?? "").toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchStatus && matchSearch;
  });

  const pendingCount = filtered.filter((p: any) => p.status === "pending" || p.status === "overdue").length;
  const collectionRate = stats?.totalAmount > 0 ? Math.round((stats.collectedAmount / stats.totalAmount) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard size={26} className="text-indigo-600"/> Tuition Fee Management
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Global overview of all student payments</p>
        </div>
        <button onClick={() => setShowGenModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0">
          <Plus size={16}/> Generate Monthly Fees
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Records", value: stats?.total ?? 0, color: "text-indigo-600", icon: <IndianRupee size={20}/> },
          { label: "Paid", value: stats?.paid ?? 0, color: "text-green-600", icon: <CheckCircle size={20}/> },
          { label: "Pending", value: stats?.pending ?? 0, color: "text-yellow-600", icon: <Clock size={20}/> },
          { label: "Overdue", value: stats?.overdue ?? 0, color: "text-red-600", icon: <AlertTriangle size={20}/> },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className={`${s.color} mb-2`}>{s.icon}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Revenue cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-5 text-white sm:col-span-1">
            <div className="text-indigo-200 text-sm mb-1">Total Revenue</div>
            <div className="text-3xl font-bold">₹{(stats.collectedAmount ?? 0).toLocaleString("en-IN")}</div>
            <div className="text-indigo-200 text-sm mt-2">of ₹{(stats.totalAmount ?? 0).toLocaleString("en-IN")} billed</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1"><TrendingUp size={13}/> Collection Rate</div>
            <div className="text-3xl font-bold text-indigo-600">{collectionRate}%</div>
            <div className="mt-3 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${collectionRate}%` }}/>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1"><Users size={13}/> Outstanding</div>
            <div className="text-3xl font-bold text-red-500">₹{((stats.totalAmount ?? 0) - (stats.collectedAmount ?? 0)).toLocaleString("en-IN")}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{stats.overdue + stats.pending} unpaid records</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white">
                {[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white">
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search student…"
                  className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white w-40"/>
              </div>
            </div>
            {pendingCount > 0 && (
              <button onClick={() => sendRemindersMutation.mutate()}
                disabled={sendRemindersMutation.isPending}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0">
                <Bell size={14}/> Remind All Unpaid ({pendingCount})
              </button>
            )}
          </div>
          {reminderMsg && <div className="mt-2 text-sm text-green-600 dark:text-green-400 font-medium">{reminderMsg}</div>}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <IndianRupee size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-3"/>
            <p className="text-gray-500 dark:text-gray-400">
              {payments.length === 0 ? "No payment records yet. Generate monthly fees to start tracking." : "No matching records for this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400 text-xs uppercase">
                  <th className="px-5 py-3 text-left font-semibold">Student</th>
                  <th className="px-5 py-3 text-left font-semibold">Period</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3 text-left font-semibold">Due Date</th>
                  <th className="px-5 py-3 text-left font-semibold">Status</th>
                  <th className="px-5 py-3 text-left font-semibold">Paid On</th>
                  <th className="px-5 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {filtered.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{p.fullName ?? "—"}</div>
                      <div className="text-xs text-gray-400">@{p.username ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{MONTHS[p.month - 1]} {p.year}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">₹{parseFloat(p.amount).toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-xs">{new Date(p.dueDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}</td>
                    <td className="px-5 py-3"><StatusBadge status={p.status}/></td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {p.status !== "paid" && (
                          <button onClick={() => markPaidMutation.mutate(p.id)}
                            className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 rounded text-xs font-medium hover:bg-green-200 transition-colors">
                            Mark Paid
                          </button>
                        )}
                        {p.status === "pending" && (
                          <button onClick={() => markOverdueMutation.mutate(p.id)}
                            className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded text-xs font-medium hover:bg-red-200 transition-colors">
                            Overdue
                          </button>
                        )}
                        {p.status === "paid" && <span className="text-xs text-gray-400">✓ Done</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Generate Monthly Fees</h3>
              <button onClick={() => { setShowGenModal(false); setGenMsg(""); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Month</label>
                  <select value={genMonth} onChange={e => setGenMonth(Number(e.target.value))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Year</label>
                  <select value={genYear} onChange={e => setGenYear(Number(e.target.value))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white">
                    {[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fee Amount (₹)</label>
                <input type="number" value={genAmount} onChange={e => setGenAmount(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="5000"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Due on (day of month)</label>
                <input type="number" min={1} max={28} value={genDueDay} onChange={e => setGenDueDay(Number(e.target.value))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white"/>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                This will create payment records for all students and send them a push notification about the fee due.
              </p>
              {genMsg && <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg px-3 py-2 text-sm">{genMsg}</div>}
              <div className="pt-2 flex gap-2">
                <button onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending || !genAmount}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {generateMutation.isPending ? "Generating…" : "Generate & Notify All Students"}
                </button>
                <button onClick={() => { setShowGenModal(false); setGenMsg(""); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
