import { describe, it, expect } from "vitest";
import {
  haversineKm, projection, addDays, daysBetween, isoDateTime, weekday, parseHM, toISODate,
} from "./geo-time";

describe("geo-time", () => {
  it("haversineKm ≈ 0 pour le même point, plausible Paris→Lyon", () => {
    expect(haversineKm({ lat: 45, lng: 5 }, { lat: 45, lng: 5 })).toBeCloseTo(0, 6);
    const d = haversineKm({ lat: 48.86, lng: 2.35 }, { lat: 45.75, lng: 4.84 });
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(420);
  });

  it("projection borne 0..1 le long de l'axe", () => {
    const a = { lat: 0, lng: 0 }, b = { lat: 0, lng: 10 };
    expect(projection(a, a, b)).toBeCloseTo(0, 6);
    expect(projection(b, a, b)).toBeCloseTo(1, 6);
    expect(projection({ lat: 0, lng: 5 }, a, b)).toBeCloseTo(0.5, 6);
    expect(projection({ lat: 0, lng: 20 }, a, b)).toBe(1); // clampé
  });

  it("dates : addDays, daysBetween, toISODate", () => {
    expect(addDays("2026-08-08", -8)).toBe("2026-07-31");
    expect(addDays("2026-08-08", 7)).toBe("2026-08-15");
    expect(daysBetween("2026-07-31", "2026-08-08")).toBe(8);
    expect(toISODate(new Date("2026-08-08T12:00:00Z"))).toBe("2026-08-08");
  });

  it("weekday 1=lundi … 7=dimanche", () => {
    expect(weekday("2026-08-03")).toBe(1); // lundi
    expect(weekday("2026-08-08")).toBe(6); // samedi
    expect(weekday("2026-08-09")).toBe(7); // dimanche
  });

  it("parseHM et isoDateTime", () => {
    expect(parseHM("08:30")).toBe(510);
    expect(parseHM("19:00")).toBe(1140);
    expect(isoDateTime("2026-08-08", 510)).toBe("2026-08-08T08:30:00.000Z");
  });
});
