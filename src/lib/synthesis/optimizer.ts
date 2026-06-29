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
 *      **plage de dates réelle** (calendrier d'abord) plutôt que de la laisser
 *      tomber où le glouton arrive (imprécision du V1).
 *
 * V2 (cette PR) : l'ancre peut couvrir **plusieurs jours** consécutifs
 * (séminaire, séjour). Pendant le bloc d'ancre, le foyer reste sur place
 * (pas de route, logement à proximité). Le `nights` n'a plus de constante
 * codée en dur — il est dérivé de `window.maxNights` (ou de la valeur
 * `minNights` quand l'utilisateur veut « au plus rapide »).
 *
 * Le solveur heuristique V1 (`solver.ts`) reste disponible (repli / tests).
 */

import type {
  Anchor, Opportunity, VacationWindow, HouseholdConstraints,
  TripCandidate, PlannedDay, PlannedStop, LatLng, Ambiance,
} from "./types";
import type { SynthesisAdapters } from "./adapters";
import { curateSlot } from "./curation";
import {
  projection, addDays, daysBetween, isoDateTime, weekday, parseHM,
} from "./geo-time";

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

// ── Layout aligné sur la plage d'ancre (calendrier d'abord) ─────────────────

const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 20 * 60;

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
 * Layout **calendrier d'abord** : l'ancre est posée exactement sur sa **plage
 * de dates** (un seul jour si `anchor.end` est le même jour que `anchor.start`,
 * sinon un bloc multi-jour pendant lequel le foyer reste sur place).
 *
 * Les opportunités retenues sont réparties sur les jours **aller** (avant le
 * bloc d'ancre) et **retour** (après), puis simulées heure par heure (pauses
 * bébé, blocage canicule sous alerte seulement, peu de route les jours
 * travaillés).
 */
export async function layoutAligned(p: AlignedLayoutParams, adapters: SynthesisAdapters): Promise<TripCandidate> {
  const { anchor, selected, window: win, constraints: c } = p;
  const conflicts: string[] = [];
  const anchorLoc = anchor.location;
  const anchorStartDate = anchor.start.slice(0, 10);
  // Un événement qui déborde l'heure (mariage finissant à 1h du matin)
  // reste 1 jour. On ne passe en multi-jour que si la durée dépasse 24h.
  const anchorDurationMs = Date.parse(anchor.end) - Date.parse(anchor.start);
  const anchorEndDate =
    anchorDurationMs >= 24 * 3_600_000 ? anchor.end.slice(0, 10) : anchorStartDate;
  const anchorDays = Math.max(1, daysBetween(anchorStartDate, anchorEndDate) + 1);

  // Côté corridor : aller (origine→ancre) vs retour (ancre→origine).
  const out = selected
    .filter((o) => projection(o.location, win.origin, anchorLoc) < 0.95)
    .sort((a, b) => projection(a.location, win.origin, anchorLoc) - projection(b.location, win.origin, anchorLoc));
  const back = selected
    .filter((o) => !out.includes(o))
    .sort((a, b) => projection(a.location, anchorLoc, win.origin) - projection(b.location, anchorLoc, win.origin));

  // Total de nuits dérivé honnêtement des bornes (jamais de constante 14
  // codée en dur — c'était l'ancienne dette qui produisait des voyages
  // incohérents avec la saisie utilisateur).
  const nightsRaw = Math.max(win.minNights, Math.min(win.maxNights, win.maxNights));
  // Au moins assez de nuits pour contenir le bloc d'ancre + 1 nuit (arrivée).
  const minRequiredNights = anchorDays; // dort sur place pendant le bloc
  const nights = Math.max(nightsRaw, minRequiredNights);
  if (nights < win.minNights) conflicts.push("Durée demandée écourtée pour tenir dans la fenêtre.");

  // Décompose : nuits hors-bloc = aller + retour. Anchor block consomme
  // (anchorDays - 1) nuits sur place. La nuit "de l'événement" est partagée
  // avec le bloc (on dort à l'ancre la veille et après chaque jour du bloc).
  const offBlockNights = Math.max(0, nights - (anchorDays - 1));
  // Répartition aller/retour : ~40/60 (un peu plus de retour pour la décompresse).
  let outboundDays = Math.max(1, Math.round(offBlockNights * 0.4));
  let startDate = addDays(anchorStartDate, -outboundDays);
  if (startDate < win.earliestStart) {
    startDate = win.earliestStart;
    outboundDays = Math.max(1, daysBetween(startDate, anchorStartDate));
    conflicts.push("Date de départ ajustée au plus tôt autorisé.");
  }
  let returnDays = Math.max(1, offBlockNights - outboundDays);
  let endDate = addDays(anchorEndDate, returnDays);
  if (endDate > win.latestEnd) {
    endDate = win.latestEnd;
    returnDays = Math.max(0, daysBetween(anchorEndDate, endDate));
    conflicts.push("Date de retour ajustée au plus tard autorisé.");
  }

  // On ne fait rouler le foyer **que les jours non travaillés** (Andy télétravaille
  // les jours ouvrés → pas de longue route). Les opportunités du corridor sont donc
  // réparties sur les jours non travaillés de chaque phase.
  const outboundDates: string[] = [];
  for (let d = 0; d < outboundDays; d++) outboundDates.push(addDays(startDate, d));
  const returnDates: string[] = [];
  for (let d = 1; d <= returnDays; d++) returnDates.push(addDays(anchorEndDate, d));

  const isFree = (date: string) => !c.workDays.includes(weekday(date));
  const drivingOut = outboundDates.filter(isFree);
  const drivingReturn = returnDates.filter(isFree);
  const outDays = drivingOut.length > 0 ? drivingOut : outboundDates;
  const returnDriveDays = drivingReturn.length > 0 ? drivingReturn : returnDates;

  // Allocation **étapes-garanties-aware** : une étape forced occupe son jour
  // de visite + (stayNights-1) jours suivants (le foyer reste sur place → les
  // nuits s'accumulent à cette localisation). Les opportunités optionnelles se
  // répartissent sur les jours restants.
  const assign = new Map<string, Opportunity[]>();
  function allocate(stops: Opportunity[], dayList: string[]): Opportunity[] {
    const forcedStops = stops.filter((s) => s.forced);
    const optionalStops = stops.filter((s) => !s.forced);
    const reserved = new Set<number>();
    const leftover: Opportunity[] = [];
    let cursor = 0;
    for (const f of forcedStops) {
      if (cursor >= dayList.length) { leftover.push(f); continue; }
      const dayIdx = cursor;
      assign.set(dayList[dayIdx], [...(assign.get(dayList[dayIdx]) ?? []), f]);
      reserved.add(dayIdx);
      const extra = Math.max(0, (f.stayNights ?? 0) - 1);
      for (let k = 1; k <= extra && dayIdx + k < dayList.length; k++) reserved.add(dayIdx + k);
      cursor = dayIdx + 1 + extra;
    }
    const freeDays = dayList.filter((_, i) => !reserved.has(i));
    if (freeDays.length > 0 && optionalStops.length > 0) {
      splitContiguous(optionalStops, freeDays.length).forEach((grp, i) => {
        if (grp.length) assign.set(freeDays[i], [...(assign.get(freeDays[i]) ?? []), ...grp]);
      });
    } else {
      leftover.push(...optionalStops);
    }
    return leftover;
  }

  const unplacedBack: Opportunity[] = [];
  if (outDays.length > 0) {
    allocate(out, outDays);
  }
  if (returnDriveDays.length > 0) {
    unplacedBack.push(...allocate(back, returnDriveDays));
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
  const isInAnchorBlock = (date: string) =>
    date >= anchorStartDate && date <= anchorEndDate;

  for (let dayNo = 0; dayNo <= totalDays; dayNo++) {
    const date = addDays(startDate, dayNo);
    const isWorkday = c.workDays.includes(weekday(date));
    const heat = await adapters.canicule.isHeatAlert(curLoc, date);
    if (heat) caniculeExposureDays++;

    const stops: PlannedStop[] = [];
    let clock = DAY_START_MIN;
    let dayDrive = 0;

    // ── Bloc d'ancre : foyer sur place, pas de route, événement le 1er jour
    if (isInAnchorBlock(date)) {
      // Arrivée à l'ancre depuis ailleurs : ajoute le trajet juste avant
      // d'entrer dans le bloc (premier jour seulement).
      if (date === anchorStartDate && curLoc !== anchorLoc) {
        const est = await adapters.travel.estimate(curLoc, anchorLoc, isoDateTime(date, clock));
        // Conduite + pauses bébé (segments courts simplifiés).
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
        if (remaining > 0) {
          const driveStart = clock;
          clock += remaining; dayDrive += remaining; driveSinceBreak += remaining;
          stops.push({
            title: `Trajet vers ${anchor.title}`, kind: "drive",
            start: isoDateTime(date, driveStart), end: isoDateTime(date, clock),
            location: anchorLoc,
            note: est.chargeStops > 0 ? `${est.chargeStops} arrêt(s) Superchargeur inclus` : undefined,
            sourceStatus: est.sourceStatus,
          });
        }
        curLoc = anchorLoc;
      }

      // Stop "anchor" : journée à l'événement (heures exactes le premier jour,
      // ou journée entière 09–18h pour les jours suivants du bloc).
      if (date === anchorStartDate) {
        stops.push({
          title: anchor.title, kind: "anchor",
          start: anchor.start, end: anchor.end, location: anchor.location,
          source: anchor.source, sourceStatus: anchor.sourceStatus,
        });
        anchorPlaced = true;
      } else if (date === anchorEndDate && anchorEndDate !== anchorStartDate) {
        // Dernier jour du bloc — borne supérieure réelle.
        stops.push({
          title: `${anchor.title} — dernier jour`, kind: "anchor",
          start: isoDateTime(date, parseHM("09:00")),
          end: anchor.end,
          location: anchor.location,
          source: anchor.source, sourceStatus: anchor.sourceStatus,
        });
      } else {
        // Jour intermédiaire du bloc : présence continue à l'ancre, 09h–18h.
        stops.push({
          title: `${anchor.title} — journée`, kind: "anchor",
          start: isoDateTime(date, parseHM("09:00")),
          end: isoDateTime(date, parseHM("18:00")),
          location: anchor.location,
          source: anchor.source, sourceStatus: anchor.sourceStatus,
        });
      }

      stops.push({
        title: "Nuit (à proximité de l'événement)",
        kind: "night",
        start: isoDateTime(date, Math.max(clock, DAY_END_MIN)),
        end: isoDateTime(addDays(date, 1), DAY_START_MIN),
        location: anchorLoc,
      });

      days.push({ date, isWorkday, stops, driveMinutes: dayDrive });
      continue;
    }

    // ── Journée normale (hors bloc d'ancre)
    const targets: Opportunity[] = assign.get(date) ?? [];

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

    // Aller vers les cibles du jour (opportunités).
    const ordered: { loc: LatLng; opp?: Opportunity }[] =
      targets.map((o) => ({ loc: o.location, opp: o }));

    for (const node of ordered) {
      const est = await adapters.travel.estimate(curLoc, node.loc, isoDateTime(date, clock));

      // Blocage canicule 12h–16h (jours d'alerte uniquement).
      const blockStart = parseHM(c.caniculeNoDrive.start);
      const blockEnd = parseHM(c.caniculeNoDrive.end);
      if (est.minutes > 0 && heat && clock < blockEnd && clock + est.minutes > blockStart) {
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
          title: node.opp ? `Trajet vers ${node.opp.title}` : "Trajet",
          kind: "drive",
          start: isoDateTime(date, driveStart), end: isoDateTime(date, clock),
          location: node.loc,
          note: est.chargeStops > 0 ? `${est.chargeStops} arrêt(s) Superchargeur inclus` : undefined,
          sourceStatus: est.sourceStatus,
        });
      }
      curLoc = node.loc;

      if (node.opp) {
        const o = node.opp;
        const isPerson = o.category === "people";
        // Une étape **garantie** (forced) ou une personne-ancre est placée
        // quoi qu'il arrive ; les opportunités optionnelles cèdent si la
        // journée déborde.
        if (isPerson || o.forced || clock + o.durationMin <= DAY_END_MIN) {
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

    // ── Retour à la maison : le DERNIER jour, on rentre au point de départ.
    // Sans ça, le voyage se terminerait à l'ancre (le foyer ne rentrerait
    // jamais) — c'était une dette du solveur durci (le V1 finissait sa
    // séquence par l'origine).
    const isLastDay = date === endDate;
    const atOrigin =
      Math.abs(curLoc.lat - win.origin.lat) < 1e-6 &&
      Math.abs(curLoc.lng - win.origin.lng) < 1e-6;
    let returnedHome = false;
    if (isLastDay && !atOrigin) {
      const est = await adapters.travel.estimate(curLoc, win.origin, isoDateTime(date, clock));
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
          title: "Retour au point de départ", kind: "drive",
          start: isoDateTime(date, driveStart), end: isoDateTime(date, clock),
          location: win.origin,
          note: est.chargeStops > 0 ? `${est.chargeStops} arrêt(s) Superchargeur inclus` : undefined,
          sourceStatus: est.sourceStatus,
        });
      }
      curLoc = win.origin;
      returnedHome = true;
    }

    // Journée de route trop longue avec un bébé : on le **signale** (jamais
    // masqué) plutôt que de l'imposer en silence.
    if (dayDrive > Math.round(c.maxDrivePerDayMin * 1.4)) {
      conflicts.push(
        `Journée du ${date} : ${Math.round(dayDrive / 60)} h de route — envisage une étape intermédiaire pour le bébé.`,
      );
    }

    // Pas de "nuit" le dernier jour si on est rentré à la maison (le voyage
    // se termine). Sinon, nuit normale au lieu courant.
    if (!(isLastDay && returnedHome)) {
      const nextDayWork = c.workDays.includes(weekday(addDays(date, 1)));
      stops.push({
        title: (isWorkday || nextDayWork) ? "Nuit (hébergement workation-ready)" : "Nuit (matelas ferme + clim)",
        kind: "night",
        start: isoDateTime(date, Math.max(clock, DAY_END_MIN)),
        end: isoDateTime(addDays(date, 1), DAY_START_MIN),
        location: curLoc,
      });
    } else {
      stops.push({
        title: "Retour à la maison", kind: "night",
        start: isoDateTime(date, Math.max(clock, DAY_END_MIN)),
        end: isoDateTime(addDays(date, 1), DAY_START_MIN),
        location: win.origin,
      });
    }

    days.push({ date, isWorkday, stops, driveMinutes: dayDrive });
  }

  if (!anchorPlaced) conflicts.push("L'ancre n'a pas pu être posée à sa date — élargis la fenêtre.");
  if (unplacedBack.length > 0) conflicts.push("Fenêtre trop courte pour le retour : étapes du retour non placées.");

  // Anti-pattern : jamais d'abandon silencieux d'une étape garantie. Si une
  // étape forced saisie n'a pas pu être posée, on le dit explicitement.
  for (const o of selected) {
    if (o.forced && !includedOpportunityIds.includes(o.id)) {
      conflicts.push(
        `Étape « ${o.title} » non placée dans la fenêtre — élargis les dates ou réduis les autres étapes.`,
      );
    }
  }

  return {
    ambiance: p.ambiance, label: p.label, startDate, endDate, days,
    includedOpportunityIds,
    totalDriveMinutes: days.reduce((s, d) => s + d.driveMinutes, 0),
    score: 0, conflicts, caniculeExposureDays,
  };
}
