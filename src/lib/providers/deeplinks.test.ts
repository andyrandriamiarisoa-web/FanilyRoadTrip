import { describe, it, expect } from "vitest"
import { generateBookingLinks } from "./deeplinks"

// Reference request: Dijon, 4 nights (2026-07-31 → 2026-08-04), 2 adults, 1 child
const DIJON_OPTS = {
  city: "Dijon",
  checkin: "2026-07-31",
  checkout: "2026-08-04",
  adults: 2,
  children: 1,
}

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

describe("generateBookingLinks", () => {
  it("returns exactly 5 links", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    expect(links).toHaveLength(5)
  })

  it("returns one link for each expected platform", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const platforms = links.map((l) => l.platform)
    expect(platforms).toContain("booking")
    expect(platforms).toContain("airbnb")
    expect(platforms).toContain("abritel")
    expect(platforms).toContain("google")
    expect(platforms).toContain("trivago")
  })

  it("all URLs are non-empty strings", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    for (const link of links) {
      expect(typeof link.url).toBe("string")
      expect(link.url.length).toBeGreaterThan(0)
    }
  })

  it("all URLs start with https://", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    for (const link of links) {
      expect(link.url).toMatch(/^https:\/\//)
    }
  })
})

// ---------------------------------------------------------------------------
// Date encoding
// ---------------------------------------------------------------------------

describe("checkin/checkout date encoding", () => {
  it("Booking.com URL contains checkin and checkout dates", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const booking = links.find((l) => l.platform === "booking")!
    expect(booking.url).toContain("checkin=2026-07-31")
    expect(booking.url).toContain("checkout=2026-08-04")
  })

  it("Airbnb URL contains checkin and checkout dates", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const airbnb = links.find((l) => l.platform === "airbnb")!
    expect(airbnb.url).toContain("checkin=2026-07-31")
    expect(airbnb.url).toContain("checkout=2026-08-04")
  })

  it("Abritel URL contains startDate and endDate", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const abritel = links.find((l) => l.platform === "abritel")!
    expect(abritel.url).toContain("startDate=2026-07-31")
    expect(abritel.url).toContain("endDate=2026-08-04")
  })

  it("Google Hotels URL encodes dates in the expected format", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const google = links.find((l) => l.platform === "google")!
    expect(google.url).toContain("2026-07-31")
    expect(google.url).toContain("2026-08-04")
  })

  it("Trivago URL contains check-in and check-out dates", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const trivago = links.find((l) => l.platform === "trivago")!
    expect(trivago.url).toContain("2026-07-31")
    expect(trivago.url).toContain("2026-08-04")
  })
})

// ---------------------------------------------------------------------------
// Guest count encoding
// ---------------------------------------------------------------------------

describe("adult and children counts", () => {
  it("Booking.com encodes group_adults and group_children", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const booking = links.find((l) => l.platform === "booking")!
    expect(booking.url).toContain("group_adults=2")
    expect(booking.url).toContain("group_children=1")
  })

  it("Airbnb encodes adults and children", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const airbnb = links.find((l) => l.platform === "airbnb")!
    expect(airbnb.url).toContain("adults=2")
    expect(airbnb.url).toContain("children=1")
  })

  it("Abritel encodes adults and children", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const abritel = links.find((l) => l.platform === "abritel")!
    expect(abritel.url).toContain("adults=2")
    expect(abritel.url).toContain("children=1")
  })
})

// ---------------------------------------------------------------------------
// City encoding
// ---------------------------------------------------------------------------

describe("city name encoding", () => {
  it("encodes city with accents correctly in Booking.com URL", () => {
    const links = generateBookingLinks({
      city: "Montélimar",
      checkin: "2026-08-09",
      checkout: "2026-08-11",
      adults: 2,
      children: 1,
    })
    const booking = links.find((l) => l.platform === "booking")!
    // encodeURIComponent("Montélimar") = "Mont%C3%A9limar"
    expect(booking.url).toContain("Mont%C3%A9limar")
  })

  it("Dijon appears in all platform URLs", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    for (const link of links) {
      expect(link.url.toLowerCase()).toContain("dijon")
    }
  })

  it("encodes Mâcon with accent in Airbnb URL", () => {
    const links = generateBookingLinks({
      city: "Mâcon",
      checkin: "2026-08-04",
      checkout: "2026-08-06",
      adults: 2,
      children: 1,
    })
    const airbnb = links.find((l) => l.platform === "airbnb")!
    // encodeURIComponent("Mâcon") = "M%C3%A2con"
    expect(airbnb.url).toContain("M%C3%A2con")
  })
})

// ---------------------------------------------------------------------------
// Domain correctness
// ---------------------------------------------------------------------------

describe("platform domain verification", () => {
  it("Booking.com URL points to booking.com", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const booking = links.find((l) => l.platform === "booking")!
    expect(booking.url).toContain("booking.com")
  })

  it("Airbnb URL points to airbnb.fr", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const airbnb = links.find((l) => l.platform === "airbnb")!
    expect(airbnb.url).toContain("airbnb.fr")
  })

  it("Abritel URL points to abritel.fr", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const abritel = links.find((l) => l.platform === "abritel")!
    expect(abritel.url).toContain("abritel.fr")
  })

  it("Google URL points to google.fr/travel", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const google = links.find((l) => l.platform === "google")!
    expect(google.url).toContain("google.fr/travel")
  })

  it("Trivago URL points to trivago.fr", () => {
    const links = generateBookingLinks(DIJON_OPTS)
    const trivago = links.find((l) => l.platform === "trivago")!
    expect(trivago.url).toContain("trivago.fr")
  })
})
