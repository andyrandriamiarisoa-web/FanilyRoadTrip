/**
 * Enrichissement post-génération des jambes de trajet (M7).
 *
 * `attachRealisticLegs` parcourt les journées du brouillon IA et calcule,
 * pour celles qui ont un `drivingFromTo`, une durée réaliste sourcée :
 *   parsing → géocodage → OSRM/seed/haversine → estimateRealisticLeg
 *
 * Best-effort : en cas d'échec (parsing, géocodage, route), `day.leg`
 * reste `undefined` — jamais de chiffre inventé.
 *
 * Réutilisé par le chemin LIVE (Claude) et le chemin MOCK.
 */

import { parseDrivingFromTo, geocodeCityLive } from "@/lib/routing/geocode"
import { getRoute } from "@/lib/providers/routing"
import { estimateRealisticLeg } from "@/lib/routing/realistic-time"
import type { AiItineraryDraft, RealisticLeg } from "./itinerary-types"

export interface AttachLegsOptions {
  babyOnboard: boolean
  isEv: boolean
}

/**
 * Calcule et attache un `leg` réaliste à chaque journée comportant un trajet.
 * Mute le draft passé en paramètre et le retourne pour faciliter le chaînage.
 */
export async function attachRealisticLegs(
  draft: AiItineraryDraft,
  opts: AttachLegsOptions,
): Promise<AiItineraryDraft> {
  const { babyOnboard, isEv } = opts

  await Promise.all(
    draft.days.map(async (day) => {
      if (!day.drivingFromTo || day.drivingFromTo.trim() === "") return

      // 1. Parser le trajet
      const parsed = parseDrivingFromTo(day.drivingFromTo)
      if (!parsed) return

      // 2. Géocoder les deux villes
      const [fromGeo, toGeo] = await Promise.all([
        geocodeCityLive(parsed.from),
        geocodeCityLive(parsed.to),
      ])
      if (!fromGeo || !toGeo) return

      // 3. Obtenir distance + durée fluide (OSRM > seed > haversine)
      let routeResult: Awaited<ReturnType<typeof getRoute>>
      try {
        routeResult = await getRoute({
          fromLat: fromGeo.lat,
          fromLng: fromGeo.lng,
          toLat: toGeo.lat,
          toLng: toGeo.lng,
        })
      } catch {
        return
      }

      // 4. Estimer la durée réaliste
      const estimate = estimateRealisticLeg({
        distanceKm: routeResult.distanceKm,
        freeFlowMinutes: routeResult.durationMinutes,
        date: day.date,
        babyOnboard,
        isEv,
      })

      // 5. Construire le leg (source = statut OSRM/seed/haversine)
      const leg: RealisticLeg = {
        fromTo: day.drivingFromTo,
        distanceKm: estimate.distanceKm,
        drivingMinutes: estimate.drivingMinutes,
        trafficMarginMinutes: estimate.trafficMarginMinutes,
        pauseMinutes: estimate.pauseMinutes,
        chargingMinutes: estimate.chargingMinutes,
        totalMinutes: estimate.totalMinutes,
        source: routeResult.sourceStatus,
        trafficNote: estimate.trafficNote,
      }

      day.leg = leg
    }),
  )

  return draft
}
