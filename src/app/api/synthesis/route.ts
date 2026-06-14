import { NextRequest, NextResponse } from "next/server";
import { SynthesisRequestSchema } from "@/lib/synthesis/schemas";
import { generateCandidates } from "@/lib/synthesis/candidates";
import { exploreDateFlex } from "@/lib/synthesis/date-flex";
import { createSynthesisAdapters } from "@/lib/synthesis/wiring";

export async function POST(req: NextRequest) {
  const parsed = SynthesisRequestSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Requête invalide", issues: parsed.error.issues }, { status: 400 });

  const adapters = createSynthesisAdapters();
  const data = parsed.data;

  // Enrichissement : événements datés (OpenAgenda) le long du corridor.
  const pts = [data.window.origin, ...data.anchors.map(a => a.location), ...data.opportunities.map(o => o.location)];
  const bbox = {
    minLat: Math.min(...pts.map(p => p.lat)), maxLat: Math.max(...pts.map(p => p.lat)),
    minLng: Math.min(...pts.map(p => p.lng)), maxLng: Math.max(...pts.map(p => p.lng)),
  };
  const events = adapters.events
    ? await adapters.events.search(bbox, { start: data.window.earliestStart, end: data.window.latestEnd })
    : [];
  const enriched = { ...data, opportunities: [...data.opportunities, ...events] };

  try {
    const candidates = await generateCandidates(enriched, adapters);
    const dateOptions = await exploreDateFlex(enriched, adapters, { maxOptions: 7 });
    return NextResponse.json({ candidates, dateOptions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur de synthèse" }, { status: 500 });
  }
}
