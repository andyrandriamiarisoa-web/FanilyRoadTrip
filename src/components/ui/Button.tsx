import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const sizes: Record<string, string> = {
    sm: "h-9 px-4 text-sm",
    md: "h-11 px-6 text-sm",
    lg: "h-14 px-8 text-base",
  };

  const variants: Record<string, { style: React.CSSProperties; ringColor: string }> = {
    primary: {
      style: {
        background: "var(--accent-amber)",
        color: "var(--text-on-amber)",
      },
      ringColor: "var(--accent-amber)",
    },
    secondary: {
      style: {
        background: "var(--bg-surface)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-default)",
      },
      ringColor: "var(--accent-amber)",
    },
    ghost: {
      style: {
        background: "transparent",
        color: "var(--text-secondary)",
      },
      ringColor: "var(--accent-amber)",
    },
    danger: {
      style: {
        background: "var(--accent-danger)",
        color: "#fff",
      },
      ringColor: "var(--accent-danger)",
    },
  };

  const v = variants[variant] ?? variants.primary;

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${sizes[size] ?? sizes.md} ${className}`}
      style={v.style}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            opacity="0.3"
          />
          <path
            d="M12 2a10 10 0 0110 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
