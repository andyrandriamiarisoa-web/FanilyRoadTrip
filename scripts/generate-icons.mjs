#!/usr/bin/env node
// Generates SVG-based PWA icons as simple PNG-like files using SVG data URIs
// For production, replace with proper PNG files from a design tool

import { writeFileSync, mkdirSync } from "fs";

const SIZES = [192, 512];
const OUT_DIR = "public/icons";

mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#0f172a"/>
  <text x="${size / 2}" y="${size * 0.65}" font-size="${size * 0.45}" text-anchor="middle" fill="#f59e0b" font-family="system-ui, sans-serif" font-weight="bold">O</text>
  <circle cx="${size * 0.75}" cy="${size * 0.25}" r="${size * 0.08}" fill="#f59e0b" opacity="0.6"/>
</svg>`;

  // Write SVG as the icon (browsers accept SVG for PWA icons in some cases)
  writeFileSync(`${OUT_DIR}/icon-${size}.svg`, svg);
  console.log(`✓ Generated ${OUT_DIR}/icon-${size}.svg`);
}

console.log("\nNote: For production, replace SVG icons with PNG files from a design tool.");
console.log("Use Figma, Inkscape, or similar to export optimized PNG icons.");
