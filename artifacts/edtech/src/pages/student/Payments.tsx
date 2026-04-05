import { useQuery } from "@tanstack/react-query";
import { CreditCard, CheckCircle, Clock, AlertTriangle, IndianRupee, Calendar, TrendingUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-xs font-semibold"><CheckCircle size={11}/> Paid</span>;
  if (status === "overdue")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold"><AlertTriangle size={11}/> Overdue</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs font-semibold"><Clock size={11}/> Pending</span>;
}

export default function StudentPayments() {
  const { data: payments = [], isLoading } = useQuery<any[]>({
    queryKey: ["student-payments"],
    queryFn: () => fetch(`${BASE}/api/payments`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["student-payment-stats"],
    queryFn: () => fetch(`${BASE}/api/payments/stats`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 30000,
  });

  const paid = payments.filter(p => p.status === "paid").length;
  const pending = payments.filter(p => p.status === "pending").length;
  const overdue = payments.filter(p => p.status === "overdue").length;
  const totalDue = payments.filter(p => p.status !== "paid").reduce((s, p) => s + parseFloat(p.amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CreditCard size={26} className="text-indigo-600"/> My Tuition Payments
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Track your monthly tuition fee status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Paid</div>
          <div className="text-2xl font-bold text-green-600">{paid}</div>
          <div className="text-xs text-gray-400 mt-0.5">months</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pending</div>
          <div className="text-2xl font-bold text-yellow-500">{pending}</div>
          <div className="text-xs text-gray-400 mt-0.5">months</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Overdue</div>
          <div className="text-2xl font-bold text-red-600">{overdue}</div>
          <div className="text-xs text-gray-400 mt-0.5">months</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Amount Due</div>
          <div className="text-2xl font-bold text-indigo-600">₹{totalDue.toLocaleString("en-IN")}</div>
          <div className="text-xs text-gray-400 mt-0.5">outstanding</div>
        </div>
      </div>

      {/* Banner for overdue */}
      {overdue > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <AlertTriangle size={20} className="text-red-500 shrink-0"/>
          <div>
            <div className="font-semibold text-red-700 dark:text-red-300">Payment Overdue!</div>
            <div className="text-sm text-red-600 dark:text-red-400">You have {overdue} overdue payment{overdue > 1 ? "s" : ""}. Please clear your dues immediately to avoid disruption.</div>
          </div>
        </div>
      )}

      {/* Payment List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar size={16}/> Payment History
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center">
            <IndianRupee size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-3"/>
            <p className="text-gray-500 dark:text-gray-400">No payment records yet.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Your school will generate monthly payment records here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                    ${p.status === "paid" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      : p.status === "overdue" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"}`}>
                    {MONTHS[p.month - 1]}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white text-sm">
                      {MONTH_FULL[p.month - 1]} {p.year}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      Due: {new Date(p.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {p.paidAt && ` · Paid: ${new Date(p.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-white text-sm">₹{parseFloat(p.amount).toLocaleString("en-IN")}</div>
                  </div>
                  <StatusBadge status={p.status}/>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={15} className="text-indigo-600"/>
            <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Payment Summary</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Total Paid: </span>
              <span className="font-semibold text-green-600">₹{payments.filter(p=>p.status==="paid").reduce((s:number,p:any)=>s+parseFloat(p.amount),0).toLocaleString("en-IN")}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Pending: </span>
              <span className="font-semibold text-yellow-600">₹{totalDue.toLocaleString("en-IN")}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Total Records: </span>
              <span className="font-semibold text-gray-900 dark:text-white">{payments.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
