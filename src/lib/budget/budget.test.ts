import { describe, it, expect } from "vitest"
import {
  totalSpent,
  totalByCategory,
  budgetStatus,
  travelerBalances,
  settleBalances,
  type Expense,
} from "./budget"

function exp(over: Partial<Expense> = {}): Expense {
  return {
    id: Math.random().toString(36),
    category: "food",
    label: "Déjeuner",
    amountEur: 30,
    date: "2026-08-03",
    paidBy: "Alice",
    splitAmong: ["Alice", "Bob"],
    ...over,
  }
}

describe("totalSpent", () => {
  it("somme les montants sans erreur d'arrondi", () => {
    const total = totalSpent([
      exp({ amountEur: 10.1 }),
      exp({ amountEur: 20.2 }),
      exp({ amountEur: 0.05 }),
    ])
    expect(total).toBe(30.35)
  })
  it("vaut 0 sans dépense", () => {
    expect(totalSpent([])).toBe(0)
  })
})

describe("totalByCategory", () => {
  it("ventile et trie par montant décroissant", () => {
    const cats = totalByCategory([
      exp({ category: "food", amountEur: 30 }),
      exp({ category: "lodging", amountEur: 200 }),
      exp({ category: "food", amountEur: 20 }),
    ])
    expect(cats[0].category).toBe("lodging")
    expect(cats[0].totalEur).toBe(200)
    expect(cats[1].category).toBe("food")
    expect(cats[1].totalEur).toBe(50)
    expect(cats[0].share + cats[1].share).toBe(100)
  })
})

describe("budgetStatus", () => {
  it("compare budget cible et dépensé, signale le dépassement", () => {
    const lines = budgetStatus(
      [exp({ category: "lodging", amountEur: 250 })],
      { lodging: 200, food: 100 },
    )
    const lodging = lines.find((l) => l.category === "lodging")!
    expect(lodging.spentEur).toBe(250)
    expect(lodging.remainingEur).toBe(-50)
    expect(lodging.overBudget).toBe(true)
    const food = lines.find((l) => l.category === "food")!
    expect(food.overBudget).toBe(false)
  })
})

describe("travelerBalances", () => {
  it("découpe une dépense partagée à parts égales", () => {
    // Alice paie 30, partagé Alice+Bob → chacun doit 15.
    const b = travelerBalances([exp({ amountEur: 30 })], ["Alice", "Bob"])
    const alice = b.find((x) => x.traveler === "Alice")!
    const bob = b.find((x) => x.traveler === "Bob")!
    expect(alice.netEur).toBe(15) // a payé 30, doit 15 → +15
    expect(bob.netEur).toBe(-15) // n'a rien payé, doit 15 → −15
  })

  it("répartit le centime résiduel de façon déterministe", () => {
    // 10,00 € / 3 = 3,34 + 3,33 + 3,33 (le 1er prend le centime en plus).
    const b = travelerBalances(
      [exp({ amountEur: 10, paidBy: "Alice", splitAmong: ["Alice", "Bob", "Cara"] })],
      ["Alice", "Bob", "Cara"],
    )
    const sumOwed = b.reduce((s, x) => s + x.owedEur, 0)
    expect(sumOwed).toBe(10) // pas de centime perdu
    const sumNet = b.reduce((s, x) => s + x.netEur, 0)
    expect(sumNet).toBe(0) // comptes équilibrés
  })
})

describe("settleBalances", () => {
  it("solde les comptes avec un minimum de virements", () => {
    const balances = travelerBalances(
      [
        exp({ amountEur: 60, paidBy: "Alice", splitAmong: ["Alice", "Bob", "Cara"] }),
        exp({ amountEur: 30, paidBy: "Bob", splitAmong: ["Alice", "Bob", "Cara"] }),
      ],
      ["Alice", "Bob", "Cara"],
    )
    const settlements = settleBalances(balances)
    // Cara doit 30 ; Alice a avancé 40, Bob 10 → Cara rembourse.
    const totalMoved = settlements.reduce((s, x) => s + x.amountEur, 0)
    expect(settlements.length).toBeLessThanOrEqual(2)
    expect(totalMoved).toBeGreaterThan(0)
    // Après règlement, chaque net est nul.
    const after = new Map(balances.map((b) => [b.traveler, b.netEur]))
    for (const s of settlements) {
      after.set(s.from, (after.get(s.from) ?? 0) + s.amountEur)
      after.set(s.to, (after.get(s.to) ?? 0) - s.amountEur)
    }
    for (const v of after.values()) expect(Math.abs(v)).toBeLessThan(0.01)
  })

  it("ne produit aucun virement si les comptes sont déjà équilibrés", () => {
    const balances = travelerBalances(
      [exp({ amountEur: 40, paidBy: "Alice", splitAmong: ["Alice"] })],
      ["Alice", "Bob"],
    )
    expect(settleBalances(balances)).toHaveLength(0)
  })

  it("est déterministe", () => {
    const balances = travelerBalances(
      [exp({ amountEur: 90, paidBy: "Alice", splitAmong: ["Alice", "Bob", "Cara"] })],
      ["Alice", "Bob", "Cara"],
    )
    expect(settleBalances(balances)).toEqual(settleBalances(balances))
  })
})
