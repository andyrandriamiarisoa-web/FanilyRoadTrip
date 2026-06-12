import type { SourceStatus } from "@/types";

interface SourceBadgeProps {
  status: SourceStatus;
  className?: string;
}

const LABELS: Record<SourceStatus, string> = {
  seed: "Seed",
  estimated: "Estimé",
  verified: "Vérifié",
};

export function SourceBadge({ status, className = "" }: SourceBadgeProps) {
  return (
    <span className={`badge-${status} ${className}`} aria-label={`Source : ${LABELS[status]}`}>
      {LABELS[status]}
    </span>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "amber" | "vine" | "success" | "danger";
  className?: string;
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const styles: Record<string, { background: string; color: string }> = {
    default: { background: "var(--bg-surface)", color: "var(--text-secondary)" },
    amber: { background: "var(--accent-amber)", color: "var(--text-on-amber)" },
    vine: { background: "var(--accent-vine)", color: "#fff" },
    success: { background: "var(--accent-success)", color: "#fff" },
    danger: { background: "var(--accent-danger)", color: "#fff" },
  };
  const s = styles[variant] ?? styles.default;
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${className}`}
      style={s}
    >
      {children}
    </span>
  );
}
