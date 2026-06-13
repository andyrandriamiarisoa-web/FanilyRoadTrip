"use client";

import { useState } from "react";

function getInitialTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem("odyssee-theme") === "light" ? "light" : "dark";
}

/** Version déployée (SHA + heure de build), formatée en UTC de façon déterministe. */
function buildLabel(): string {
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || "local";
  const iso = process.env.NEXT_PUBLIC_BUILD_TIME || "";
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return `v ${sha}`;
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
  return `v ${sha} · ${stamp}`;
}

export function AppModeBar() {
  const isMock = process.env.NEXT_PUBLIC_APP_MODE !== "live";
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const version = buildLabel();

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("odyssee-theme", next);
    if (next === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }

  return (
    <div
      className="flex items-center justify-between px-4 py-1.5 text-xs font-medium"
      style={{
        background: isMock ? "var(--badge-estimated-bg)" : "var(--badge-verified-bg)",
        color: isMock ? "var(--badge-estimated-text)" : "var(--badge-verified-text)",
        borderBottom: "1px solid var(--border-default)",
        minHeight: "auto",
      }}
    >
      <span className="flex flex-col leading-tight">
        <span>
          Mode {isMock ? "MOCK — données de démonstration" : "LIVE — données réelles"}
        </span>
        <span style={{ fontSize: "0.6875rem" }}>{version}</span>
      </span>

      <button
        onClick={toggleTheme}
        className="text-xs px-2 py-0.5 rounded shrink-0"
        style={{
          background: "rgba(255,255,255,0.15)",
          minHeight: "auto",
          minWidth: "auto",
        }}
        aria-label={`Basculer vers le thème ${theme === "dark" ? "clair" : "sombre"}`}
      >
        {theme === "dark" ? "Thème clair" : "Thème nuit"}
      </button>
    </div>
  );
}
