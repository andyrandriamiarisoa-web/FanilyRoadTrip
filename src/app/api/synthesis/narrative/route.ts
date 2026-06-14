import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TripCandidateSchema } from "@/lib/synthesis/schemas";
import { buildNarrativePrompt, templateNarrative } from "@/lib/synthesis/narrative";
import type { TripCandidate } from "@/lib/synthesis/types";

const MODEL = "claude-sonnet-4-6";

const RequestSchema = z.object({
  candidate: TripCandidateSchema,
  familyNames: z.array(z.string()).optional(),
});

/**
 * Récit IA (S6) — *barde, pas inventeur*. Sur un candidat **déjà validé** par
 * le solveur, Claude habille l'itinéraire jour par jour **sans inventer** de
 * fait vérifiable. Sans clé (ou en cas d'erreur), repli déterministe et gratuit
 * sur le **gabarit** (`templateNarrative`). La clé n'est lue que côté serveur.
 */
export async function POST(req: NextRequest) {
  const parsed = RequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const candidate = parsed.data.candidate as TripCandidate;
  const familyNames = parsed.data.familyNames;

  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live";
  if (!isLive || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ text: templateNarrative(candidate), source: "template" });
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { system, user } = buildNarrativePrompt(candidate, { familyNames });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4_096,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) throw new Error("Récit IA vide");
    return NextResponse.json({ text, source: "ai" });
  } catch (err) {
    console.warn("[synthesis/narrative] Repli gabarit :", err instanceof Error ? err.message : err);
    return NextResponse.json({ text: templateNarrative(candidate), source: "template" });
  }
}
