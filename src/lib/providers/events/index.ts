import type { EventsProvider } from "./types";
import { MockEventsProvider } from "./mock";
import { OpenAgendaEventsProvider } from "./openagenda";

export * from "./types";

export function getEventsProvider(): EventsProvider {
  const key = process.env.OPENAGENDA_PUBLIC_KEY;
  const mode = process.env.NEXT_PUBLIC_APP_MODE ?? "mock";
  if (mode === "live" && key) return new OpenAgendaEventsProvider(key);
  return new MockEventsProvider();
}
