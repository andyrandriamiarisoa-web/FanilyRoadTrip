/**
 * Budget & dépenses (M8) — logique pure et testée.
 *
 * Suit les dépenses du voyage, les ventile par poste, et **découpe** les
 * dépenses de groupe entre voyageurs (façon Lambus) : qui a payé quoi, qui
 * doit combien, et le **minimum de virements** pour solder les comptes.
 *
 * Tous les calculs se font en **centimes** (entiers) pour éviter les erreurs
 * d'arrondi en virgule flottante.
 */

export type ExpenseCategory =
  | "lodging"
  | "charging"
  | "food"
  | "activities"
  | "tolls"
  | "misc"

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "lodging",
  "charging",
  "food",
  "activities",
  "tolls",
  "misc",
]

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  lodging: "Hébergement",
  charging: "Recharge",
  food: "Restauration",
  activities: "Activités",
  tolls: "Péages",
  misc: "Divers",
}

export interface Expense {
  id: string
  category: ExpenseCategory
  label: string
  /** Montant en euros (positif). */
  amountEur: number
  date: string
  /** Voyageur ayant réglé la dépense. */
  paidBy: string
  /** Voyageurs se partageant la dépense (au moins un). */
  splitAmong: string[]
}

export interface CategoryTotal {
  category: ExpenseCategory
  label: string
  totalEur: number
  /** Part du total global, 0–100. */
  share: number
}

export interface TravelerBalance {
  traveler: string
  paidEur: number
  owedEur: number
  /** net = payé − dû. Positif : on lui doit de l'argent. */
  netEur: number
}

export interface Settlement {
  from: string
  to: string
  amountEur: number
}

const toCents = (eur: number): number => Math.round(eur * 100)
const toEur = (cents: number): number => Math.round(cents) / 100

export function totalSpent(expenses: Expense[]): number {
  return toEur(expenses.reduce((sum, e) => sum + toCents(e.amountEur), 0))
}

/** Ventilation par poste, triée par montant décroissant. */
export function totalByCategory(expenses: Expense[]): CategoryTotal[] {
  const totalCents = expenses.reduce((s, e) => s + toCents(e.amountEur), 0)
  const byCat = new Map<ExpenseCategory, number>()
  for (const e of expenses) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + toCents(e.amountEur))
  }
  return [...byCat.entries()]
    .map(([category, cents]) => ({
      category,
      label: CATEGORY_LABELS[category],
      totalEur: toEur(cents),
      share: totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0,
    }))
    .sort((a, b) => b.totalEur - a.totalEur)
}

export interface BudgetLine {
  category: ExpenseCategory
  label: string
  budgetEur: number
  spentEur: number
  remainingEur: number
  overBudget: boolean
}

/** Comparaison budget cible / dépensé par poste (postes connus du budget). */
export function budgetStatus(
  expenses: Expense[],
  budgets: Partial<Record<ExpenseCategory, number>>,
): BudgetLine[] {
  const spentByCat = new Map<ExpenseCategory, number>()
  for (const e of expenses) {
    spentByCat.set(e.category, (spentByCat.get(e.category) ?? 0) + toCents(e.amountEur))
  }
  return EXPENSE_CATEGORIES.filter((c) => budgets[c] !== undefined).map((category) => {
    const budgetCents = toCents(budgets[category] ?? 0)
    const spentCents = spentByCat.get(category) ?? 0
    return {
      category,
      label: CATEGORY_LABELS[category],
      budgetEur: toEur(budgetCents),
      spentEur: toEur(spentCents),
      remainingEur: toEur(budgetCents - spentCents),
      overBudget: spentCents > budgetCents,
    }
  })
}

/**
 * Solde par voyageur : ce qu'il a payé moins sa part des dépenses partagées.
 * Le reste de centime d'une division non exacte est attribué de façon
 * déterministe aux premiers participants (ordre de `splitAmong`).
 */
export function travelerBalances(
  expenses: Expense[],
  travelers: string[],
): TravelerBalance[] {
  const paid = new Map<string, number>()
  const owed = new Map<string, number>()
  for (const t of travelers) {
    paid.set(t, 0)
    owed.set(t, 0)
  }

  for (const e of expenses) {
    const cents = toCents(e.amountEur)
    paid.set(e.paidBy, (paid.get(e.paidBy) ?? 0) + cents)

    const sharers = e.splitAmong.length > 0 ? e.splitAmong : [e.paidBy]
    const base = Math.floor(cents / sharers.length)
    let remainder = cents - base * sharers.length
    for (const s of sharers) {
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      owed.set(s, (owed.get(s) ?? 0) + base + extra)
    }
  }

  return travelers.map((t) => {
    const p = paid.get(t) ?? 0
    const o = owed.get(t) ?? 0
    return { traveler: t, paidEur: toEur(p), owedEur: toEur(o), netEur: toEur(p - o) }
  })
}

/**
 * Règlements minimaux pour équilibrer les comptes : on apparie le plus gros
 * débiteur au plus gros créancier jusqu'à solde nul. Produit au plus n−1
 * virements. Déterministe (tri stable par montant puis nom).
 */
export function settleBalances(balances: TravelerBalance[]): Settlement[] {
  const debtors = balances
    .filter((b) => toCents(b.netEur) < 0)
    .map((b) => ({ name: b.traveler, cents: -toCents(b.netEur) }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
  const creditors = balances
    .filter((b) => toCents(b.netEur) > 0)
    .map((b) => ({ name: b.traveler, cents: toCents(b.netEur) }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))

  const settlements: Settlement[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].cents, creditors[j].cents)
    if (amount > 0) {
      settlements.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amountEur: toEur(amount),
      })
    }
    debtors[i].cents -= amount
    creditors[j].cents -= amount
    if (debtors[i].cents === 0) i++
    if (creditors[j].cents === 0) j++
  }
  return settlements
}
