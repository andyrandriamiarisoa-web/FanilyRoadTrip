#!/usr/bin/env node
// WCAG AA contrast audit — checks theme color pairs

const PAIRS = [
  // [foreground, background, label]
  ["#f1f5f9", "#0f172a", "text-primary on bg-base (dark)"],
  ["#94a3b8", "#0f172a", "text-secondary on bg-base (dark)"],
  ["#f1f5f9", "#1e293b", "text-primary on bg-card (dark)"],
  ["#94a3b8", "#1e293b", "text-secondary on bg-card (dark)"],
  ["#1e293b", "#faf8f3", "text-on-card-warm on bg-card-warm"],
  ["#546070", "#faf8f3", "text-muted on bg-card-warm"],
  ["#1a1200", "#f59e0b", "text-on-amber on accent-amber"],
  ["#ffffff", "#7c3aed", "work-block label on accent-vine (timeline)"],
  ["#93c5fd", "#1e3a5f", "badge-seed-text on badge-seed-bg"],
  ["#fde68a", "#3b2f00", "badge-estimated-text on badge-estimated-bg"],
  ["#6ee7b7", "#064e3b", "badge-verified-text on badge-verified-bg"],
  // Light theme
  ["#0f172a", "#f8fafc", "text-primary on bg-base (light)"],
  ["#475569", "#ffffff", "text-secondary on bg-card (light)"],
  ["#64748b", "#ffffff", "text-muted on bg-card (light)"],
  ["#1e40af", "#dbeafe", "badge-seed-text on badge-seed-bg (light)"],
  ["#92400e", "#fef3c7", "badge-estimated-text on badge-estimated-bg (light)"],
  ["#065f46", "#d1fae5", "badge-verified-text on badge-verified-bg (light)"],
];

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function relativeLuminance({ r, g, b }) {
  const linearize = (c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return (
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  );
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(hexToRgb(fg));
  const L2 = relativeLuminance(hexToRgb(bg));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

let passed = 0;
let failed = 0;
const MIN_RATIO = 4.5;

console.log("\n=== Audit de contraste WCAG AA (seuil: 4,5:1) ===\n");

for (const [fg, bg, label] of PAIRS) {
  const ratio = contrastRatio(fg, bg);
  const ok = ratio >= MIN_RATIO;
  const status = ok ? "✅" : "❌";
  const ratioStr = ratio.toFixed(2);
  console.log(`${status} ${ratioStr.padStart(5)}:1  ${label}`);
  if (ok) passed++;
  else {
    failed++;
    console.log(`        fg: ${fg}  bg: ${bg}  requis: ${MIN_RATIO}:1`);
  }
}

console.log(`\nRésultat: ${passed} paires conformes, ${failed} paires en échec\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("Tous les contrastes sont conformes WCAG AA ✅\n");
}
