import { cn } from "@/lib/cn";

const tones = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  navy: "bg-navy-900 text-gold-300 ring-navy-900",
} as const;

export function Badge({ tone = "gray", className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof tones> = {
  CREATED: "gray",
  ASSIGNED: "blue",
  ACTIVATED: "green",
  REVOKED: "red",
  ACTIVE: "green",
  EXPIRED: "gray",
  SUSPENDED: "amber",
  NOT_ACTIVATED: "gray",
  PENDING_INSTALLATION: "amber",
  PENDING_CONFIRMATION: "amber",
  COMPLETED: "green",
  GENERATING: "blue",
  PENDING: "gray",
  FAILED: "red",
  INVITED: "amber",
  SUBMITTED: "blue",
  UNDER_REVIEW: "amber",
  ADDITIONAL_INFO_REQUIRED: "amber",
  APPROVED: "green",
  REJECTED: "red",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{label ?? status}</Badge>;
}
