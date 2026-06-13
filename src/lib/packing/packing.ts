/**
 * Listes de bagages (M8) — générateur pur et déterministe.
 *
 * Produit une liste adaptée à **la durée, la saison et le bébé** (couches,
 * biberons, lit parapluie…), avec des quantités qui s'échelonnent sur la
 * durée. Couvre aussi le télétravail (workation) et le véhicule (Tesla).
 *
 * Aucun hasard : la même entrée produit toujours la même sortie.
 */

export type Season = "winter" | "spring" | "summer" | "autumn"

export type PackingCategory =
  | "baby"
  | "clothing"
  | "health"
  | "workation"
  | "vehicle"
  | "documents"
  | "misc"

export const CATEGORY_LABELS: Record<PackingCategory, string> = {
  baby: "Bébé",
  clothing: "Vêtements",
  health: "Santé & médical",
  workation: "Télétravail",
  vehicle: "Véhicule (Tesla)",
  documents: "Documents",
  misc: "Divers",
}

export interface PackingItem {
  /** Clé stable (catégorie + libellé) pour mémoriser l'état coché. */
  key: string
  label: string
  quantity: number
  /** Indispensable (mis en avant). */
  essential: boolean
  /** Pourquoi cet article est présent (durée, saison, bébé…). */
  reason: string
}

export interface PackingGroup {
  category: PackingCategory
  label: string
  items: PackingItem[]
}

export interface PackingInput {
  durationDays: number
  season: Season
  /** Âge du bébé en mois ; ≥ 36 = pas d'articles bébé spécifiques. */
  babyAgeMonths: number
  /** Voyage avec télétravail (workation). */
  isWorkation: boolean
  /** Nombre de voyageurs adultes/enfants (hors bébé). */
  travelers: number
}

export function seasonFromMonth(month: number): Season {
  if (month === 12 || month === 1 || month === 2) return "winter"
  if (month >= 3 && month <= 5) return "spring"
  if (month >= 6 && month <= 8) return "summer"
  return "autumn"
}

function slug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export function generatePackingList(input: PackingInput): PackingGroup[] {
  const days = Math.max(1, Math.round(input.durationDays))
  const isBaby = input.babyAgeMonths < 36
  const isSummer = input.season === "summer"
  const isWinter = input.season === "winter"

  const groups: Array<{ category: PackingCategory; raw: Omit<PackingItem, "key">[] }> = []

  // ── Bébé ────────────────────────────────────────────────────────────────
  if (isBaby) {
    const baby: Omit<PackingItem, "key">[] = [
      { label: "Couches", quantity: days * 6, essential: true, reason: `~6 / jour × ${days} j` },
      { label: "Lingettes (paquets)", quantity: Math.max(2, Math.ceil(days / 2)), essential: true, reason: "Hygiène quotidienne" },
      { label: "Tenues bébé", quantity: Math.min(days + 1, 12), essential: true, reason: "1 / jour + rechange" },
      { label: "Biberons", quantity: 4, essential: true, reason: "Rotation + lavage" },
      { label: "Lait infantile (boîtes)", quantity: Math.max(1, Math.ceil(days / 5)), essential: true, reason: "Réserve par tranche de 5 j" },
      { label: "Lit parapluie", quantity: 1, essential: true, reason: "Couchage bébé en hébergement" },
      { label: "Doudou & tétines", quantity: 2, essential: true, reason: "Sommeil / réconfort" },
      { label: "Poussette / porte-bébé", quantity: 1, essential: true, reason: "Sorties et étapes" },
    ]
    if (input.babyAgeMonths >= 4) {
      baby.push({ label: "Petits pots / repas", quantity: days * 2, essential: false, reason: "Diversification alimentaire" })
    }
    if (isSummer) {
      baby.push({ label: "Chapeau de soleil bébé", quantity: 1, essential: true, reason: "Été — protection solaire" })
      baby.push({ label: "Crème solaire bébé", quantity: 1, essential: true, reason: "Été — peau sensible" })
    }
    groups.push({ category: "baby", raw: baby })
  }

  // ── Vêtements ────────────────────────────────────────────────────────────
  const clothingSets = Math.min(days, 7)
  const clothing: Omit<PackingItem, "key">[] = [
    { label: "Tenues par personne", quantity: clothingSets, essential: true, reason: `${clothingSets} jeux (lessive au-delà de 7 j)` },
    { label: "Sous-vêtements (par pers.)", quantity: Math.min(days + 1, 10), essential: true, reason: "1 / jour + marge" },
    { label: "Chaussures confortables", quantity: 1, essential: true, reason: "Marche / étapes" },
  ]
  if (isSummer) {
    clothing.push({ label: "Maillots de bain", quantity: input.travelers, essential: false, reason: "Été — piscine / baignade" })
    clothing.push({ label: "Lunettes de soleil", quantity: input.travelers, essential: false, reason: "Été" })
  }
  if (isWinter) {
    clothing.push({ label: "Pulls / couches chaudes", quantity: 3, essential: true, reason: "Hiver — froid" })
    clothing.push({ label: "Manteau & bonnet", quantity: 1, essential: true, reason: "Hiver" })
  }
  groups.push({ category: "clothing", raw: clothing })

  // ── Santé & médical ──────────────────────────────────────────────────────
  groups.push({
    category: "health",
    raw: [
      { label: "Trousse à pharmacie", quantity: 1, essential: true, reason: "Premiers soins" },
      { label: "Traitements en cours (spondylarthrite)", quantity: 1, essential: true, reason: "Réserve pour tout le séjour" },
      { label: "Thermomètre", quantity: 1, essential: false, reason: "Surveillance bébé" },
      { label: "Doliprane bébé / adulte", quantity: 1, essential: true, reason: "Fièvre / douleur" },
      ...(isSummer
        ? [{ label: "Brumisateur & gourdes", quantity: input.travelers, essential: true, reason: "Été — hydratation (canicule)" }]
        : []),
    ],
  })

  // ── Télétravail ──────────────────────────────────────────────────────────
  if (input.isWorkation) {
    groups.push({
      category: "workation",
      raw: [
        { label: "Ordinateur portable + chargeur", quantity: 1, essential: true, reason: "Jours travaillés" },
        { label: "Casque audio (réunions)", quantity: 1, essential: true, reason: "Visioconférences" },
        { label: "Souris", quantity: 1, essential: false, reason: "Confort poste de travail" },
        { label: "Téléphone partage de connexion (secours 5G)", quantity: 1, essential: true, reason: "Secours si fibre HS" },
      ],
    })
  }

  // ── Véhicule (Tesla) ─────────────────────────────────────────────────────
  groups.push({
    category: "vehicle",
    raw: [
      { label: "Câble de recharge mobile + adaptateurs", quantity: 1, essential: true, reason: "Recharge hors Supercharger" },
      { label: "Carte / badge de recharge", quantity: 1, essential: false, reason: "Réseaux tiers" },
      { label: "Pare-soleil pour vitres", quantity: 2, essential: isSummer, reason: isSummer ? "Été — habitacle au frais" : "Confort" },
    ],
  })

  // ── Documents ────────────────────────────────────────────────────────────
  groups.push({
    category: "documents",
    raw: [
      { label: "Pièces d'identité", quantity: input.travelers + (isBaby ? 1 : 0), essential: true, reason: "Tous les voyageurs" },
      { label: "Carnet de santé bébé", quantity: isBaby ? 1 : 0, essential: isBaby, reason: "Suivi médical bébé" },
      { label: "Attestations d'hébergement / réservations", quantity: 1, essential: true, reason: "Check-in" },
      { label: "Carte vitale & mutuelle", quantity: 1, essential: true, reason: "Santé" },
    ].filter((i) => i.quantity > 0),
  })

  return groups.map((g) => ({
    category: g.category,
    label: CATEGORY_LABELS[g.category],
    items: g.raw.map((it) => ({ ...it, key: `${g.category}:${slug(it.label)}` })),
  }))
}

/** Nombre total d'articles essentiels (pour un indicateur de complétude). */
export function countEssentials(groups: PackingGroup[]): number {
  return groups.reduce((s, g) => s + g.items.filter((i) => i.essential).length, 0)
}
