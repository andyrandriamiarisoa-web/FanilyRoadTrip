import { NextResponse } from "next/server"
import { z } from "zod"
import { getWeather } from "@/lib/providers/weather"
import { deriveHeatAlert, type WeatherReading } from "@/lib/constraints/heat-alert"

/**
 * Relevés météo + **alerte chaleur** dérivée pour un ensemble de points
 * (origine, destination, arrêts de charge…) à une date donnée.
 *
 * La couche météo est interrogée **côté serveur** (mode seed en MOCK, Open-Meteo
 * en LIVE) — ne nécessite aucune clé et respecte la CSP (pas d'appel client
 * direct vers une API tierce). Sert au blocage 12h–16h conditionnel à la
 * canicule (Lot R1) : pas d'alerte → pas de blocage.
 */

const RequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  points: z
    .array(
      z.object({
        name: z.string().min(1),
        lat: z.number(),
        lng: z.number(),
      }),
    )
    .min(1)
    .max(20),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { date, points } = RequestSchema.parse(body)

    const weathers = await Promise.all(
      points.map(async (p) => {
        const w = await getWeather({ lat: p.lat, lng: p.lng, date })
        return { name: p.name, ...w }
      }),
    )

    const readings: WeatherReading[] = weathers.map((w) => ({
      name: w.name,
      tempMaxC: w.tempMaxC,
      heatwave: w.heatwave,
      sourceStatus: w.sourceStatus,
    }))

    return NextResponse.json({ ok: true, weathers, heatAlert: deriveHeatAlert(readings) })
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ ok: false, error: "Données invalides" }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : "Erreur interne"
    console.error("[api/weather]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
