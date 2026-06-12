import { NextResponse } from "next/server";
import { TripRequestSchema } from "@/types";
import { runMockOrchestrator } from "@/lib/agents/mock-orchestrator";
import { runLiveOrchestrator } from "@/lib/agents/live-orchestrator";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const request = TripRequestSchema.parse(body);

    const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live";

    const startMs = Date.now();
    let plan;

    if (isLive && process.env.ANTHROPIC_API_KEY) {
      plan = await runLiveOrchestrator(request);
    } else {
      plan = await runMockOrchestrator(request);
    }

    return NextResponse.json({
      ok: true,
      plan,
      durationMs: Date.now() - startMs,
      mode: isLive && process.env.ANTHROPIC_API_KEY ? "live" : "mock",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { ok: false, error: "Données invalides", details: err.message },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Erreur interne";
    console.error("[agents/plan]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
