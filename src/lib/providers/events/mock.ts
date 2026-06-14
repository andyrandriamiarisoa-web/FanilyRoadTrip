import type { EventsProvider, BBox, DateRange } from "./types";
import type { Opportunity } from "@/lib/synthesis/types";
import { SEED_EVENTS } from "@/data/synthesis-fixtures";

export class MockEventsProvider implements EventsProvider {
  async search(bbox: BBox, range: DateRange): Promise<Opportunity[]> {
    return SEED_EVENTS.filter((e: Opportunity) => {
      const inBox = e.location.lat >= bbox.minLat && e.location.lat <= bbox.maxLat
        && e.location.lng >= bbox.minLng && e.location.lng <= bbox.maxLng;
      const w = e.timeWindow;
      const inRange = !w || (w.start <= range.end && w.end >= range.start);
      return inBox && inRange;
    });
  }
}
