/**
 * Export calendrier (M9) — génération iCalendar (.ics) pure et testée.
 *
 * Convertit le voyage (événements fixes, nuitées) et les réservations en
 * événements de calendrier standard (RFC 5545), téléchargeables et
 * importables dans n'importe quel agenda. Heures « flottantes » (locales),
 * sans fuseau, suffisant pour un voyage personnel.
 */

export interface CalendarEvent {
  uid: string
  title: string
  /** YYYY-MM-DD (journée entière) ou YYYY-MM-DDTHH:mm (horaire). */
  start: string
  /** Fin optionnelle, même format que `start`. */
  end?: string
  allDay: boolean
  location?: string
  description?: string
}

/** Échappe le texte selon RFC 5545 (virgule, point-virgule, antislash, retour). */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/** Replie une ligne à 75 octets (continuation par CRLF + espace). */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line
  const out: string[] = []
  let current = ""
  let bytes = 0
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, "utf8")
    // 74 pour laisser la place à l'espace de continuation.
    if (bytes + chBytes > (out.length === 0 ? 75 : 74)) {
      out.push(current)
      current = ch
      bytes = chBytes
    } else {
      current += ch
      bytes += chBytes
    }
  }
  if (current) out.push(current)
  return out.join("\r\n ")
}

function dateOnly(s: string): string {
  return s.slice(0, 10).replace(/-/g, "")
}

function dateTime(s: string): string {
  const [d, t = "00:00"] = s.split("T")
  const [hh = "00", mm = "00"] = t.split(":")
  return `${d.replace(/-/g, "")}T${hh}${mm}00`
}

/** Lendemain d'une date YYYY-MM-DD (DTEND exclusif pour les journées entières). */
function nextDay(s: string): string {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, "")
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/** Construit un document iCalendar complet (lignes en CRLF). */
export function buildIcs(events: CalendarEvent[], now: Date = new Date()): string {
  const dtstamp = stamp(now)
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Odyssee//Carnet de route//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]

  for (const ev of events) {
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:${ev.uid}`)
    lines.push(`DTSTAMP:${dtstamp}`)
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`)
      const endDate = ev.end ? nextDay(ev.end) : nextDay(ev.start)
      lines.push(`DTEND;VALUE=DATE:${endDate}`)
    } else {
      lines.push(`DTSTART:${dateTime(ev.start)}`)
      if (ev.end) lines.push(`DTEND:${dateTime(ev.end)}`)
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`)
    if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`)
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return lines.map(foldLine).join("\r\n")
}

/** Heure décimale (11.5) → « 11:30 ». */
function decimalToTime(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

interface PlanLike {
  id: string
  days: Array<{
    date: string
    location: string
    lodging?: { name: string } | null
    events?: Array<{ id: string; name: string; hour: number; location: { address: string } }>
  }>
}

interface ReservationLike {
  id: string
  type: string
  title: string
  startDate: string
  endDate?: string
  location?: string
  confirmationNumber?: string
}

/** Convertit un plan de voyage en événements (événements fixes + nuitées). */
export function tripPlanToEvents(plan: PlanLike): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const day of plan.days) {
    for (const ev of day.events ?? []) {
      events.push({
        uid: `event-${ev.id}@odyssee`,
        title: ev.name,
        start: `${day.date}T${decimalToTime(ev.hour)}`,
        allDay: false,
        location: ev.location.address,
      })
    }
    if (day.lodging) {
      events.push({
        uid: `lodging-${plan.id}-${day.date}@odyssee`,
        title: `Nuit — ${day.lodging.name}`,
        start: day.date,
        allDay: true,
        location: day.location,
      })
    }
  }

  return events
}

/** Convertit des réservations en événements (journée entière, période). */
export function reservationsToEvents(reservations: ReservationLike[]): CalendarEvent[] {
  return reservations.map((r) => ({
    uid: `reservation-${r.id}@odyssee`,
    title: r.title,
    start: r.startDate,
    end: r.endDate,
    allDay: true,
    location: r.location,
    description: r.confirmationNumber ? `Réf : ${r.confirmationNumber}` : undefined,
  }))
}
