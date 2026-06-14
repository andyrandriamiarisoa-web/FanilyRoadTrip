import { z } from "zod";
import type { EventsProvider, BBox, DateRange } from "./types";
import type { Opportunity } from "@/lib/synthesis/types";
import { MockEventsProvider } from "./mock";

// OpenAgenda — API REST gratuite, événements sous licence ouverte (festivals, expos, concerts…).
// Docs : https://developers.openagenda.com  (accès en lecture via une clé publique gratuite)
// NOTE : l'endpoint/params exacts peuvent évoluer ; en cas d'erreur on dégrade proprement
// vers le mock (jamais d'invention — anti-pattern #3).

const OAEvent = z.object({
  uid: z.union([z.string(), z.number()]),
  title: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  location: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    name: z.string().optional(),
  }).optional(),
  firstTiming: z.object({ begin: z.string(), end: z.string() }).optional(),
  lastTiming: z.object({ begin: z.string(), end: z.string() }).optional(),
}).passthrough();
const OAResponse = z.object({ events: z.array(OAEvent) }).passthrough();

function asText(t: unknown): string {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") { const r = t as Record<string, string>; return r.fr ?? Object.values(r)[0] ?? "Événement"; }
  return "Événement";
}

export class OpenAgendaEventsProvider implements EventsProvider {
  constructor(private key: string, private fallback: EventsProvider = new MockEventsProvider()) {}

  async search(bbox: BBox, range: DateRange): Promise<Opportunity[]> {
    try {
      const url = new URL("https://api.openagenda.com/v2/events");
      url.searchParams.set("key", this.key);
      url.searchParams.set("geo[northEast][lat]", String(bbox.maxLat));
      url.searchParams.set("geo[northEast][lng]", String(bbox.maxLng));
      url.searchParams.set("geo[southWest][lat]", String(bbox.minLat));
      url.searchParams.set("geo[southWest][lng]", String(bbox.minLng));
      url.searchParams.set("timings[gte]", range.start);
      url.searchParams.set("timings[lte]", range.end);
      url.searchParams.set("size", "50");
      const res = await fetch(url, { headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`OpenAgenda ${res.status}`);
      const parsed = OAResponse.parse(await res.json());
      return parsed.events.flatMap((e): Opportunity[] => {
        const lat = e.location?.latitude, lng = e.location?.longitude;
        if (lat == null || lng == null) return [];
        const t = e.firstTiming ?? e.lastTiming;
        return [{
          id: `oa-${e.uid}`,
          title: asText(e.title),
          category: "event",
          location: { lat, lng },
          score: 0.7,
          durationMin: 120,
          timeWindow: t ? { start: t.begin, end: t.end } : undefined,
          source: "OpenAgenda",
          sourceStatus: "verified",
        }];
      });
    } catch {
      return this.fallback.search(bbox, range);
    }
  }
}
