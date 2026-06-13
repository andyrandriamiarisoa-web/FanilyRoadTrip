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

export type ConformityStatus = "conforme" | "à confirmer" | "non conforme"

export type CoverageQuality = "insufficient" | "fair" | "good" | "excellent"

interface CoverageRow {
  commune: string
  quality: CoverageQuality
  estimatedMbps?: number
}

const COVERAGE_ROWS = COVERAGE as CoverageRow[]

export interface WorkationContext {
  requiresDeskCm: number
  requiresFiber: boolean
  fallback5G: boolean
  acRequired: boolean
  firmMattressRequired: boolean
  coverageQuality?: CoverageQuality
  coverageMbps?: number
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

  // Bureau : présence requise, dimension à confirmer si signalée.
  if (!lodging.amenities.desk) {
    criteria.push({
      key: "desk",
      label: "Bureau",
      status: "non conforme",
      detail: "Aucun poste de travail signalé.",
    })
  } else if (lodging.toConfirm.includes("desk32")) {
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
      status: "conforme",
      detail: `Bureau ≥ ${ctx.requiresDeskCm} cm.`,
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

  return { overall, criteria, conformityScore }
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
