import { describe, it, expect } from "vitest"
import {
  buildIcs,
  escapeIcsText,
  foldLine,
  tripPlanToEvents,
  reservationsToEvents,
  type CalendarEvent,
} from "./ics"

const NOW = new Date("2026-06-13T10:00:00.000Z")

describe("escapeIcsText", () => {
  it("échappe virgules, points-virgules, antislash et retours", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne")
  })
})

describe("foldLine", () => {
  it("ne replie pas une ligne courte", () => {
    expect(foldLine("SUMMARY:court")).toBe("SUMMARY:court")
  })
  it("replie une ligne longue avec CRLF + espace", () => {
    const long = "DESCRIPTION:" + "x".repeat(200)
    const folded = foldLine(long)
    expect(folded).toContain("\r\n ")
    for (const seg of folded.split("\r\n ")) {
      expect(Buffer.byteLength(seg, "utf8")).toBeLessThanOrEqual(75)
    }
  })
})

describe("buildIcs", () => {
  it("produit un VCALENDAR bien formé", () => {
    const ics = buildIcs([], NOW)
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true)
    expect(ics).toContain("VERSION:2.0")
  })

  it("encode un événement horaire", () => {
    const ev: CalendarEvent = {
      uid: "x@odyssee",
      title: "Mariage",
      start: "2026-08-08T11:30",
      allDay: false,
      location: "Marseille",
    }
    const ics = buildIcs([ev], NOW)
    expect(ics).toContain("BEGIN:VEVENT")
    expect(ics).toContain("UID:x@odyssee")
    expect(ics).toContain("DTSTART:20260808T113000")
    expect(ics).toContain("SUMMARY:Mariage")
    expect(ics).toContain("LOCATION:Marseille")
  })

  it("encode une journée entière avec DTEND exclusif (lendemain)", () => {
    const ev: CalendarEvent = {
      uid: "n@odyssee",
      title: "Nuit",
      start: "2026-08-03",
      allDay: true,
    }
    const ics = buildIcs([ev], NOW)
    expect(ics).toContain("DTSTART;VALUE=DATE:20260803")
    expect(ics).toContain("DTEND;VALUE=DATE:20260804")
  })

  it("période multi-jours : DTEND = lendemain de la fin", () => {
    const ev: CalendarEvent = {
      uid: "s@odyssee",
      title: "Séjour",
      start: "2026-08-03",
      end: "2026-08-07",
      allDay: true,
    }
    const ics = buildIcs([ev], NOW)
    expect(ics).toContain("DTEND;VALUE=DATE:20260808")
  })

  it("utilise des fins de ligne CRLF", () => {
    expect(buildIcs([], NOW)).toContain("\r\n")
  })
})

describe("tripPlanToEvents", () => {
  it("convertit événements fixes (horaires) et nuitées (journée)", () => {
    const events = tripPlanToEvents({
      id: "trip1",
      days: [
        {
          date: "2026-08-08",
          location: "Marseille",
          lodging: { name: "Adagio" },
          events: [
            { id: "wed", name: "Mariage", hour: 11.5, location: { address: "258 bd Romain Rolland" } },
          ],
        },
      ],
    })
    const wedding = events.find((e) => e.title === "Mariage")
    expect(wedding?.allDay).toBe(false)
    expect(wedding?.start).toBe("2026-08-08T11:30")
    const night = events.find((e) => e.title.startsWith("Nuit"))
    expect(night?.allDay).toBe(true)
  })
})

describe("reservationsToEvents", () => {
  it("convertit en journées entières avec période et référence", () => {
    const events = reservationsToEvents([
      {
        id: "r1",
        type: "lodging",
        title: "Hôtel le Chapeau Rouge",
        startDate: "2026-08-03",
        endDate: "2026-08-07",
        location: "Dijon",
        confirmationNumber: "CHAP-778",
      },
    ])
    expect(events[0].allDay).toBe(true)
    expect(events[0].end).toBe("2026-08-07")
    expect(events[0].description).toContain("CHAP-778")
  })
})
