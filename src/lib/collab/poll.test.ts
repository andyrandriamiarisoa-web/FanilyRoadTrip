import { describe, it, expect } from "vitest"
import {
  emptyPoll,
  addOption,
  toggleVote,
  tally,
  voters,
  mergePolls,
  defaultPoll,
  type Poll,
} from "./poll"

describe("addOption", () => {
  it("ajoute une option avec id stable, sans doublon", () => {
    let p = addOption(emptyPoll(), "Visite du musée")
    p = addOption(p, "Visite du musée") // doublon → ignoré
    expect(p.options).toHaveLength(1)
    expect(p.options[0].id).toBe("visite-du-musee")
  })
  it("ignore un libellé vide", () => {
    expect(addOption(emptyPoll(), "  ").options).toHaveLength(0)
  })
})

describe("toggleVote", () => {
  const base: Poll = addOption(emptyPoll(), "Piscine")
  const optId = base.options[0].id

  it("ajoute puis retire le vote d'un votant", () => {
    let p = toggleVote(base, "Alice", optId)
    expect(p.votes).toHaveLength(1)
    p = toggleVote(p, "Alice", optId)
    expect(p.votes).toHaveLength(0)
  })

  it("autorise plusieurs votants sur une même option (approbation)", () => {
    let p = toggleVote(base, "Alice", optId)
    p = toggleVote(p, "Bob", optId)
    expect(tally(p)[0].count).toBe(2)
  })

  it("ignore un votant vide", () => {
    expect(toggleVote(base, "  ", optId).votes).toHaveLength(0)
  })
})

describe("tally", () => {
  it("trie par nombre d'approbations décroissant", () => {
    let p = emptyPoll()
    p = addOption(p, "A")
    p = addOption(p, "B")
    const a = p.options[0].id
    const b = p.options[1].id
    p = toggleVote(p, "Alice", b)
    p = toggleVote(p, "Bob", b)
    p = toggleVote(p, "Alice", a)
    const t = tally(p)
    expect(t[0].optionId).toBe(b)
    expect(t[0].count).toBe(2)
    expect(t[0].voters).toEqual(["Alice", "Bob"])
  })
})

describe("mergePolls — partage sans serveur", () => {
  it("fusionne options et votes en dédupliquant", () => {
    let a = addOption(emptyPoll(), "Piscine")
    const opt = a.options[0].id
    a = toggleVote(a, "Alice", opt)

    let b = addOption(emptyPoll(), "Piscine") // même option (id stable)
    b = addOption(b, "Musée")
    b = toggleVote(b, "Bob", opt)
    b = toggleVote(b, "Alice", opt) // doublon d'Alice

    const merged = mergePolls(a, b)
    expect(merged.options).toHaveLength(2)
    expect(merged.votes.filter((v) => v.optionId === opt)).toHaveLength(2) // Alice + Bob, pas de doublon
    expect(voters(merged)).toEqual(["Alice", "Bob"])
  })

  it("est idempotente et commutative sur les ensembles", () => {
    const a = toggleVote(addOption(emptyPoll(), "X"), "Alice", "x")
    const b = toggleVote(addOption(emptyPoll(), "Y"), "Bob", "y")
    const ab = mergePolls(a, b)
    const ba = mergePolls(b, a)
    expect(new Set(ab.votes.map((v) => `${v.voter}:${v.optionId}`))).toEqual(
      new Set(ba.votes.map((v) => `${v.voter}:${v.optionId}`)),
    )
    expect(mergePolls(ab, ab)).toEqual(ab) // idempotent
  })

  it("ignore les votes orphelins (option absente)", () => {
    const a: Poll = { options: [], votes: [{ voter: "Alice", optionId: "ghost" }] }
    expect(mergePolls(a, emptyPoll()).votes).toHaveLength(0)
  })
})

describe("defaultPoll", () => {
  it("amorce des activités candidates", () => {
    expect(defaultPoll().options.length).toBeGreaterThan(3)
  })
})
