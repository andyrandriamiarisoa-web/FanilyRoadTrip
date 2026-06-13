/**
 * Extraction déterministe de réservation (M8) — heuristiques, sans réseau.
 *
 * Détecte le type, les dates, le numéro de confirmation et le prestataire à
 * partir d'un texte de confirmation collé. Robuste aux formats FR courants.
 */

import type { ReservationDraft, ReservationType } from "./reservation-types"

const MONTHS_FR: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
}

const TYPE_KEYWORDS: Array<{ type: ReservationType; words: RegExp }> = [
  { type: "flight", words: /\b(vol|flight|avion|a[ée]roport|embarquement|easyjet|air france|boarding)\b/i },
  { type: "train", words: /\b(train|sncf|tgv|ouigo|inoui|gare|billet|voie|quai)\b/i },
  { type: "car", words: /\b(location de voiture|car rental|hertz|sixt|europcar|avis|rental)\b/i },
  { type: "lodging", words: /\b(h[ôo]tel|booking|airbnb|chambre|nuit|check[\s-]?in|s[ée]jour|g[îi]te|logement|appartement)\b/i },
  { type: "activity", words: /\b(restaurant|table|mus[ée]e|visite|billet d['’]entr[ée]e|spectacle|activit[ée])\b/i },
]

const PROVIDERS = [
  "Booking", "Airbnb", "SNCF", "OUIGO", "TGV INOUI", "Air France", "EasyJet",
  "Hertz", "Sixt", "Europcar", "Avis", "Expedia", "Hotels.com",
]

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Extrait toutes les dates (YYYY-MM-DD) dans l'ordre d'apparition. */
function extractDates(text: string): string[] {
  const dates: Array<{ pos: number; iso: string }> = []

  // ISO YYYY-MM-DD
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    dates.push({ pos: m.index ?? 0, iso: `${m[1]}-${m[2]}-${m[3]}` })
  }
  // DD/MM/YYYY ou DD/MM/YY
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    dates.push({ pos: m.index ?? 0, iso: `${year}-${pad(+m[2])}-${pad(+m[1])}` })
  }
  // « 8 août 2026 »
  const normText = normalize(text)
  for (const m of normText.matchAll(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/g)) {
    const month = MONTHS_FR[m[2]]
    if (month) dates.push({ pos: m.index ?? 0, iso: `${m[3]}-${pad(month)}-${pad(+m[1])}` })
  }

  return dates
    .sort((a, b) => a.pos - b.pos)
    .map((d) => d.iso)
    .filter((iso, i, arr) => arr.indexOf(iso) === i)
}

function detectType(text: string): ReservationType {
  for (const { type, words } of TYPE_KEYWORDS) {
    if (words.test(text)) return type
  }
  return "other"
}

function extractConfirmation(text: string): string | undefined {
  const m = text.match(
    /(?:confirmation|r[ée]f[ée]rence|reference|r[ée]servation|booking|dossier|n[°o]|numero)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})/i,
  )
  return m ? m[1].toUpperCase() : undefined
}

function extractProvider(text: string): string | undefined {
  const norm = normalize(text)
  for (const p of PROVIDERS) {
    if (norm.includes(normalize(p))) return p
  }
  return undefined
}

function firstMeaningfulLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && !/^(bonjour|hello|cher|chère|madame|monsieur)/i.test(l))
  return (lines[0] ?? "Réservation").slice(0, 120)
}

/** Devine un lieu : ligne contenant un code postal FR ou « à <Ville> ». */
function extractLocation(text: string): string | undefined {
  const cp = text.match(/\b\d{5}\s+[A-ZÀ-Ÿ][\wÀ-ÿ'’ -]+/)
  if (cp) return cp[0].trim().slice(0, 80)
  const ville = text.match(/\b[àa]\s+([A-ZÀ-Ÿ][\wÀ-ÿ'’-]+)\b/)
  return ville ? ville[1] : undefined
}

export function parseReservation(text: string): ReservationDraft {
  const type = detectType(text)
  const dates = extractDates(text)
  const startDate = dates[0] ?? ""
  const endDate = dates.length > 1 ? dates[dates.length - 1] : undefined

  return {
    type,
    title: firstMeaningfulLine(text),
    provider: extractProvider(text),
    confirmationNumber: extractConfirmation(text),
    startDate,
    endDate: endDate && endDate !== startDate ? endDate : undefined,
    location: extractLocation(text),
  }
}
