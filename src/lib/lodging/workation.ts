/**
 * Conformité « workation » (M6) — pur et testé.
 *
 * Évalue un hébergement contre les exigences de télétravail du foyer
 * (bureau ≥ N cm, fibre + secours 5G, climatisation) et la contrainte
 * médicale (matelas ferme), à partir des équipements de l'hébergement et de
 * la couverture 5G SFR de la commune.
 *
 * ⚠️ Anti-pattern INTERDIT : on **classe** par conformité, on **n'élimine
 * jamais**. Les hébergements non conformes restent listés, clairement
 * signalés, et rétrogradés — la *recommandation* d'une nuit travaillée est le
 * meilleur hébergement conforme s'il en existe un.
 */

import type { LodgingOption } from "@/types"
import COVERAGE from "@/data/5g-coverage.json"
import COWORKING from "@/data/coworking.json"

export type ConformityStatus = "conforme" | "à confirmer" | "non conforme"

export type CoverageQuality = "insufficient" | "fair" | "good" | "excellent"

interface CoverageRow {
  commune: string
  quality: CoverageQuality
  estimatedMbps?: number
}

const COVERAGE_ROWS = COVERAGE as CoverageRow[]

interface CoworkingRow {
  commune: string
  name: string
  minutesBySkateboard: number
  hasFiber: boolean
  hasAc: boolean
}

const COWORKING_ROWS = COWORKING as CoworkingRow[]

export interface SharedOffice {
  name: string
  minutesBySkateboard: number
  hasFiber: boolean
  hasAc: boolean
}

export interface WorkationContext {
  requiresDeskCm: number
  requiresFiber: boolean
  fallback5G: boolean
  acRequired: boolean
  firmMattressRequired: boolean
  coverageQuality?: CoverageQuality
  coverageMbps?: number
  /** Le foyer autorise un bureau partagé à proximité comme alternative. */
  allowSharedOffice?: boolean
  /** Distance maximale tolérée pour un bureau partagé (min de skateboard). */
  maxOfficeMinutesSkateboard?: number
  /** Bureau partagé connu près du lieu de couchage (le cas échéant). */
  sharedOffice?: SharedOffice | null
}

export interface WorkationCriterion {
  key: "desk" | "ac" | "connectivity" | "firmMattress"
  label: string
  status: ConformityStatus
  detail: string
}

export interface WorkationAssessment {
  overall: ConformityStatus
  criteria: WorkationCriterion[]
  /** 0–100, pour le classement (jamais pour exclure). */
  conformityScore: number
  /** Bureau partagé proche utilisé pour satisfaire le poste de travail. */
  sharedOfficeUsed: SharedOffice | null
  /**
   * Late checkout assoupli : un bureau partagé proche évite de devoir
   * travailler dans la chambre jusqu'au départ, donc l'exigence de late
   * checkout n'est plus bloquante.
   */
  lateCheckoutSoftened: boolean
}

/** Normalise un nom de commune (minuscule, sans accents/apostrophes). */
function normalizeCommune(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Couverture 5G SFR connue pour une commune, sinon null. */
export function getCoverageForCommune(
  commune: string,
): { quality: CoverageQuality; estimatedMbps?: number } | null {
  const target = normalizeCommune(commune)
  const row = COVERAGE_ROWS.find((r) => normalizeCommune(r.commune) === target)
  return row ? { quality: row.quality, estimatedMbps: row.estimatedMbps } : null
}

/** Bureau partagé connu pour une commune (le plus proche), sinon null. */
export function getCoworkingForCommune(commune: string): SharedOffice | null {
  const target = normalizeCommune(commune)
  const rows = COWORKING_ROWS.filter((r) => normalizeCommune(r.commune) === target)
  if (rows.length === 0) return null
  const closest = rows.reduce((a, b) =>
    b.minutesBySkateboard < a.minutesBySkateboard ? b : a,
  )
  return {
    name: closest.name,
    minutesBySkateboard: closest.minutesBySkateboard,
    hasFiber: closest.hasFiber,
    hasAc: closest.hasAc,
  }
}

const STATUS_SCORE: Record<ConformityStatus, number> = {
  conforme: 100,
  "à confirmer": 60,
  "non conforme": 0,
}

const COVERAGE_STATUS: Record<CoverageQuality, ConformityStatus> = {
  excellent: "conforme",
  good: "conforme",
  fair: "à confirmer",
  insufficient: "non conforme",
}

export function assessWorkation(
  lodging: LodgingOption,
  ctx: WorkationContext,
): WorkationAssessment {
  const criteria: WorkationCriterion[] = []

  // Bureau partagé proche utilisable (alternative au poste en chambre) ?
  const office = ctx.sharedOffice ?? null
  const sharedOfficeUsable =
    (ctx.allowSharedOffice ?? false) &&
    office !== null &&
    office.minutesBySkateboard <= (ctx.maxOfficeMinutesSkateboard ?? 10)

  // Bureau : poste en chambre OU bureau partagé proche.
  const lodgingDeskConforme = lodging.amenities.desk && !lodging.toConfirm.includes("desk32")
  if (lodgingDeskConforme) {
    criteria.push({
      key: "desk",
      label: "Bureau",
      status: "conforme",
      detail: `Bureau ≥ ${ctx.requiresDeskCm} cm.`,
    })
  } else if (sharedOfficeUsable && office) {
    criteria.push({
      key: "desk",
      label: "Bureau",
      status: "conforme",
      detail: `Bureau partagé « ${office.name} » à ${office.minutesBySkateboard} min en skateboard.`,
    })
  } else if (lodging.amenities.desk) {
    criteria.push({
      key: "desk",
      label: "Bureau",
      status: "à confirmer",
      detail: `Bureau présent ; dimension ≥ ${ctx.requiresDeskCm} cm à confirmer.`,
    })
  } else {
    criteria.push({
      key: "desk",
      label: "Bureau",
      status: "non conforme",
      detail: "Aucun poste de travail (ni en chambre, ni en bureau partagé proche).",
    })
  }

  // Climatisation (médical + bébé).
  if (ctx.acRequired) {
    criteria.push({
      key: "ac",
      label: "Climatisation",
      status: lodging.amenities.ac ? "conforme" : "non conforme",
      detail: lodging.amenities.ac ? "Climatisation présente." : "Pas de climatisation.",
    })
  }

  // Connectivité : 5G SFR vérifiable (secours) ; fibre à confirmer par logement.
  const covStatus: ConformityStatus = ctx.coverageQuality
    ? COVERAGE_STATUS[ctx.coverageQuality]
    : "à confirmer"
  const mbps = ctx.coverageMbps ? ` (~${ctx.coverageMbps} Mbit/s)` : ""
  const connDetail =
    covStatus === "non conforme"
      ? `Couverture 5G SFR insuffisante${mbps}.`
      : covStatus === "conforme"
        ? `5G SFR de secours OK${mbps}${ctx.requiresFiber ? " · fibre à confirmer" : ""}.`
        : `Couverture 5G SFR à vérifier${mbps}${ctx.requiresFiber ? " · fibre à confirmer" : ""}.`
  criteria.push({ key: "connectivity", label: "Connectivité", status: covStatus, detail: connDetail })

  // Matelas ferme (médical).
  if (ctx.firmMattressRequired) {
    const firm = lodging.toConfirm.includes("firmMattress")
    criteria.push({
      key: "firmMattress",
      label: "Matelas ferme",
      status: firm ? "à confirmer" : "conforme",
      detail: firm ? "Fermeté du matelas à confirmer." : "Matelas ferme confirmé.",
    })
  }

  const overall: ConformityStatus = criteria.some((c) => c.status === "non conforme")
    ? "non conforme"
    : criteria.some((c) => c.status === "à confirmer")
      ? "à confirmer"
      : "conforme"

  const conformityScore = Math.round(
    criteria.reduce((s, c) => s + STATUS_SCORE[c.status], 0) / criteria.length,
  )

  return {
    overall,
    criteria,
    conformityScore,
    sharedOfficeUsed: sharedOfficeUsable ? office : null,
    // Un bureau partagé proche dispense de travailler dans la chambre jusqu'au
    // départ : l'exigence de late checkout devient non bloquante.
    lateCheckoutSoftened: sharedOfficeUsable,
  }
}

export interface WorkationRankedLodging {
  lodging: LodgingOption
  assessment: WorkationAssessment
}

/**
 * Classe les hébergements pour une **nuit travaillée** par conformité
 * workation décroissante, sans en exclure aucun. En cas d'égalité, on
 * départage par la note puis le prix/nuit.
 */
export function rankForWorkationNight(
  lodgings: LodgingOption[],
  resolveCtx: (lodging: LodgingOption) => WorkationContext,
): WorkationRankedLodging[] {
  return lodgings
    .map((lodging) => ({ lodging, assessment: assessWorkation(lodging, resolveCtx(lodging)) }))
    .sort((a, b) => {
      if (b.assessment.conformityScore !== a.assessment.conformityScore) {
        return b.assessment.conformityScore - a.assessment.conformityScore
      }
      const ratingDiff = (b.lodging.rating ?? 0) - (a.lodging.rating ?? 0)
      if (ratingDiff !== 0) return ratingDiff
      return pricePerNight(a.lodging) - pricePerNight(b.lodging)
    })
}

/**
 * Recommandation pour une nuit travaillée : le meilleur hébergement **non
 * disqualifié** (overall ≠ « non conforme ») s'il en existe un, sinon le
 * mieux classé (signalé non conforme) — jamais d'exclusion silencieuse.
 */
export function recommendForWorkationNight(
  ranked: WorkationRankedLodging[],
): WorkationRankedLodging | null {
  if (ranked.length === 0) return null
  return ranked.find((r) => r.assessment.overall !== "non conforme") ?? ranked[0]
}

function pricePerNight(o: LodgingOption): number {
  return o.nights > 0 ? o.priceTotal / o.nights : o.priceTotal
}
