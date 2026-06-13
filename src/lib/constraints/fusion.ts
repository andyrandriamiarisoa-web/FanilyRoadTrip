/**
 * Moteur de fusion des contraintes (M5) — pur et déterministe.
 *
 * Simule une horloge qui avance le long de la conduite et insère :
 *  - les **pauses bébé** dès que `maxLegMinutes` de conduite est atteint
 *    (une recharge ou un blocage long réinitialise ce compteur — alignement),
 *  - les **blocages** (canicule 12h–16h, heures de télétravail) en différant
 *    la conduite jusqu'à la fin de la fenêtre,
 *  - les **recharges** entre segments.
 *
 * Au-delà de `dayEndHour`, on signale qu'une nuitée est nécessaire plutôt que
 * de simuler la nuit (relève de l'itinéraire multi-jours).
 */

import type {
  TimelineEvent,
  TimelineInput,
  TimelineResult,
  TimelineLeg,
} from "./types"

const DEFAULT_BABY_PAUSE_MIN = 20
const DEFAULT_DAY_END_HOUR = 22

interface ActiveWindow {
  end: number
  type: "heat-block" | "work-block"
  label: string
}

export function fuseDayTimeline(input: TimelineInput): TimelineResult {
  const babyPauseMin = input.babyPauseMinutes ?? DEFAULT_BABY_PAUSE_MIN
  const dayEndHour = input.dayEndHour ?? DEFAULT_DAY_END_HOUR
  const windows = buildWindows(input)

  const events: TimelineEvent[] = []
  const conflicts: string[] = []
  let t = input.departureHour
  let driveSinceBreak = 0
  let babyPauseCount = 0
  let totalDriveMinutes = 0
  let totalBlockedMinutes = 0
  let feasibleWithinDay = true

  const MAX_STEPS = 5_000
  let steps = 0
  let overflowed = false

  for (const leg of input.legs) {
    let remaining = leg.driveMinutes

    while (remaining > 0.0001) {
      if (++steps > MAX_STEPS) {
        conflicts.push("Fusion interrompue (trop d'étapes).")
        feasibleWithinDay = false
        overflowed = true
        break
      }

      // Sortie de journée → nuitée nécessaire.
      if (t >= dayEndHour) {
        conflicts.push(
          `Conduite restante après ${formatHour(dayEndHour)} — une nuitée est nécessaire avant de poursuivre.`,
        )
        feasibleWithinDay = false
        overflowed = true
        break
      }

      // Dans une fenêtre bloquée → différer.
      const active = activeWindow(t, windows)
      if (active) {
        const end = Math.min(active.end, dayEndHour)
        pushOrExtend(events, {
          type: active.type,
          startHour: t,
          endHour: end,
          label: active.label,
        })
        totalBlockedMinutes += (end - t) * 60
        t = active.end
        driveSinceBreak = 0 // un arrêt long réinitialise le compteur bébé
        continue
      }

      // Pause bébé due ?
      if (driveSinceBreak >= input.maxLegMinutes) {
        events.push({
          type: "baby-pause",
          startHour: t,
          endHour: t + babyPauseMin / 60,
          label: "Pause bébé",
        })
        t += babyPauseMin / 60
        driveSinceBreak = 0
        babyPauseCount++
        continue
      }

      // Conduire un bloc : jusqu'à la prochaine fenêtre, la prochaine pause,
      // ou la fin du segment.
      const minsUntilWindow = minutesUntilNextWindow(t, windows)
      const minsUntilPause = input.maxLegMinutes - driveSinceBreak
      const chunk = Math.min(remaining, minsUntilWindow, minsUntilPause)

      if (chunk <= 0.0001) continue // une condition ci-dessus va s'appliquer

      const endHour = t + chunk / 60
      pushOrExtend(events, {
        type: "drive",
        startHour: t,
        endHour,
        label: `Conduite vers ${leg.toName}`,
      })
      t = endHour
      remaining -= chunk
      driveSinceBreak += chunk
      totalDriveMinutes += chunk
    }

    if (overflowed) break

    // Recharge à l'issue du segment — réinitialise aussi le compteur bébé.
    if (leg.chargeMinutes && leg.chargeMinutes > 0) {
      events.push({
        type: "charge",
        startHour: t,
        endHour: t + leg.chargeMinutes / 60,
        label: leg.chargerName ? `Recharge — ${leg.chargerName}` : "Recharge",
      })
      t += leg.chargeMinutes / 60
      driveSinceBreak = 0
    }
  }

  return {
    events,
    endHour: round2(t),
    feasibleWithinDay,
    conflicts,
    babyPauseCount,
    totalDriveMinutes: Math.round(totalDriveMinutes),
    totalBlockedMinutes: Math.round(totalBlockedMinutes),
  }
}

// ── Fenêtres bloquées ──────────────────────────────────────────────────────

interface Window {
  start: number
  end: number
  type: "heat-block" | "work-block"
  label: string
}

function buildWindows(input: TimelineInput): Window[] {
  const out: Window[] = []
  if (input.heatWindow) {
    out.push({
      start: input.heatWindow[0],
      end: input.heatWindow[1],
      type: "heat-block",
      label: "Canicule — pas de conduite",
    })
  }
  if (input.workWindow) {
    out.push({
      start: input.workWindow[0],
      end: input.workWindow[1],
      type: "work-block",
      label: "Télétravail — pas de conduite",
    })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Fenêtre couvrant l'instant t (la plus tardive si chevauchement), sinon null. */
function activeWindow(t: number, windows: Window[]): ActiveWindow | null {
  const covering = windows.filter((w) => t >= w.start - 1e-9 && t < w.end - 1e-9)
  if (covering.length === 0) return null
  const latest = covering.reduce((a, b) => (b.end > a.end ? b : a))
  return { end: latest.end, type: latest.type, label: latest.label }
}

function minutesUntilNextWindow(t: number, windows: Window[]): number {
  let best = Infinity
  for (const w of windows) {
    if (w.start > t + 1e-9) best = Math.min(best, (w.start - t) * 60)
  }
  return best
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Fusionne avec l'événement précédent s'il est de même type et contigu. */
function pushOrExtend(events: TimelineEvent[], ev: TimelineEvent): void {
  const last = events[events.length - 1]
  if (last && last.type === ev.type && Math.abs(last.endHour - ev.startHour) < 1e-6) {
    last.endHour = ev.endHour
    return
  }
  events.push(ev)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  if (mm === 60) return `${hh + 1}h`
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, "0")}`
}

/** Variante pratique : construit l'entrée à partir des champs d'un RoutePlan. */
export function timelineFromLegs(
  legs: TimelineLeg[],
  opts: {
    departureHour: number
    maxLegMinutes: number
    isHeatwave: boolean
    heatWindow: [number, number]
    isWorkDay: boolean
    workWindow: [number, number]
    babyPauseMinutes?: number
    dayEndHour?: number
  },
): TimelineResult {
  return fuseDayTimeline({
    departureHour: opts.departureHour,
    legs,
    maxLegMinutes: opts.maxLegMinutes,
    babyPauseMinutes: opts.babyPauseMinutes,
    heatWindow: opts.isHeatwave ? opts.heatWindow : null,
    workWindow: opts.isWorkDay ? opts.workWindow : null,
    dayEndHour: opts.dayEndHour,
  })
}
