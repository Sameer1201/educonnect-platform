import { Link } from "wouter";
import { AlertTriangle, Clock, XCircle, ArrowRight, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AlertTicket } from "@/hooks/useDeadlineAlerts";
import { format, formatDistanceToNow } from "date-fns";

function urgencyConfig(urgency: AlertTicket["urgency"]) {
  if (urgency === "overdue") return {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-300 dark:border-red-700",
    icon: <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />,
    label: "OVERDUE",
    labelClass: "bg-red-500 text-white",
    timeClass: "text-red-600 dark:text-red-400",
  };
  if (urgency === "critical") return {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-300 dark:border-orange-700",
    icon: <AlertTriangle size={15} className="text-orange-500 shrink-0 mt-0.5" />,
    label: "CRITICAL",
    labelClass: "bg-orange-500 text-white",
    timeClass: "text-orange-600 dark:text-orange-400",
  };
  return {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-300 dark:border-amber-700",
    icon: <Clock size={15} className="text-amber-500 shrink-0 mt-0.5" />,
    label: "DUE SOON",
    labelClass: "bg-amber-500 text-white",
    timeClass: "text-amber-600 dark:text-amber-400",
  };
}

interface Props {
  open: boolean;
  alerts: AlertTicket[];
  onDismiss: () => void;
  supportHref: string;
}

export default function DeadlineAlertPopup({ open, alerts, onDismiss, supportHref }: Props) {
  const worstFirst = [...alerts].sort((a, b) => {
    const order = { overdue: 0, critical: 1, warning: 2 };
    return order[a.urgency] - order[b.urgency];
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <Bell size={14} className="text-red-600 dark:text-red-400" />
            </div>
            Deadline Alert
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {alerts.length} ticket{alerts.length > 1 ? "s" : ""} need attention
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 mt-1 max-h-72 overflow-y-auto pr-1">
          {worstFirst.map((a) => {
            const cfg = urgencyConfig(a.urgency);
            return (
              <div
                key={a.id}
                className={`flex items-start gap-2.5 p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}
              >
                {cfg.icon}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-xs font-semibold truncate">{a.subject}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${cfg.labelClass}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className={`text-[11px] font-medium ${cfg.timeClass}`}>
                    {a.urgency === "overdue"
                      ? `Overdue by ${formatDistanceToNow(new Date(a.deadline))}`
                      : `Due ${formatDistanceToNow(new Date(a.deadline), { addSuffix: true })}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Deadline: {format(new Date(a.deadline), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1 h-9 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
          <Link href={supportHref} onClick={onDismiss}>
            <Button className="flex-1 h-9 text-xs gap-1">
              View Tickets <ArrowRight size={13} />
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
