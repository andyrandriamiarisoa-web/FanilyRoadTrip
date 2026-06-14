/**
 * Durcissement du solveur (S7) — **pur TypeScript**, déployable (aucune
 * dépendance native).
 *
 * Pourquoi pas Google OR-Tools directement : OR-Tools se distribue en binaires
 * natifs (pas de paquet npm maintenu) — il ne se construit ni ne s'exécute sur
 * l'hébergement serverless ni en CI, ce qui casserait le contrat « build vert ».
 * On délivre donc les deux objectifs de S7 en TS pur, déterministe et testé :
 *
 *   1. **Sélection optimale** (multi-objectif) — un sac à dos 0/1 exact
 *      (`knapsack`) maximise la valeur (poids d'ambiance) sous un budget de
 *      temps de visite. Les personnes sont des **ancres souples** toujours
 *      retenues (S5), retranchées du budget.
 *   2. **Alignement exact de l'ancre** — `layoutAligned` épingle l'ancre sur sa
 *      **date réelle** (calendrier d'abord) plutôt que de la laisser tomber où
 *      le glouton arrive (imprécision du V1).
 *
 * Le solveur heuristique V1 (`solver.ts`) reste disponible (repli / tests).
 */

import type {
  Anchor, Opportunity, VacationWindow, HouseholdConstraints,
  TripCandidate, PlannedDay, PlannedStop, LatLng, Ambiance,
} from "./types";
import type { SynthesisAdapters } from "./adapters";
import { curateSlot } from "./curation";

// ── Sac à dos 0/1 exact (programmation dynamique) ───────────────────────────

export interface KnapsackItem<T> {
  /** Valeur à maximiser (entier ≥ 0 recommandé). */
  value: number;
  /** Coût entier (minutes) consommé sur le budget. */
  cost: number;
  ref: T;
}

/**
 * Résout le sac à dos 0/1 de façon **exacte** (DP). Renvoie le sous-ensemble de
 * valeur maximale dont le coût total ≤ budget. Déterministe (ordre d'entrée
 * conservé pour départager).
 */
export function knapsack<T>(items: KnapsackItem<T>[], budget: number): T[] {
  const B = Math.max(0, Math.floor(budget));
  const n = items.length;
  // dp[i][b] = valeur max en considérant les i premiers objets, budget b.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(B + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const { value, cost } = items[i - 1];
    const ci = Math.max(0, Math.floor(cost));
    for (let b = 0; b <= B; b++) {
      dp[i][b] = dp[i - 1][b];
      if (ci <= b) {
        const take = dp[i - 1][b - ci] + value;
        if (take > dp[i][b]) dp[i][b] = take;
      }
    }
  }
  // Reconstruction.
  const chosen: T[] = [];
  let b = B;
  for (let i = n; i >= 1; i--) {
    if (dp[i][b] !== dp[i - 1][b]) {
      chosen.push(items[i - 1].ref);
      b -= Math.max(0, Math.floor(items[i - 1].cost));
    }
  }
  return chosen.reverse();
}

// ── Sélection optimale par ambiance ─────────────────────────────────────────

export interface SelectionInput {
  pool: Opportunity[];
  people: Opportunity[];
  weightOf: (o: Opportunity) => number;
  /** Budget total de temps de visite (minutes). */
  budgetMin: number;
}

/**
 * Sélection optimale : personnes forcées (ancres souples), puis sac à dos sur
 * le reste sous le budget restant. La valeur est le poids d'ambiance (mis à
 * l'échelle en entier) ; le coût est la durée de visite.
 */
export function selectOptimal(input: SelectionInput): Opportunity[] {
  const forced = input.people;
  const forcedCost = forced.reduce((s, o) => s + o.durationMin, 0);
  const remainingBudget = Math.max(0, input.budgetMin - forcedCost);

  const items: KnapsackItem<Opportunity>[] = input.pool.map((o) => ({
    // Valeur entière ≥ 0 (les poids d'ambiance sont positifs ici).
    value: Math.max(0, Math.round(input.weightOf(o) * 100)),
    cost: o.durationMin,
    ref: o,
  }));
  const picked = knapsack(items, remainingBudget);
  return [...forced, ...picked];
}

// ── Layout aligné sur la date d'ancre (calendrier d'abord) ──────────────────

const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 20 * 60;

function projection(p: LatLng, a: LatLng, b: LatLng): number {
  const ax = b.lng - a.lng, ay = b.lat - a.lat;
  const px = p.lng - a.lng, py = p.lat - a.lat;
  const denom = ax * ax + ay * ay || 1;
  return Math.max(0, Math.min(1, (px * ax + py * ay) / denom));
}
function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return toISODate(d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}
function isoDateTime(dateISO: string, minutes: number): string {
  const d = new Date(dateISO + "T00:00:00Z"); d.setUTCMinutes(minutes); return d.toISOString();
}
function weekday(dateISO: string): number {
  const day = new Date(dateISO + "T00:00:00Z").getUTCDay(); return day === 0 ? 7 : day;
}
function parseHM(hm: string): number { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

/** Répartit un tableau ordonné en `groups` tranches contiguës aussi égales que possible. */
function splitContiguous<T>(arr: T[], groups: number): T[][] {
  const res: T[][] = [];
  let idx = 0;
  for (let g = 0; g < groups; g++) {
    const count = Math.round((arr.length - idx) / (groups - g));
    res.push(arr.slice(idx, idx + count));
    idx += count;
  }
  return res;
}

function curatedFor(slot: "baby-pause" | "canicule", near: LatLng, pool?: Opportunity[]): PlannedStop["curated"] {
  if (!pool || pool.length === 0) return undefined;
  return curateSlot(slot, near, pool).slice(0, 3)
    .map((o) => ({ id: o.id, title: o.title, source: o.source, sourceStatus: o.sourceStatus }));
}

export interface AlignedLayoutParams {
  anchor: Anchor;
  selected: Opportunity[];
  window: VacationWindow;
  constraints: HouseholdConstraints;
  ambiance: Ambiance;
  label: string;
  pool?: Opportunity[];
}

/**
 * Layout **calendrier d'abord** : l'ancre est posée exactement sur sa date.
 * Les opportunités retenues sont réparties sur les jours aller (avant l'ancre)
 * et retour (après), puis simulées heure par heure (pauses bébé, blocage
 * canicule sous alerte seulement, peu de route les jours travaillés).
 */
export async function layoutAligned(p: AlignedLayoutParams, adapters: SynthesisAdapters): Promise<TripCandidate> {
  const { anchor, selected, window: win, constraints: c } = p;
  const conflicts: string[] = [];
  const anchorLoc = anchor.location;
  const anchorDate = anchor.start.slice(0, 10);

  // Côté corridor : aller (origine→ancre) vs retour (ancre→origine).
  const out = selected
    .filter((o) => projection(o.location, win.origin, anchorLoc) < 0.95)
    .sort((a, b) => projection(a.location, win.origin, anchorLoc) - projection(b.location, win.origin, anchorLoc));
  const back = selected
    .filter((o) => !out.includes(o))
    .sort((a, b) => projection(a.location, anchorLoc, win.origin) - projection(b.location, anchorLoc, win.origin));

  // Dates : on épingle l'ancre, puis on étale aller/retour dans la fenêtre.
  const nights = Math.min(Math.max(win.minNights, 14), win.maxNights);
  let outboundDays = Math.max(1, Math.min(nights - 1, Math.round(nights * 0.5)));
  let startDate = addDays(anchorDate, -outboundDays);
  if (startDate < win.earliestStart) {
    startDate = win.earliestStart;
    outboundDays = Math.max(1, daysBetween(startDate, anchorDate));
    conflicts.push("Date de départ ajustée au plus tôt autorisé.");
  }
  let returnDays = Math.max(1, nights - outboundDays);
  let endDate = addDays(anchorDate, returnDays);
  if (endDate > win.latestEnd) {
    endDate = win.latestEnd;
    returnDays = Math.max(0, daysBetween(anchorDate, endDate));
    conflicts.push("Date de retour ajustée au plus tard autorisé.");
  }

  // On ne fait rouler le foyer **que les jours non travaillés** (Andy télétravaille
  // les jours ouvrés → pas de longue route). Les opportunités du corridor sont donc
  // réparties sur les jours non travaillés de chaque phase.
  const outboundDates: string[] = [];
  for (let d = 0; d < outboundDays; d++) outboundDates.push(addDays(startDate, d));
  const returnDates: string[] = [];
  for (let d = 1; d <= returnDays; d++) returnDates.push(addDays(anchorDate, d));

  const isFree = (date: string) => !c.workDays.includes(weekday(date));
  const drivingOut = outboundDates.filter(isFree);
  const drivingReturn = returnDates.filter(isFree);
  const outDays = drivingOut.length > 0 ? drivingOut : outboundDates;
  const returnDriveDays = drivingReturn.length > 0 ? drivingReturn : returnDates;

  const assign = new Map<string, Opportunity[]>();
  if (outDays.length > 0) {
    splitContiguous(out, outDays.length).forEach((grp, i) => assign.set(outDays[i], grp));
  }
  const unplacedBack: Opportunity[] = [];
  if (returnDriveDays.length > 0) {
    splitContiguous(back, returnDriveDays.length).forEach((grp, i) => assign.set(returnDriveDays[i], grp));
  } else {
    unplacedBack.push(...back);
  }

  const days: PlannedDay[] = [];
  const includedOpportunityIds: string[] = [];
  let caniculeExposureDays = 0;
  let curLoc: LatLng = win.origin;
  let driveSinceBreak = 0;
  let anchorPlaced = false;

  const totalDays = daysBetween(startDate, endDate);
  for (let dayNo = 0; dayNo <= totalDays; dayNo++) {
    const date = addDays(startDate, dayNo);
    const isWorkday = c.workDays.includes(weekday(date));
    const heat = await adapters.canicule.isHeatAlert(curLoc, date);
    if (heat) caniculeExposureDays++;

    // Cibles du jour (uniquement les jours de route, jamais les jours travaillés).
    const isAnchorDay = date === anchorDate;
    const targets: Opportunity[] = assign.get(date) ?? [];

    const stops: PlannedStop[] = [];
    let clock = DAY_START_MIN;
    let dayDrive = 0;

    if (isWorkday) {
      stops.push({
        title: "Télétravail (Andy) — coworking à proximité",
        kind: "work",
        start: isoDateTime(date, parseHM(c.workStart)),
        end: isoDateTime(date, parseHM(c.workEnd)),
        location: curLoc,
        note: "Piste famille (coworking + visites) fournie par la couche curation (S4).",
        curated: curatedFor("canicule", curLoc, p.pool),
      });
      clock = parseHM(c.workEnd);
    }

    // Aller vers les cibles du jour (opportunités, puis l'ancre le jour J).
    const ordered: { loc: LatLng; opp?: Opportunity; isAnchor?: boolean }[] = [
      ...targets.map((o) => ({ loc: o.location, opp: o })),
      ...(isAnchorDay ? [{ loc: anchorLoc, isAnchor: true }] : []),
    ];

    for (const node of ordered) {
      const est = await adapters.travel.estimate(curLoc, node.loc, isoDateTime(date, clock));

      // Blocage canicule 12h–16h (jours d'alerte uniquement).
      const blockStart = parseHM(c.caniculeNoDrive.start);
      const blockEnd = parseHM(c.caniculeNoDrive.end);
      if (est.minutes > 1 && heat && clock < blockEnd && clock + est.minutes > blockStart) {
        stops.push({
          title: "Conduite déconseillée (alerte canicule)",
          kind: "canicule-block",
          start: isoDateTime(date, Math.max(clock, blockStart)),
          end: isoDateTime(date, blockEnd),
          note: "Fenêtre 12h–16h évitée — alerte chaleur sur le segment.",
          curated: curatedFor("canicule", curLoc, p.pool),
        });
        clock = Math.max(clock, blockEnd);
      }

      // Conduite + pauses bébé.
      let remaining = est.minutes;
      while (driveSinceBreak + remaining > c.babyPauseEveryMin) {
        const before = c.babyPauseEveryMin - driveSinceBreak;
        clock += before; dayDrive += before; remaining -= before;
        stops.push({
          title: "Pause bébé", kind: "baby-pause",
          start: isoDateTime(date, clock), end: isoDateTime(date, clock + c.babyPauseDurationMin),
          location: curLoc, curated: curatedFor("baby-pause", curLoc, p.pool),
        });
        clock += c.babyPauseDurationMin; driveSinceBreak = 0;
      }
      if (est.minutes > 0) {
        const driveStart = clock;
        clock += remaining; dayDrive += remaining; driveSinceBreak += remaining;
        stops.push({
          title: node.isAnchor ? anchor.title : (node.opp ? `Trajet vers ${node.opp.title}` : "Trajet"),
          kind: "drive",
          start: isoDateTime(date, driveStart), end: isoDateTime(date, clock),
          location: node.loc,
          note: est.chargeStops > 0 ? `${est.chargeStops} arrêt(s) Superchargeur inclus` : undefined,
          sourceStatus: est.sourceStatus,
        });
      }
      curLoc = node.loc;

      if (node.isAnchor) {
        stops.push({
          title: anchor.title, kind: "anchor",
          start: anchor.start, end: anchor.end, location: anchor.location,
          source: anchor.source, sourceStatus: anchor.sourceStatus,
        });
        anchorPlaced = true;
      } else if (node.opp) {
        const o = node.opp;
        const isPerson = o.category === "people";
        if (isPerson || clock + o.durationMin <= DAY_END_MIN) {
          stops.push({
            opportunityId: o.id, title: o.title, kind: "visit",
            start: isoDateTime(date, clock), end: isoDateTime(date, clock + o.durationMin),
            location: o.location, source: o.source, sourceStatus: o.sourceStatus,
            note: heat && o.indoor === false ? "Extérieur — prudence chaleur" : undefined,
          });
          clock += o.durationMin;
          includedOpportunityIds.push(o.id);
        }
      }
    }

    const nextDayWork = c.workDays.includes(weekday(addDays(date, 1)));
    stops.push({
      title: (isWorkday || nextDayWork) ? "Nuit (hébergement workation-ready)" : "Nuit (matelas ferme + clim)",
      kind: "night",
      start: isoDateTime(date, Math.max(clock, DAY_END_MIN)),
      end: isoDateTime(addDays(date, 1), DAY_START_MIN),
      location: curLoc,
    });

    days.push({ date, isWorkday, stops, driveMinutes: dayDrive });
  }

  if (!anchorPlaced) conflicts.push("L'ancre n'a pas pu être posée à sa date — élargis la fenêtre.");
  if (unplacedBack.length > 0) conflicts.push("Fenêtre trop courte pour le retour : étapes du retour non placées.");

  return {
    ambiance: p.ambiance, label: p.label, startDate, endDate, days,
    includedOpportunityIds,
    totalDriveMinutes: days.reduce((s, d) => s + d.driveMinutes, 0),
    score: 0, conflicts, caniculeExposureDays,
  };
}
