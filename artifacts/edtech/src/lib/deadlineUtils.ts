import { formatDistanceToNow } from "date-fns";

export type DeadlineUrgency = "overdue" | "critical" | "warning" | "ok";

export function getDeadlineUrgency(deadline: string | null | undefined): DeadlineUrgency | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "overdue";
  if (ms <= 60 * 60 * 1000) return "critical";      // < 1 hour
  if (ms <= 24 * 60 * 60 * 1000) return "warning";   // < 24 hours
  return "ok";
}

export function deadlineLabel(deadline: string): string {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return `Overdue by ${formatDistanceToNow(new Date(deadline))}`;
  return `Due ${formatDistanceToNow(new Date(deadline), { addSuffix: true })}`;
}

export function deadlineBadgeClass(urgency: DeadlineUrgency): string {
  if (urgency === "overdue") return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700";
  if (urgency === "critical") return "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700";
  if (urgency === "warning") return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700";
  return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700";
}
