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
import type { SynthesisAdapters, GeoProvider } from "./adapters";
import { curateSlot } from "./curation";
import {
  projection, addDays, daysBetween, isoDateTime, weekday, parseHM, haversineKm,
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
/** Dernière minute de conduite tolérée en soirée (après le télétravail). */
const EVENING_DRIVE_LIMIT_MIN = 21 * 60 + 30;
/** Conduite maximale un jour travaillé : un court saut du soir, pas une étape. */
const WORKDAY_EVENING_DRIVE_CAP = 90;

/** Point sur le segment droit `a→b` à la fraction `frac` (0..1). */
function interpolate(a: LatLng, b: LatLng, frac: number): LatLng {
  const f = Math.max(0, Math.min(1, frac));
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

/**
 * Ville connue la plus proche d'une coordonnée (pour nommer une nuit-étape).
 * Sans `geo` injecté, renvoie la coordonnée brute sans nom — honnête, jamais
 * une ville inventée.
 */
function snapCity(loc: LatLng, geo?: GeoProvider): { name?: string; location: LatLng } {
  const hit = geo?.nearestCity(loc);
  return hit ? { name: hit.name, location: hit.location } : { location: loc };
}

/** Deux coordonnées coïncident (à la précision flottante près). */
function sameLoc(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
}

function curatedFor(slot: "baby-pause" | "canicule", near: LatLng, pool?: Opportunity[]): PlannedStop["curated"] {
  if (!pool || pool.length === 0) return undefined;
  return curateSlot(slot, near, pool).slice(0, 3)
    .map((o) => ({ id: o.id, title: o.title, source: o.source, sourceStatus: o.sourceStatus }));
}

/** État courant de conduite pour une journée (lieu, horloge, conduite, pauses). */
interface DriveCursor {
  curLoc: LatLng;
  /** Minutes depuis minuit. */
  clock: number;
  /** Minutes de conduite déjà effectuées **aujourd'hui** (comptent dans le plafond). */
  dayDrive: number;
  /** Minutes de conduite depuis la dernière pause bébé (réinitialisée la nuit). */
  driveSinceBreak: number;
}

/**
 * Conduit le foyer vers `target` **sans dépasser le plafond de conduite du jour**
 * (`dayDriveCap`, en minutes de conduite cumulées sur la journée). Insère les
 * pauses bébé et respecte le blocage canicule 12h–16h. Si le plafond est atteint
 * avant l'arrivée, la conduite **s'arrête en chemin** : la nuit se fera à la
 * ville connue la plus proche du point atteint (jamais une coordonnée inventée
 * affichée comme une ville — `geo` injecté ; sinon coordonnée brute sans nom).
 *
 * C'est le cœur de la **découpe des longs trajets** : un Dijon→Marseille (~7 h 47)
 * n'est plus écrasé sur une seule journée mais réparti, jour après jour, sous le
 * plafond confort du Profil Foyer.
 *
 * Met `cursor` à jour et renvoie les stops à ajouter + `arrived`.
 */
async function driveTowardWithin(
  cursor: DriveCursor,
  target: LatLng,
  targetTitle: string,
  date: string,
  dayDriveCap: number,
  heat: boolean,
  c: HouseholdConstraints,
  adapters: SynthesisAdapters,
  pool: Opportunity[] | undefined,
): Promise<{ stops: PlannedStop[]; arrived: boolean }> {
  const stops: PlannedStop[] = [];
  const start = cursor.curLoc;
  const est = await adapters.travel.estimate(start, target, isoDateTime(date, cursor.clock));
  if (est.minutes <= 0) {
    cursor.curLoc = target;
    return { stops, arrived: true };
  }

  // Marge de conduite encore permise aujourd'hui (le plafond porte sur la journée).
  const budget = dayDriveCap - cursor.dayDrive;
  if (budget <= 0) return { stops, arrived: false };

  // Blocage canicule 12h–16h : on n'entame ni ne poursuit la route dans la fenêtre.
  const blockStart = parseHM(c.caniculeNoDrive.start);
  const blockEnd = parseHM(c.caniculeNoDrive.end);
  if (heat && cursor.clock < blockEnd && cursor.clock + Math.min(est.minutes, budget) > blockStart) {
    stops.push({
      title: "Conduite déconseillée (alerte canicule)",
      kind: "canicule-block",
      start: isoDateTime(date, Math.max(cursor.clock, blockStart)),
      end: isoDateTime(date, blockEnd),
      note: "Fenêtre 12h–16h évitée — alerte chaleur sur le segment.",
      curated: curatedFor("canicule", cursor.curLoc, pool),
    });
    cursor.clock = Math.max(cursor.clock, blockEnd);
  }

  const driveStartClock = cursor.clock;
  let remaining = est.minutes;
  let driven = 0;
  // Conduite par tranches bornées par : prochaine pause bébé, plafond du jour, arrivée.
  while (remaining > 0 && driven < budget) {
    if (cursor.driveSinceBreak >= c.babyPauseEveryMin) {
      stops.push({
        title: "Pause bébé", kind: "baby-pause",
        start: isoDateTime(date, cursor.clock),
        end: isoDateTime(date, cursor.clock + c.babyPauseDurationMin),
        location: cursor.curLoc, curated: curatedFor("baby-pause", cursor.curLoc, pool),
      });
      cursor.clock += c.babyPauseDurationMin;
      cursor.driveSinceBreak = 0;
    }
    const untilPause = c.babyPauseEveryMin - cursor.driveSinceBreak;
    const chunk = Math.min(remaining, budget - driven, untilPause);
    if (chunk <= 0) break;
    cursor.clock += chunk;
    cursor.dayDrive += chunk;
    cursor.driveSinceBreak += chunk;
    remaining -= chunk;
    driven += chunk;
  }

  const arrived = remaining <= 0;
  let endLoc: LatLng;
  let endTitle: string;
  if (arrived) {
    endLoc = target;
    endTitle = `Trajet vers ${targetTitle}`;
  } else {
    // Étape intermédiaire : on s'arrête à la ville connue la plus proche du
    // point atteint pour y passer la nuit.
    const frac = driven / est.minutes;
    const snapped = snapCity(interpolate(start, target, frac), adapters.geo);
    endLoc = snapped.location;
    endTitle = snapped.name ? `Trajet — étape à ${snapped.name}` : "Trajet — étape intermédiaire";
  }
  // Arrêts recharge au prorata de la portion réellement parcourue.
  const chargeStops = Math.round(est.chargeStops * (driven / est.minutes));
  stops.push({
    title: endTitle, kind: "drive",
    start: isoDateTime(date, driveStartClock), end: isoDateTime(date, cursor.clock),
    location: endLoc,
    note: chargeStops > 0 ? `${chargeStops} arrêt(s) Superchargeur inclus` : undefined,
    sourceStatus: est.sourceStatus,
  });
  cursor.curLoc = endLoc;
  return { stops, arrived };
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
  // Heure de début de l'événement (minutes depuis minuit) : on veut **arriver
  // avant** — un trajet d'approche qui chevauche l'heure de l'ancre est faux.
  const anchorStartMin = parseHM(anchor.start.slice(11, 16));

  // Plafond de conduite **par jour** (confort du Profil Foyer) — c'est le moteur
  // de la découpe : aucun trajet ne dépasse ce plafond sur une seule journée.
  const cap = Math.max(60, Math.round(c.maxDrivePerDayMin));
  const workEndMin = parseHM(c.workEnd);
  // Un jour travaillé : au plus un saut du soir (après le télétravail), borné
  // par l'heure tardive limite — pas une étape complète.
  const eveningCap = Math.max(0, Math.min(cap, WORKDAY_EVENING_DRIVE_CAP, EVENING_DRIVE_LIMIT_MIN - workEndMin));
  /** Plafond de conduite du jour `date` (jour travaillé → saut du soir seulement). */
  const dayCapFor = (date: string) => (c.workDays.includes(weekday(date)) ? eveningCap : cap);

  // **Ancre = présence minimale, pas exclusive.** Pour une ancre multi-jour
  // (séjour), les opportunités **proches de l'ancre** sont vécues PENDANT le
  // séjour (le foyer est basé sur place mais **libre d'explorer**), au lieu
  // d'être repoussées sur le corridor. Le reste alimente aller/retour. (Une ancre
  // 1 jour n'a pas de jour de séjour à remplir → `stayPool` vide, comportement
  // inchangé.)
  const isMultiDayAnchor = anchorEndDate !== anchorStartDate;
  const STAY_RADIUS_KM = 60;
  const stayPool = isMultiDayAnchor
    ? selected.filter(
        (o) => o.category !== "people" && !o.forced && haversineKm(o.location, anchorLoc) <= STAY_RADIUS_KM,
      )
    : [];
  // Suggestions curatées de proximité (classées, jamais exclues) pour une
  // journée de séjour sans visite planifiée.
  const staySuggestions = isMultiDayAnchor
    ? curateSlot("workday-family", anchorLoc, selected, { radiusKm: STAY_RADIUS_KM })
        .slice(0, 3)
        .map((o) => ({ id: o.id, title: o.title, source: o.source, sourceStatus: o.sourceStatus }))
    : undefined;

  // Côté corridor : aller (origine→ancre) vs retour (ancre→origine), ordonnés
  // par progression le long de l'axe (on les atteint dans l'ordre géographique).
  const corridor = selected.filter((o) => !stayPool.includes(o));
  const out = corridor
    .filter((o) => projection(o.location, win.origin, anchorLoc) < 0.95)
    .sort((a, b) => projection(a.location, win.origin, anchorLoc) - projection(b.location, win.origin, anchorLoc));
  const back = corridor
    .filter((o) => !out.includes(o))
    .sort((a, b) => projection(a.location, anchorLoc, win.origin) - projection(b.location, anchorLoc, win.origin));

  // ── Positionnement **conscient des jours travaillés** ──────────────────────
  // Un jour travaillé ne conduit qu'un court saut du soir (eveningCap), un jour
  // libre conduit jusqu'au plafond. Un placement naïf (anchor − 40 %·budget)
  // tombait sur des jours travaillés → le foyer n'avançait pas et entassait des
  // heures le jour de l'événement. On dimensionne désormais l'aller/retour par
  // la **capacité de conduite réelle** : on part assez tôt pour capter les
  // week-ends et **arriver à l'ancre à l'heure**.
  const approachMin = (await adapters.travel.estimate(win.origin, anchorLoc, isoDateTime(anchorStartDate, DAY_START_MIN))).minutes;
  const returnMin = (await adapters.travel.estimate(anchorLoc, win.origin, isoDateTime(addDays(anchorEndDate, 1), DAY_START_MIN))).minutes;

  // Nuits « parking » des étapes garanties (elles n'avancent pas le long du corridor).
  const outStayExtra = out.reduce((s, o) => s + (o.forced ? Math.max(0, (o.stayNights ?? 0) - 1) : 0), 0);
  const backStayExtra = back.reduce((s, o) => s + (o.forced ? Math.max(0, (o.stayNights ?? 0) - 1) : 0), 0);

  // Compte les jours nécessaires depuis `from` (dans le sens `step`) pour
  // accumuler `need` minutes de conduite (chaque jour apporte sa capacité réelle),
  // + `extraStay` nuits de séjour garanties. Borné par la fenêtre.
  const fillDays = (from: string, step: 1 | -1, need: number, extraStay: number): number => {
    const bound = step < 0 ? win.earliestStart : win.latestEnd;
    let remaining = need;
    let stay = extraStay;
    let days = 0;
    let d = from;
    while ((remaining > 0 || stay > 0) && (step < 0 ? d >= bound : d <= bound)) {
      if (remaining > 0) remaining -= dayCapFor(d);
      else stay -= 1;
      days += 1;
      d = addDays(d, step);
    }
    return Math.max(1, days);
  };

  // Minimum **faisable** de jours (capte les week-ends en remontant depuis la veille).
  const minOutboundDays = fillDays(addDays(anchorStartDate, -1), -1, approachMin, outStayExtra);
  const minReturnDays = fillDays(addDays(anchorEndDate, 1), 1, returnMin, backStayExtra);
  const minTotal = minOutboundDays + minReturnDays;

  // Budget de nuits hors-bloc voulu par l'intention (maxNights). La faisabilité
  // prime : on ne descend jamais sous le minimum (sinon arrivée en retard).
  const nights = Math.max(win.maxNights, anchorDays);
  const offBlockNights = Math.max(0, nights - (anchorDays - 1));
  let outboundDays: number;
  let returnDays: number;
  if (offBlockNights <= minTotal) {
    outboundDays = minOutboundDays;
    returnDays = minReturnDays;
  } else {
    // Marge supplémentaire (« maximiser ») répartie ~40 % aller / 60 % retour.
    const extra = offBlockNights - minTotal;
    const addOut = Math.round(extra * 0.4);
    outboundDays = minOutboundDays + addOut;
    returnDays = minReturnDays + (extra - addOut);
  }

  let startDate = addDays(anchorStartDate, -outboundDays);
  if (startDate < win.earliestStart) {
    startDate = win.earliestStart;
    outboundDays = Math.max(1, daysBetween(startDate, anchorStartDate));
    // Capacité d'approche insuffisante même en partant au plus tôt : signalé par
    // le bloc d'ancre (« approche non terminée / arrivée tardive »).
    conflicts.push("Date de départ ajustée au plus tôt autorisé.");
  }
  let endDate = addDays(anchorEndDate, returnDays);
  if (endDate > win.latestEnd) {
    endDate = win.latestEnd;
    returnDays = Math.max(0, daysBetween(anchorEndDate, endDate));
    conflicts.push("Date de retour ajustée au plus tard autorisé.");
  }

  const days: PlannedDay[] = [];
  const includedOpportunityIds: string[] = [];
  let caniculeExposureDays = 0;
  let anchorPlaced = false;

  const totalDays = daysBetween(startDate, endDate);
  const isInAnchorBlock = (date: string) => date >= anchorStartDate && date <= anchorEndDate;

  // Jours de conduite restants en phase retour (aujourd'hui inclus) — sert à
  // **étaler** le retour pour rentrer en fin de fenêtre, au lieu de foncer puis
  // de croupir à la maison.
  const drivableReturnDaysFrom = (fromDate: string): number => {
    let n = 0;
    for (let dn = daysBetween(startDate, fromDate); dn <= totalDays; dn++) {
      const d = addDays(startDate, dn);
      if (d <= anchorEndDate) continue;
      if (dayCapFor(d) > 0) n++;
    }
    return Math.max(1, n);
  };

  // État de progression le long du corridor (porté de jour en jour).
  const cur: DriveCursor = { curLoc: win.origin, clock: DAY_START_MIN, dayDrive: 0, driveSinceBreak: 0 };
  let wpOut = 0;          // prochaine étape aller à atteindre
  let wpBack = 0;         // prochaine étape retour à atteindre
  let parkDaysLeft = 0;   // nuits encore dues sur une étape garantie (foyer immobile)
  let stayIdx = 0;        // prochaine visite de proximité à vivre pendant le séjour d'ancre

  /** Visite d'une opportunité atteinte (forced/personne : toujours ; optionnelle : si la journée ne déborde pas). */
  const visitReached = (o: Opportunity, date: string, heat: boolean): PlannedStop[] => {
    const isPerson = o.category === "people";
    if (isPerson || o.forced || cur.clock + o.durationMin <= DAY_END_MIN) {
      const stop: PlannedStop = {
        opportunityId: o.id, title: o.title, kind: "visit",
        start: isoDateTime(date, cur.clock), end: isoDateTime(date, cur.clock + o.durationMin),
        location: o.location, source: o.source, sourceStatus: o.sourceStatus,
        note: heat && o.indoor === false ? "Extérieur — prudence chaleur" : undefined,
      };
      cur.clock += o.durationMin;
      includedOpportunityIds.push(o.id);
      return [stop];
    }
    return [];
  };

  for (let dayNo = 0; dayNo <= totalDays; dayNo++) {
    const date = addDays(startDate, dayNo);
    const isWorkday = c.workDays.includes(weekday(date));
    const heat = await adapters.canicule.isHeatAlert(cur.curLoc, date);
    if (heat) caniculeExposureDays++;

    const stops: PlannedStop[] = [];
    // Nouvelle journée : l'horloge repart, la conduite du jour est remise à zéro,
    // et la nuit a réinitialisé le compteur de pause bébé.
    cur.clock = DAY_START_MIN;
    cur.dayDrive = 0;
    cur.driveSinceBreak = 0;

    // ── Bloc d'ancre : foyer sur place, événement, nuit à proximité.
    if (isInAnchorBlock(date)) {
      // Filet de sécurité : si la fenêtre était trop courte pour arriver la
      // veille, on termine l'approche le matin de l'événement — et on le
      // **signale** si l'arrivée dépasse l'heure de début (jamais masqué).
      if (date === anchorStartDate && !sameLoc(cur.curLoc, anchorLoc)) {
        const res = await driveTowardWithin(cur, anchorLoc, anchor.title, date, cap, heat, c, adapters, p.pool);
        stops.push(...res.stops);
        if (!res.arrived) {
          conflicts.push(
            `Approche de « ${anchor.title} » non terminée avant l'événement — fenêtre trop courte pour un trajet reposant.`,
          );
        } else if (cur.clock > anchorStartMin) {
          conflicts.push(
            `Arrivée à « ${anchor.title} » le jour même, après l'heure de début — partez plus tôt ou ajoutez une nuit en chemin.`,
          );
        }
        cur.curLoc = anchorLoc;
      }

      if (date === anchorStartDate) {
        // Premier jour = l'événement fixe, à ses heures réelles. Pour un séjour
        // multi-jour, on borne au 1er jour (le séjour n'est pas un événement
        // continu qui occupe toute la plage — c'est une présence minimale).
        stops.push({
          title: anchor.title, kind: "anchor",
          start: anchor.start,
          end: isMultiDayAnchor ? isoDateTime(date, parseHM("18:00")) : anchor.end,
          location: anchor.location, source: anchor.source, sourceStatus: anchor.sourceStatus,
        });
        anchorPlaced = true;
        cur.clock = Math.max(cur.clock, parseHM(isMultiDayAnchor ? "18:00" : anchor.end.slice(11, 16)));
      } else if (date === anchorEndDate) {
        // Dernier jour du séjour — borne supérieure réelle (heure de fin).
        stops.push({
          title: `${anchor.title} — dernier jour`, kind: "anchor",
          start: isoDateTime(date, parseHM("09:00")), end: anchor.end, location: anchor.location,
          source: anchor.source, sourceStatus: anchor.sourceStatus,
        });
        cur.clock = Math.max(cur.clock, parseHM(anchor.end.slice(11, 16)));
      } else {
        // Jour intermédiaire = **séjour libre** (présence minimale) : le foyer est
        // basé sur place mais LIBRE d'explorer. On vit les opportunités de
        // proximité comme visites du jour ; sinon journée libre + suggestions
        // curatées (classées, jamais imposées).
        let added = 0;
        while (stayIdx < stayPool.length && added < 3 && cur.clock + stayPool[stayIdx].durationMin <= DAY_END_MIN) {
          const o = stayPool[stayIdx++];
          stops.push({
            opportunityId: o.id, title: o.title, kind: "visit",
            start: isoDateTime(date, cur.clock), end: isoDateTime(date, cur.clock + o.durationMin),
            location: o.location, source: o.source, sourceStatus: o.sourceStatus,
            note: heat && o.indoor === false ? "Séjour — à proximité (extérieur, prudence chaleur)" : "Séjour — à proximité de l'ancre",
          });
          cur.clock += o.durationMin;
          includedOpportunityIds.push(o.id);
          added += 1;
        }
        if (added === 0) {
          stops.push({
            title: `${anchor.title} — journée libre (séjour sur place)`, kind: "anchor",
            start: isoDateTime(date, parseHM("09:00")), end: isoDateTime(date, parseHM("18:00")), location: anchor.location,
            source: anchor.source, sourceStatus: anchor.sourceStatus,
            curated: staySuggestions,
          });
        }
      }

      stops.push({
        title: isMultiDayAnchor ? "Nuit (séjour sur place, à proximité de l'ancre)" : "Nuit (à proximité de l'événement)",
        kind: "night",
        start: isoDateTime(date, Math.max(cur.clock, DAY_END_MIN)),
        end: isoDateTime(addDays(date, 1), DAY_START_MIN),
        location: anchorLoc,
      });
      days.push({ date, isWorkday, stops, driveMinutes: cur.dayDrive });
      continue;
    }

    const phase: "out" | "return" = date < anchorStartDate ? "out" : "return";
    const isLastDay = date === endDate;

    // Jour travaillé : bloc télétravail, la conduite ne peut commencer qu'après.
    if (isWorkday) {
      stops.push({
        title: "Télétravail (Andy) — coworking à proximité", kind: "work",
        start: isoDateTime(date, parseHM(c.workStart)), end: isoDateTime(date, parseHM(c.workEnd)),
        location: cur.curLoc,
        note: "Piste famille (coworking + visites) fournie par la couche curation (S4).",
        curated: curatedFor("canicule", cur.curLoc, p.pool),
      });
      cur.clock = workEndMin;
    }

    // Plafond de conduite du jour. En retour, on **étale** pour rentrer en fin
    // de fenêtre (le dernier jour : plein régime confort pour boucler).
    let dayCap = dayCapFor(date);
    if (phase === "return" && !isLastDay) {
      const remHome = (await adapters.travel.estimate(cur.curLoc, win.origin, isoDateTime(date, cur.clock))).minutes;
      dayCap = Math.min(dayCap, Math.ceil(remHome / drivableReturnDaysFrom(date)));
    } else if (phase === "return" && isLastDay) {
      dayCap = cap;
    }

    if (parkDaysLeft > 0) {
      // Étape garantie en cours : le foyer reste sur place cette nuit.
      parkDaysLeft -= 1;
    } else {
      // Progression continue vers la prochaine étape, puis vers la destination
      // de la phase (ancre à l'aller, point de départ au retour), sous le
      // plafond du jour. driveTowardWithin **découpe** un long trajet : s'il
      // n'arrive pas, la nuit se fera en chemin (vraie ville d'étape).
      const waypoints = phase === "out" ? out : back;
      const phaseTarget = phase === "out" ? anchorLoc : win.origin;
      let guard = 0;
      while (cur.dayDrive < dayCap && guard++ < 64) {
        const idx = phase === "out" ? wpOut : wpBack;
        const wp = idx < waypoints.length ? waypoints[idx] : null;
        const res = await driveTowardWithin(
          cur, wp ? wp.location : phaseTarget, wp ? wp.title : (phase === "out" ? anchor.title : "le point de départ"),
          date, dayCap, heat, c, adapters, p.pool,
        );
        stops.push(...res.stops);
        if (!res.arrived) break;          // plafond du jour atteint → nuit-étape en chemin
        if (!wp) break;                   // arrivé à la destination de la phase (ancre/maison)
        const visitStops = visitReached(wp, date, heat);
        if (visitStops.length === 0) break; // optionnelle qui ne tient pas dans la journée → nuit sur place, visitée demain matin (jamais sautée par manque d'heure)
        stops.push(...visitStops);
        if (phase === "out") wpOut += 1; else wpBack += 1;
        if ((wp.stayNights ?? 0) > 0) { parkDaysLeft = (wp.stayNights ?? 0) - 1; break; }
      }
    }

    const returnedHome = isLastDay && sameLoc(cur.curLoc, win.origin);

    // Journée de route au-delà du plafond confort : signalée (jamais masquée).
    // Avec la découpe, cela ne survient qu'en fenêtre trop serrée pour découper.
    if (cur.dayDrive > cap) {
      conflicts.push(
        `Journée du ${date} : ${Math.round(cur.dayDrive / 60)} h de route — fenêtre trop serrée pour découper davantage.`,
      );
    }

    if (returnedHome) {
      stops.push({
        title: "Retour à la maison", kind: "night",
        start: isoDateTime(date, Math.max(cur.clock, DAY_END_MIN)),
        end: isoDateTime(addDays(date, 1), DAY_START_MIN),
        location: win.origin,
      });
    } else {
      const nextDayWork = c.workDays.includes(weekday(addDays(date, 1)));
      stops.push({
        title: (isWorkday || nextDayWork) ? "Nuit (hébergement workation-ready)" : "Nuit (matelas ferme + clim)",
        kind: "night",
        start: isoDateTime(date, Math.max(cur.clock, DAY_END_MIN)),
        end: isoDateTime(addDays(date, 1), DAY_START_MIN),
        location: cur.curLoc,
      });
    }

    days.push({ date, isWorkday, stops, driveMinutes: cur.dayDrive });
  }

  if (!anchorPlaced) conflicts.push("L'ancre n'a pas pu être posée à sa date — élargis la fenêtre.");
  if (!sameLoc(cur.curLoc, win.origin)) {
    conflicts.push("Fenêtre trop courte pour boucler le retour au point de départ — élargis les dates.");
  }

  // Anti-pattern : jamais d'abandon silencieux d'une étape garantie. Si une
  // étape forced saisie n'a pas pu être posée — ou si ses nuits sur place ont
  // été écourtées (collision avec le bloc d'ancre / fenêtre trop courte) — on le
  // dit explicitement (contrat V4 : nuits honorées OU conflit explicite).
  for (const o of selected) {
    if (!o.forced) continue;
    if (!includedOpportunityIds.includes(o.id)) {
      conflicts.push(
        `Étape « ${o.title} » non placée dans la fenêtre — élargis les dates ou réduis les autres étapes.`,
      );
      continue;
    }
    const wantNights = o.stayNights ?? 0;
    if (wantNights > 0) {
      const gotNights = days.filter((d) =>
        d.stops.some((s) => s.kind === "night" && s.location && sameLoc(s.location, o.location)),
      ).length;
      if (gotNights < wantNights) {
        conflicts.push(
          `Étape « ${o.title} » : ${gotNights} nuit(s) sur place au lieu de ${wantNights} demandée(s) — fenêtre trop courte pour les honorer.`,
        );
      }
    }
  }

  return {
    ambiance: p.ambiance, label: p.label, startDate, endDate, days,
    includedOpportunityIds,
    totalDriveMinutes: days.reduce((s, d) => s + d.driveMinutes, 0),
    score: 0, conflicts, caniculeExposureDays,
  };
}
