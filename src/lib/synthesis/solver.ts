import type {
  Anchor, Opportunity, VacationWindow, HouseholdConstraints,
  TripCandidate, PlannedDay, PlannedStop, LatLng, Ambiance,
} from "./types";
import type { SynthesisAdapters } from "./adapters";
import { curateSlot } from "./curation";
import {
  haversineKm, projection, addDays, daysBetween, isoDateTime, weekday, parseHM,
} from "./geo-time";

// Réexport pour les importateurs historiques (tests, curation).
export { haversineKm };

const DAY_START_MIN = 9 * 60;  // 09:00
const DAY_END_MIN = 20 * 60;   // 20:00

/** Top suggestions curatées (S4) pour un créneau de contrainte, classées sans exclure. */
function curatedFor(
  slot: "baby-pause" | "canicule",
  near: LatLng,
  pool: Opportunity[] | undefined,
): PlannedStop["curated"] {
  if (!pool || pool.length === 0) return undefined;
  return curateSlot(slot, near, pool)
    .slice(0, 3)
    .map((o) => ({ id: o.id, title: o.title, source: o.source, sourceStatus: o.sourceStatus }));
}

export interface LayoutParams {
  anchor: Anchor;
  selected: Opportunity[];
  window: VacationWindow;
  constraints: HouseholdConstraints;
  ambiance: Ambiance;
  label: string;
  /** Pool complet d'opportunités pour la curation des créneaux (S4, optionnel). */
  pool?: Opportunity[];
}

/** Solveur heuristique V1 : pose un ensemble d'opportunités choisi dans une chronologie datée et faisable.
 *  Complet (aucun trou) mais non optimal — le durcissement OR-Tools est un lot ultérieur.
 *  Les invariants sont garantis par solver.test.ts ; fais passer les tests. */
export async function layout(p: LayoutParams, adapters: SynthesisAdapters): Promise<TripCandidate> {
  const { anchor, selected, window: win, constraints: c } = p;
  const conflicts: string[] = [];

  const anchorStartDate = anchor.start.slice(0, 10);
  const anchorDurationMs = Date.parse(anchor.end) - Date.parse(anchor.start);
  const anchorEndDate =
    anchorDurationMs >= 24 * 3_600_000 ? anchor.end.slice(0, 10) : anchorStartDate;
  const anchorDays = Math.max(1, daysBetween(anchorStartDate, anchorEndDate) + 1);
  // Nuits dérivées honnêtement des bornes — plus de constante 14 codée en dur.
  const nights = Math.max(win.minNights, Math.min(win.maxNights, win.maxNights));

  const out = selected
    .filter(o => projection(o.location, win.origin, anchor.location) < 0.95)
    .sort((a, b) => projection(a.location, win.origin, anchor.location) - projection(b.location, win.origin, anchor.location));
  const back = selected
    .filter(o => !out.includes(o))
    .sort((a, b) => projection(a.location, anchor.location, win.origin) - projection(b.location, anchor.location, win.origin));

  // Aller : avant le bloc d'ancre. Le bloc consomme (anchorDays - 1) nuits
  // sur place ; le reste se répartit aller/retour.
  const offBlockNights = Math.max(0, nights - (anchorDays - 1));
  const outboundDays = Math.max(1, Math.min(offBlockNights, Math.round(offBlockNights * 0.5)));
  let startDate = addDays(anchorStartDate, -outboundDays);
  if (startDate < win.earliestStart) { startDate = win.earliestStart; conflicts.push("Date de départ ajustée au plus tôt autorisé."); }
  let endDate = addDays(anchorEndDate, Math.max(0, offBlockNights - outboundDays));
  if (endDate > win.latestEnd) { endDate = win.latestEnd; conflicts.push("Date de retour ajustée au plus tard autorisé."); }

  const sequence: { loc: LatLng; opp?: Opportunity; isAnchor?: boolean }[] = [
    { loc: win.origin },
    ...out.map(o => ({ loc: o.location, opp: o })),
    { loc: anchor.location, isAnchor: true },
    ...back.map(o => ({ loc: o.location, opp: o })),
    { loc: win.origin },
  ];

  const days: PlannedDay[] = [];
  const includedOpportunityIds: string[] = [];
  let caniculeExposureDays = 0;
  let segIdx = 0;
  let curLoc = win.origin;
  let driveSinceBreak = 0;

  const totalDaysV1 = daysBetween(startDate, endDate);
  for (let dayNo = 0; dayNo <= totalDaysV1; dayNo++) {
    const date = addDays(startDate, dayNo);
    const isWorkday = c.workDays.includes(weekday(date));
    const heat = await adapters.canicule.isHeatAlert(curLoc, date);
    if (heat) caniculeExposureDays++;

    const stops: PlannedStop[] = [];
    let clock = DAY_START_MIN;
    let dayDrive = 0;
    const driveCap = isWorkday ? 90 : c.maxDrivePerDayMin; // peu de route les jours travaillés

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

    while (segIdx + 1 < sequence.length && dayDrive < driveCap) {
      const next = sequence[segIdx + 1];
      const est = await adapters.travel.estimate(curLoc, next.loc, isoDateTime(date, clock));

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
        clock = blockEnd;
      }
      if (dayDrive + est.minutes > driveCap || clock + est.minutes > DAY_END_MIN) break;

      let remaining = est.minutes;
      while (driveSinceBreak + remaining > c.babyPauseEveryMin) {
        const before = c.babyPauseEveryMin - driveSinceBreak;
        clock += before; dayDrive += before; remaining -= before;
        stops.push({ title: "Pause bébé", kind: "baby-pause",
          start: isoDateTime(date, clock), end: isoDateTime(date, clock + c.babyPauseDurationMin),
          location: curLoc, curated: curatedFor("baby-pause", curLoc, p.pool) });
        clock += c.babyPauseDurationMin; driveSinceBreak = 0;
      }

      if (remaining > 0) {
        const driveStart = clock;
        clock += remaining; dayDrive += remaining; driveSinceBreak += remaining;
        stops.push({
          title: next.isAnchor ? anchor.title : (next.opp ? `Trajet vers ${next.opp.title}` : "Trajet"),
          kind: "drive",
          start: isoDateTime(date, driveStart), end: isoDateTime(date, clock),
          location: next.loc,
          note: est.chargeStops > 0 ? `${est.chargeStops} arrêt(s) Superchargeur inclus` : undefined,
          sourceStatus: est.sourceStatus,
        });
      }
      curLoc = next.loc;
      segIdx++;

      if (next.isAnchor) {
        stops.push({
          title: anchor.title, kind: "anchor",
          start: anchor.start, end: anchor.end, location: anchor.location,
          source: anchor.source, sourceStatus: anchor.sourceStatus,
        });
      } else if (next.opp) {
        const o = next.opp;
        // Les personnes sont des « ancres souples » (S5) : on les place même si
        // la visite déborde la fin de journée — voir un proche est prioritaire.
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

  if (segIdx + 1 < sequence.length) conflicts.push("Toutes les étapes n'ont pas pu être placées dans la fenêtre.");
  if (!days.some(d => d.stops.some(s => s.kind === "anchor")))
    conflicts.push("L'ancre n'a pas pu être atteinte à sa date — élargis la fenêtre ou réduis les étapes.");

  return {
    ambiance: p.ambiance, label: p.label, startDate, endDate, days,
    includedOpportunityIds,
    totalDriveMinutes: days.reduce((s, d) => s + d.driveMinutes, 0),
    score: 0, conflicts, caniculeExposureDays,
  };
}
