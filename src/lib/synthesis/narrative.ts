import type { TripCandidate, LatLng } from "./types";
import { FRENCH_CITIES } from "@/data/cities";

export interface NarrativeOptions { familyNames?: string[]; }

/** Ville connue la plus proche d'une coordonnée — pour nommer étapes et nuits
 *  (les nuits/trajets portent une coordonnée mais pas toujours un nom de ville). */
function cityOf(loc?: LatLng): string | null {
  if (!loc) return null;
  let best: { name: string; d2: number } | null = null;
  for (const c of FRENCH_CITIES) {
    const d2 = (c.lat - loc.lat) ** 2 + (c.lng - loc.lng) ** 2;
    if (!best || d2 < best.d2) best = { name: c.name, d2 };
  }
  return best?.name ?? null;
}

/** Minutes → durée lisible : 151 → "2 h 31", 45 → "45 min", 120 → "2 h". */
function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Vue par jour enrichie de villes + temps de route — partagée gabarit & IA, pour
 *  qu'on sache **de quoi on parle** en comparant les propositions. */
function enrichDays(c: TripCandidate) {
  return c.days.map((day, i) => ({
    jour: i + 1,
    date: day.date,
    teletravail: day.isWorkday,
    minutesDeRoute: day.driveMinutes,
    tempsDeRoute: day.driveMinutes > 0 ? hm(day.driveMinutes) : null,
    etapes: [...day.stops].sort((a, b) => a.start.localeCompare(b.start)).map((s) => ({
      heure: s.start.slice(11, 16),
      type: s.kind,
      titre: s.title,
      // Ville résolue pour les trajets et les nuits (sinon déjà dans le titre).
      ville: s.kind === "drive" || s.kind === "night" ? cityOf(s.location) : null,
    })),
  }));
}

/** Construit le prompt pour le client Claude existant (src/lib/agents).
 *  Règle absolue : habiller, ne rien inventer de vérifiable. Les **villes** et
 *  **temps de route** sont fournis (champs `ville`, `tempsDeRoute`) → l'IA peut
 *  les citer sans les inventer. */
export function buildNarrativePrompt(c: TripCandidate, opts?: NarrativeOptions): { system: string; user: string } {
  const system = [
    "Tu es le narrateur de voyage d'Odyssée. On te fournit un itinéraire DÉJÀ CALCULÉ ET VÉRIFIÉ.",
    "Règles absolues : n'invente AUCUN fait vérifiable (durée, horaire, distance, prix, nom de lieu non fourni).",
    "Les villes d'étape (champ `ville`) et les temps de route (`tempsDeRoute`, `minutesDeRoute`) te sont DONNÉS :",
    "cite-les pour que le lecteur sache par où il passe et combien de temps il roule — n'en invente pas d'autres.",
    "Habille, jour par jour, uniquement ce qui t'est donné, en français, ton chaleureux et vivant.",
    "Si une information manque, reste évasif plutôt que d'inventer.",
  ].join(" ");
  const user = JSON.stringify(
    {
      familyNames: opts?.familyNames ?? [],
      titre: c.label,
      du: c.startDate,
      au: c.endDate,
      tempsDeRouteTotal: hm(c.totalDriveMinutes),
      jours: enrichDays(c),
    },
    null,
    2,
  );
  return { system, user };
}

/** Repli déterministe et gratuit (aucune clé) : récit gabarit à partir du JSON
 *  validé. Affiche **les villes d'étape et les temps de parcours** pour comparer
 *  les propositions. */
export function templateNarrative(c: TripCandidate): string {
  const lines: string[] = [
    `# ${c.label} — du ${c.startDate} au ${c.endDate}`,
    "",
    `**${c.days.length} jour${c.days.length > 1 ? "s" : ""} · ${hm(c.totalDriveMinutes)} de route au total**`,
    "",
  ];
  c.days.forEach((day, i) => {
    const driveHeader = day.driveMinutes > 0 ? ` · 🚗 ${hm(day.driveMinutes)} de route` : "";
    lines.push(`## Jour ${i + 1} — ${day.date}${day.isWorkday ? " (télétravail)" : ""}${driveHeader}`);
    // Chronologique : un trajet (09:00) avec pauses internes (11:00…) doit
    // s'afficher dans l'ordre des heures, pas dans l'ordre d'émission des stops.
    for (const s of [...day.stops].sort((a, b) => a.start.localeCompare(b.start))) {
      const t = s.start.slice(11, 16);
      if (s.kind === "visit") lines.push(`- ${t} — ${s.title}${s.source ? ` _(source : ${s.source})_` : ""}`);
      else if (s.kind === "anchor") lines.push(`- ${t} — ⭐ ${s.title}`);
      else if (s.kind === "drive") {
        const city = cityOf(s.location);
        lines.push(`- ${t} — 🚗 Route vers ${city ?? "l'étape suivante"}`);
      }
      else if (s.kind === "baby-pause") lines.push(`- ${t} — pause bébé`);
      else if (s.kind === "canicule-block") lines.push(`- ${t} — pause chaleur (conduite évitée 12h–16h)`);
      else if (s.kind === "work") lines.push(`- ${t} — ${s.title}`);
      else if (s.kind === "night") {
        const city = cityOf(s.location);
        lines.push(`- 🌙 ${s.title}${city ? ` — **${city}**` : ""}`);
      }
    }
    lines.push("");
  });
  if (c.conflicts.length) lines.push("> ⚠️ " + c.conflicts.join(" "));
  return lines.join("\n");
}
