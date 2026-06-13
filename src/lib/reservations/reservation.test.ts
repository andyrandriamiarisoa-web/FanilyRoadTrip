import { describe, it, expect } from "vitest"
import { parseReservation } from "./reservation-parse"
import { ReservationDraftSchema } from "./reservation-types"

describe("parseReservation — type", () => {
  it("détecte un hébergement", () => {
    const r = parseReservation("Confirmation Booking — Hôtel le Chapeau Rouge, séjour 2 nuits")
    expect(r.type).toBe("lodging")
    expect(r.provider).toBe("Booking")
  })
  it("détecte un train", () => {
    expect(parseReservation("Votre billet SNCF TGV INOUI Paris → Marseille").type).toBe("train")
  })
  it("détecte un vol", () => {
    expect(parseReservation("Votre vol Air France AF1234, embarquement").type).toBe("flight")
  })
  it("détecte une location de voiture", () => {
    expect(parseReservation("Location de voiture Hertz, prise en charge").type).toBe("car")
  })
  it("retombe sur « other » sans indice", () => {
    expect(parseReservation("Merci pour votre achat").type).toBe("other")
  })
})

describe("parseReservation — dates", () => {
  it("extrait une date ISO", () => {
    expect(parseReservation("Arrivée le 2026-08-03").startDate).toBe("2026-08-03")
  })
  it("extrait une date JJ/MM/AAAA", () => {
    expect(parseReservation("Check-in 03/08/2026").startDate).toBe("2026-08-03")
  })
  it("extrait une date en toutes lettres", () => {
    expect(parseReservation("Le 8 août 2026 à 11h30").startDate).toBe("2026-08-08")
  })
  it("capture début et fin d'un séjour", () => {
    const r = parseReservation("Hôtel — du 03/08/2026 au 07/08/2026, chambre double")
    expect(r.startDate).toBe("2026-08-03")
    expect(r.endDate).toBe("2026-08-07")
  })
})

describe("parseReservation — confirmation & titre", () => {
  it("extrait un numéro de confirmation", () => {
    const r = parseReservation("Hôtel Dijon\nConfirmation : ABC12345\nArrivée 2026-08-03")
    expect(r.confirmationNumber).toBe("ABC12345")
  })
  it("ignore les lignes de politesse pour le titre", () => {
    const r = parseReservation("Bonjour Andy,\nHôtel le Chapeau Rouge\nséjour")
    expect(r.title).toBe("Hôtel le Chapeau Rouge")
  })
  it("produit un brouillon conforme au schéma", () => {
    const r = parseReservation("Hôtel le Chapeau Rouge, Dijon, 2026-08-03, confirmation: XY99")
    expect(() => ReservationDraftSchema.parse(r)).not.toThrow()
  })
})

describe("parseReservation — réalisme", () => {
  it("extrait une confirmation hôtel complète", () => {
    const email = `Bonjour,
Votre réservation est confirmée.
Hôtel le Chapeau Rouge
5 Rue Michelet, 21000 Dijon
Arrivée : 03/08/2026 — Départ : 07/08/2026
Référence : CHAP-2026-778
Booking.com`
    const r = parseReservation(email)
    expect(r.type).toBe("lodging")
    expect(r.provider).toBe("Booking")
    expect(r.startDate).toBe("2026-08-03")
    expect(r.endDate).toBe("2026-08-07")
    expect(r.confirmationNumber).toBe("CHAP-2026-778")
    expect(r.location).toMatch(/Dijon/)
  })

  it("est déterministe", () => {
    const t = "TGV INOUI 6543 — 2026-08-01 — réf TRAIN999"
    expect(parseReservation(t)).toEqual(parseReservation(t))
  })
})
