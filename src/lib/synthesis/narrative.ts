import type { TripCandidate } from "./types";

export interface NarrativeOptions { familyNames?: string[]; }

/** Construit le prompt pour le client Claude existant (src/lib/agents).
 *  Règle absolue : habiller, ne rien inventer de vérifiable. */
export function buildNarrativePrompt(c: TripCandidate, opts?: NarrativeOptions): { system: string; user: string } {
  const system = [
    "Tu es le narrateur de voyage d'Odyssée. On te fournit un itinéraire DÉJÀ CALCULÉ ET VÉRIFIÉ.",
    "Règles absolues : n'invente AUCUN fait vérifiable (durée, horaire, distance, prix, nom de lieu non fourni).",
    "Habille, jour par jour, uniquement ce qui t'est donné, en français, ton chaleureux et vivant.",
    "Si une information manque, reste évasif plutôt que d'inventer.",
  ].join(" ");
  return { system, user: JSON.stringify({ familyNames: opts?.familyNames ?? [], itineraire: c }, null, 2) };
}

/** Repli déterministe et gratuit (aucune clé) : récit gabarit à partir du JSON validé. */
export function templateNarrative(c: TripCandidate): string {
  const lines: string[] = [`# ${c.label} — du ${c.startDate} au ${c.endDate}`, ""];
  c.days.forEach((day, i) => {
    lines.push(`## Jour ${i + 1} — ${day.date}${day.isWorkday ? " (télétravail)" : ""}`);
    for (const s of day.stops) {
      const t = s.start.slice(11, 16);
      if (s.kind === "visit") lines.push(`- ${t} — ${s.title}${s.source ? ` _(source : ${s.source})_` : ""}`);
      else if (s.kind === "anchor") lines.push(`- ${t} — ⭐ ${s.title}`);
      else if (s.kind === "baby-pause") lines.push(`- ${t} — pause bébé`);
      else if (s.kind === "canicule-block") lines.push(`- ${t} — pause chaleur (conduite évitée 12h–16h)`);
      else if (s.kind === "work") lines.push(`- ${t} — ${s.title}`);
      else if (s.kind === "night") lines.push(`- ${s.title}`);
    }
    lines.push("");
  });
  if (c.conflicts.length) lines.push("> ⚠️ " + c.conflicts.join(" "));
  return lines.join("\n");
}
