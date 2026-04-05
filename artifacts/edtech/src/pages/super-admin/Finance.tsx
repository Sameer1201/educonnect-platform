import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Plus, Trash2, DollarSign, BarChart3, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface FinanceRecord {
  id: number;
  type: "income" | "expense";
  category: string;
  amount: string;
  description: string | null;
  recordDate: string;
  createdByName: string;
  createdAt: string;
}

async function fetchRecords(): Promise<FinanceRecord[]> {
  const r = await fetch(`${BASE}/api/finance`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch finance records");
  return r.json();
}

async function createRecord(data: {
  type: string; category: string; amount: string; description?: string; recordDate?: string;
}): Promise<FinanceRecord> {
  const r = await fetch(`${BASE}/api/finance`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to create record");
  }
  return r.json();
}

async function deleteRecord(id: number) {
  const r = await fetch(`${BASE}/api/finance/${id}`, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error("Failed to delete record");
}

const INCOME_CATEGORIES = ["Tuition Fees", "Course Fees", "Certification", "Sponsorship", "Grants", "Other Income"];
const EXPENSE_CATEGORIES = ["Salaries", "Infrastructure", "Software & Tools", "Marketing", "Events", "Utilities", "Other Expense"];

function StatCard({ title, value, sub, icon, color }: { title: string; value: string; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(val: string | number) {
  const n = parseFloat(String(val));
  return isNaN(n) ? "₹0.00" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function Finance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: records = [], isLoading } = useQuery({ queryKey: ["finance"], queryFn: fetchRecords });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "income" as "income" | "expense",
    category: "",
    amount: "",
    description: "",
    recordDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: createRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast({ title: "Record added successfully" });
      setOpen(false);
      setForm({ type: "income", category: "", amount: "", description: "", recordDate: new Date().toISOString().slice(0, 10) });
      setError("");
    },
    onError: (err: any) => setError(err.message ?? "Failed to add record"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast({ title: "Record deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const totalIncome = records.filter((r) => r.type === "income").reduce((s, r) => s + parseFloat(r.amount), 0);
  const totalExpense = records.filter((r) => r.type === "expense").reduce((s, r) => s + parseFloat(r.amount), 0);
  const netBalance = totalIncome - totalExpense;

  const categories = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = () => {
    setError("");
    if (!form.category || !form.amount) { setError("Category and amount are required"); return; }
    if (isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) { setError("Enter a valid positive amount"); return; }
    createMutation.mutate({
      type: form.type,
      category: form.category,
      amount: form.amount,
      description: form.description || undefined,
      recordDate: form.recordDate || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign size={22} className="text-primary" />
            Finance Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track income and expenses for the platform</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-record">
              <Plus size={16} className="mr-2" />
              Add Record
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Finance Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: "income", category: "" }))}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors flex items-center gap-2 justify-center ${
                    form.type === "income" ? "border-green-500 bg-green-50 text-green-700" : "border-border hover:border-green-300"
                  }`}
                  data-testid="type-income"
                >
                  <TrendingUp size={16} /> Income
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: "expense", category: "" }))}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors flex items-center gap-2 justify-center ${
                    form.type === "expense" ? "border-red-500 bg-red-50 text-red-700" : "border-border hover:border-red-300"
                  }`}
                  data-testid="type-expense"
                >
                  <TrendingDown size={16} /> Expense
                </button>
              </div>

              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  data-testid="input-amount"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.recordDate}
                  onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))}
                  data-testid="input-date"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea
                  placeholder="Additional details..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  data-testid="input-description"
                />
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-record">
                {createMutation.isPending ? "Saving..." : "Save Record"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Income"
          value={formatCurrency(totalIncome)}
          sub={`${records.filter((r) => r.type === "income").length} records`}
          icon={<TrendingUp size={20} className="text-green-600" />}
          color="bg-green-50"
        />
        <StatCard
          title="Total Expenses"
          value={formatCurrency(totalExpense)}
          sub={`${records.filter((r) => r.type === "expense").length} records`}
          icon={<TrendingDown size={20} className="text-red-600" />}
          color="bg-red-50"
        />
        <StatCard
          title="Net Balance"
          value={formatCurrency(Math.abs(netBalance))}
          sub={netBalance >= 0 ? "Surplus" : "Deficit"}
          icon={<BarChart3 size={20} className={netBalance >= 0 ? "text-blue-600" : "text-orange-600"} />}
          color={netBalance >= 0 ? "bg-blue-50" : "bg-orange-50"}
        />
      </div>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar size={16} className="text-primary" />
            Transaction History ({records.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-10">
              <DollarSign size={36} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No finance records yet. Add your first record above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Category</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Description</th>
                    <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Amount</th>
                    <th className="text-center py-2 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`record-${record.id}`}>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">
                        {format(new Date(record.recordDate), "dd MMM yyyy")}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={record.type === "income" ? "default" : "destructive"}
                          className={`flex items-center gap-1 w-fit ${record.type === "income" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}`}
                        >
                          {record.type === "income" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {record.type}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-medium">{record.category}</td>
                      <td className="py-3 pr-4 text-muted-foreground max-w-[200px] truncate">
                        {record.description ?? <span className="italic text-xs">—</span>}
                      </td>
                      <td className={`py-3 pr-4 text-right font-semibold ${record.type === "income" ? "text-green-600" : "text-red-600"}`}>
                        {record.type === "income" ? "+" : "-"}{formatCurrency(record.amount)}
                      </td>
                      <td className="py-3 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm("Delete this record?")) deleteMutation.mutate(record.id); }}
                          data-testid={`button-delete-record-${record.id}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
