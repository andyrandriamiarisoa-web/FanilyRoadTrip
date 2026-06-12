/**
 * Mock orchestrator — returns a fully deterministic TripPlan for the
 * Fresnes ↔ Marseille reference trip without any external API calls.
 *
 * All seed data is inlined so this module has zero side-effects and works
 * entirely offline.
 */

import type { TripRequest, TripPlan, DayPlan, LodgingOption, ChargeStop, Leg } from "@/types"

// ---------------------------------------------------------------------------
// Seed lodging (subset used in mock)
// ---------------------------------------------------------------------------

const LODGING: Record<string, LodgingOption> = {
  "dijon-chapeau-rouge": {
    id: "dijon-chapeau-rouge",
    name: "Hôtel le Chapeau Rouge",
    address: "5 Rue Michelet, 21000 Dijon",
    lat: 47.3215,
    lng: 5.0415,
    priceTotal: 760,
    nights: 4,
    rating: 4.4,
    reviewCount: 412,
    amenities: { ac: true, parking: true, evCharger: false, desk: true },
    toConfirm: ["firmMattress", "desk32", "lateCheckout", "babyBed"],
    sourceStatus: "verified",
    tier: "best",
    bookingLinks: [
      {
        platform: "booking",
        url: "https://www.booking.com/hotel/fr/le-chapeau-rouge-dijon.fr.html?checkin=2026-07-31&checkout=2026-08-04&group_adults=2&group_children=1",
      },
    ],
  },
  "macon-les-saugeys": {
    id: "macon-les-saugeys",
    name: "Les Saugeys — Gîte de charme",
    address: "Les Saugeys, 71000 Mâcon",
    lat: 46.3102,
    lng: 4.8371,
    priceTotal: 480,
    nights: 2,
    rating: 4.7,
    reviewCount: 89,
    amenities: { ac: false, parking: true, evCharger: false, desk: true, pool: true },
    toConfirm: ["firmMattress", "desk32", "lateCheckout", "babyBed"],
    sourceStatus: "verified",
    tier: "character",
  },
  "tain-blue-vue-rhone": {
    id: "tain-blue-vue-rhone",
    name: "Blue — Vue Rhône",
    address: "2 Rue Joseph Péala, 26600 Tain-l'Hermitage",
    lat: 45.0715,
    lng: 4.8421,
    priceTotal: 175,
    nights: 1,
    rating: 4.5,
    reviewCount: 156,
    amenities: { ac: true, parking: false, evCharger: false, desk: false },
    toConfirm: ["firmMattress", "babyBed"],
    sourceStatus: "verified",
    tier: "best",
  },
  "marseille-adagio-timone": {
    id: "marseille-adagio-timone",
    name: "Adagio Marseille Timone",
    address: "Rue du Commandant Rolland, 13005 Marseille",
    lat: 43.2902,
    lng: 5.3981,
    priceTotal: 520,
    nights: 2,
    rating: 4.0,
    reviewCount: 712,
    amenities: { ac: true, parking: true, evCharger: false, desk: true },
    toConfirm: ["firmMattress", "desk32", "lateCheckout", "babyBed"],
    sourceStatus: "verified",
    tier: "best",
  },
  "montelimar-les-faysses": {
    id: "montelimar-les-faysses",
    name: "Les Faysses — Maison d'hôtes",
    address: "Les Faysses, 26200 Montélimar",
    lat: 44.5587,
    lng: 4.7341,
    priceTotal: 440,
    nights: 2,
    rating: 4.6,
    reviewCount: 134,
    amenities: { ac: true, parking: true, evCharger: false, desk: true, pool: true },
    toConfirm: ["firmMattress", "desk32", "lateCheckout", "babyBed"],
    sourceStatus: "verified",
    tier: "character",
  },
  "beaune-coto-hotel": {
    id: "beaune-coto-hotel",
    name: "Coto Hotel Beaune",
    address: "Rue du Faubourg Saint-Nicolas, 21200 Beaune",
    lat: 47.0212,
    lng: 4.8389,
    priceTotal: 520,
    nights: 2,
    rating: 4.3,
    reviewCount: 267,
    amenities: { ac: true, parking: true, evCharger: false, desk: true, pool: true },
    toConfirm: ["firmMattress", "desk32", "lateCheckout", "babyBed"],
    sourceStatus: "verified",
    tier: "best",
  },
  "sens-kyriad": {
    id: "sens-kyriad",
    name: "Kyriad Sens",
    address: "12 Rue de la République, 89100 Sens",
    lat: 48.1981,
    lng: 3.2801,
    priceTotal: 135,
    nights: 1,
    rating: 3.8,
    reviewCount: 312,
    amenities: { ac: true, parking: true, evCharger: false, desk: true },
    toConfirm: ["firmMattress", "desk32", "lateCheckout", "babyBed"],
    sourceStatus: "verified",
    tier: "eco",
  },
}

// ---------------------------------------------------------------------------
// Seed superchargers used in mock route
// ---------------------------------------------------------------------------

interface SeedSC {
  id: string
  name: string
  lat: number
  lng: number
  maxKw: number
}

const SC: Record<string, SeedSC> = {
  beaune: { id: "sc-beaune-merceuil", name: "Beaune-Merceuil", lat: 46.9512, lng: 4.8313, maxKw: 200 },
  maconSance: { id: "sc-macon-sance", name: "Mâcon-Sancé", lat: 46.2889, lng: 4.8292, maxKw: 150 },
  porteValence: { id: "sc-porte-les-valence", name: "Porte-lès-Valence", lat: 44.8878, lng: 4.8921, maxKw: 250 },
  lancon: { id: "sc-lancon-de-provence", name: "Lançon-de-Provence", lat: 43.5912, lng: 5.1301, maxKw: 200 },
  montelimar: { id: "sc-montelimar-nord", name: "Montélimar-Nord", lat: 44.5903, lng: 4.7498, maxKw: 200 },
  sens: { id: "sc-sens-maillot", name: "Sens-Maillot", lat: 48.1983, lng: 3.2742, maxKw: 200 },
  dijonLongvic: { id: "sc-dijon-longvic", name: "Dijon-Longvic", lat: 47.2998, lng: 5.0917, maxKw: 250 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChargeStop(sc: SeedSC, socArrival: number, socDeparture: number): ChargeStop {
  const usableKwh = 95
  const energyKwh = (socDeparture - socArrival) * usableKwh

  // Phase 1 (10→50%): 95% of maxKw; Phase 2 (50→80%): avg ~72.5% of maxKw
  // Approximate charge minutes for the range
  let minutes = 0
  const powerP1 = sc.maxKw * 0.95
  const phase1Start = Math.max(socArrival, 0.10)
  const phase1End = Math.min(socDeparture, 0.50)
  if (phase1End > phase1Start) {
    minutes += ((phase1End - phase1Start) * usableKwh) / powerP1 * 60
  }
  const phase2Start = Math.max(socArrival, 0.50)
  const phase2End = Math.min(socDeparture, 0.80)
  if (phase2End > phase2Start) {
    const avgPower = sc.maxKw * 0.725
    minutes += ((phase2End - phase2Start) * usableKwh) / avgPower * 60
  }

  return {
    superchargerId: sc.id,
    superchargerName: sc.name,
    lat: sc.lat,
    lng: sc.lng,
    socOnArrival: socArrival,
    socOnDeparture: socDeparture,
    chargeMinutes: Math.ceil(minutes),
    energyAddedKwh: energyKwh,
  }
}

function makeLeg(opts: {
  id: string
  from: string
  to: string
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  distanceKm: number
  durationMinutes: number
  departureISO: string
  chargeStops: ChargeStop[]
  socOnArrival: number
  consumptionKwh: number
  warnings?: string[]
}): Leg {
  const dep = new Date(opts.departureISO)
  let totalMinutes = opts.durationMinutes
  for (const cs of opts.chargeStops) {
    totalMinutes += cs.chargeMinutes
  }
  const arr = new Date(dep.getTime() + totalMinutes * 60_000)
  return {
    id: opts.id,
    from: opts.from,
    to: opts.to,
    fromLat: opts.fromLat,
    fromLng: opts.fromLng,
    toLat: opts.toLat,
    toLng: opts.toLng,
    distanceKm: opts.distanceKm,
    durationMinutes: opts.durationMinutes,
    departureTime: opts.departureISO,
    arrivalTime: arr.toISOString(),
    chargeStops: opts.chargeStops,
    socOnArrival: opts.socOnArrival,
    consumptionKwh: opts.consumptionKwh,
    warnings: opts.warnings ?? [],
  }
}

// ---------------------------------------------------------------------------
// The deterministic plan builder
// ---------------------------------------------------------------------------

export async function runMockOrchestrator(request: TripRequest): Promise<TripPlan> {
  const startMs = Date.now()

  // -----------------------------------------------------------------
  // Day 1 — 2026-07-31 (Friday): Drive Fresnes → Dijon  ~315 km
  // SoC: start 80%, charge at Beaune 80%→80% (not needed for 315km from 80%
  // but under heatwave highway we need a charge stop)
  // Consumption: 185 × 1.18 × 1.06 ≈ 231.5 Wh/km  => 315×231.5/1000 = 72.9 kWh
  // 72.9/95 = 76.7% discharged → end = 80-76.7 = 3.3% < 12% buffer → needs charge
  // Charge at Beaune-Merceuil from ~35% arrival to 80%
  // -----------------------------------------------------------------
  const beauneChargeStop = makeChargeStop(SC.beaune, 0.35, 0.80)

  const leg1 = makeLeg({
    id: "leg-fresnes-dijon",
    from: "Fresnes",
    to: "Dijon",
    fromLat: 48.754,
    fromLng: 2.321,
    toLat: 47.3215,
    toLng: 5.0415,
    distanceKm: 315,
    durationMinutes: 190,
    departureISO: "2026-07-31T08:00:00.000Z",
    chargeStops: [beauneChargeStop],
    socOnArrival: 0.20,
    consumptionKwh: 72.9,
    warnings: ["Canicule prévue — conduite conseillée avant 12h00"],
  })

  // -----------------------------------------------------------------
  // Day 2–5: Dijon work/rest days (Aug 1–4)
  // -----------------------------------------------------------------

  // -----------------------------------------------------------------
  // Day 6 — 2026-08-04 (Tuesday): Drive Dijon → Mâcon  ~75 km
  // No charge stop needed: 75×231.5/1000=17.4 kWh → 18.3% discharged from 80% = 61.7% arrival
  // -----------------------------------------------------------------
  const leg2 = makeLeg({
    id: "leg-dijon-macon",
    from: "Dijon",
    to: "Mâcon",
    fromLat: 47.3215,
    fromLng: 5.0415,
    toLat: 46.3102,
    toLng: 4.8371,
    distanceKm: 75,
    durationMinutes: 50,
    departureISO: "2026-08-04T09:00:00.000Z",
    chargeStops: [],
    socOnArrival: 0.617,
    consumptionKwh: 17.4,
    warnings: [],
  })

  // -----------------------------------------------------------------
  // Day 7–8: Mâcon work days (Aug 5–6 is Wed–Thu; note Aug 5 = Wed, Aug 6 = Thu)
  // Wait — let's recount: July 31 = Fri
  // Aug 1 = Sat (Dijon rest), Aug 2 = Sun (Dijon rest), Aug 3 = Mon (work), Aug 4 = Tue (work)
  // Drive to Mâcon on Wed Aug 5 morning after work start
  // Actually plan says drive Jul 31 depart, arrive Dijon, stay 4 nights (Jul 31→Aug 4)
  // Mâcon: Aug 4 arrive, stay 2 nights (Aug 4-5), drive Aug 6 to Tain
  // -----------------------------------------------------------------

  // -----------------------------------------------------------------
  // Day 9 — 2026-08-06 (Thursday): Drive Mâcon → Tain-l'Hermitage  ~135 km
  // Consumption: 135×231.5/1000 = 31.3 kWh → 32.9% from 80% = 47.1% arrival
  // Stop at Mâcon-Sancé to top up before leaving if needed — 80% start is fine
  // -----------------------------------------------------------------
  const leg3 = makeLeg({
    id: "leg-macon-tain",
    from: "Mâcon",
    to: "Tain-l'Hermitage",
    fromLat: 46.3102,
    fromLng: 4.8371,
    toLat: 45.0715,
    toLng: 4.8421,
    distanceKm: 135,
    durationMinutes: 85,
    departureISO: "2026-08-06T09:00:00.000Z",
    chargeStops: [],
    socOnArrival: 0.47,
    consumptionKwh: 31.3,
    warnings: [],
  })

  // -----------------------------------------------------------------
  // Day 10 — 2026-08-07 (Friday): Drive Tain → Marseille  ~240 km
  // Consumption: 240×231.5/1000 = 55.6 kWh → 58.5% from 80% = 21.5% arrival
  // Just above 12% buffer — add a stop at Porte-lès-Valence as a safety charge (47%→80%)
  // -----------------------------------------------------------------
  const valenceChargeStop = makeChargeStop(SC.porteValence, 0.47, 0.80)

  const leg4 = makeLeg({
    id: "leg-tain-marseille",
    from: "Tain-l'Hermitage",
    to: "Marseille",
    fromLat: 45.0715,
    fromLng: 4.8421,
    toLat: 43.2902,
    toLng: 5.3981,
    distanceKm: 240,
    durationMinutes: 150,
    departureISO: "2026-08-07T08:00:00.000Z",
    chargeStops: [valenceChargeStop],
    socOnArrival: 0.22,
    consumptionKwh: 55.6,
    warnings: ["Arrivée avant 12h conseillée — canicule août"],
  })

  // -----------------------------------------------------------------
  // Day 13 — 2026-08-09 (Sunday): Drive Marseille → Montélimar  ~195 km
  // Charge at Lançon-de-Provence (20%→80%) before leaving greater Marseille area
  // -----------------------------------------------------------------
  const lanconChargeStop = makeChargeStop(SC.lancon, 0.22, 0.80)

  const leg5 = makeLeg({
    id: "leg-marseille-montelimar",
    from: "Marseille",
    to: "Montélimar",
    fromLat: 43.2902,
    fromLng: 5.3981,
    toLat: 44.5587,
    toLng: 4.7341,
    distanceKm: 195,
    durationMinutes: 120,
    departureISO: "2026-08-09T17:00:00.000Z",
    chargeStops: [lanconChargeStop],
    socOnArrival: 0.35,
    consumptionKwh: 45.2,
    warnings: ["Départ après 17h pour éviter la chaleur"],
  })

  // -----------------------------------------------------------------
  // Day 14 — 2026-08-11 (Tuesday): Drive Montélimar → Beaune  ~165 km
  // -----------------------------------------------------------------
  const leg6 = makeLeg({
    id: "leg-montelimar-beaune",
    from: "Montélimar",
    to: "Beaune",
    fromLat: 44.5587,
    fromLng: 4.7341,
    toLat: 47.0212,
    toLng: 4.8389,
    distanceKm: 165,
    durationMinutes: 100,
    departureISO: "2026-08-11T19:30:00.000Z",
    chargeStops: [],
    socOnArrival: 0.42,
    consumptionKwh: 38.2,
    warnings: ["Départ tardif — conduite après 19h30 hors canicule"],
  })

  // -----------------------------------------------------------------
  // Day 15 — 2026-08-13 (Thursday): Drive Beaune → Sens  ~155 km
  // -----------------------------------------------------------------
  const leg7 = makeLeg({
    id: "leg-beaune-sens",
    from: "Beaune",
    to: "Sens",
    fromLat: 47.0212,
    fromLng: 4.8389,
    toLat: 48.1981,
    toLng: 3.2801,
    distanceKm: 155,
    durationMinutes: 95,
    departureISO: "2026-08-13T19:30:00.000Z",
    chargeStops: [],
    socOnArrival: 0.46,
    consumptionKwh: 35.9,
    warnings: [],
  })

  // -----------------------------------------------------------------
  // Day 16 — 2026-08-14 (Friday): Drive Sens → Fresnes  ~120 km
  // -----------------------------------------------------------------
  const sensChargeStop = makeChargeStop(SC.sens, 0.46, 0.80)
  const leg8 = makeLeg({
    id: "leg-sens-fresnes",
    from: "Sens",
    to: "Fresnes",
    fromLat: 48.1981,
    fromLng: 3.2801,
    toLat: 48.754,
    toLng: 2.321,
    distanceKm: 120,
    durationMinutes: 75,
    departureISO: "2026-08-14T08:00:00.000Z",
    chargeStops: [sensChargeStop],
    socOnArrival: 0.52,
    consumptionKwh: 27.8,
    warnings: [],
  })

  // -----------------------------------------------------------------
  // Build day-by-day plan
  // -----------------------------------------------------------------

  const weddingEvent = request.fixedEvents.find((e) => e.id === "mariage-marseille") ?? {
    id: "mariage-marseille",
    name: "Mariage",
    date: "2026-08-08",
    hour: 11.5,
    location: {
      address: "258 bd Romain Rolland, 13009 Marseille",
      lat: 43.258,
      lng: 5.407,
    },
    maxDistanceKm: 10,
    requiresNightBefore: true,
  }

  const days: DayPlan[] = [
    // Day 1 — Jul 31: Drive Fresnes → Dijon
    {
      date: "2026-07-31",
      type: "drive",
      location: "Dijon",
      leg: leg1,
      lodging: LODGING["dijon-chapeau-rouge"],
      workStatus: "none",
      notes: [
        "Départ tôt (8h) pour éviter la canicule de l'après-midi",
        "Recharge à Beaune-Merceuil (~35%→80%, ~20 min)",
        "Arrivée Dijon estimée 12h30",
      ],
      heatAdvisory: true,
      connectivity: { quality: "good", note: "SFR 5G disponible à Dijon (estimé 180 Mbps)" },
    },
    // Day 2 — Aug 1 (Sat): Dijon rest/visit
    {
      date: "2026-08-01",
      type: "rest",
      location: "Dijon",
      lodging: LODGING["dijon-chapeau-rouge"],
      workStatus: "none",
      notes: ["Visite Dijon — centre historique, Palais des Ducs", "Pas de télétravail (samedi)"],
      heatAdvisory: true,
      connectivity: { quality: "good", note: "SFR 5G Dijon" },
    },
    // Day 3 — Aug 2 (Sun): Dijon rest/visit
    {
      date: "2026-08-02",
      type: "rest",
      location: "Dijon",
      lodging: LODGING["dijon-chapeau-rouge"],
      workStatus: "none",
      notes: ["Visite vignoble de Bourgogne", "Repos bébé"],
      heatAdvisory: true,
      connectivity: { quality: "good", note: "SFR 5G Dijon" },
    },
    // Day 4 — Aug 3 (Mon): Dijon work
    {
      date: "2026-08-03",
      type: "work",
      location: "Dijon",
      lodging: LODGING["dijon-chapeau-rouge"],
      workStatus: "full",
      notes: [
        "Télétravail 8h30–19h00",
        "Vérifier bureau ≥120cm et connexion fibre/5G à l'hôtel",
        "Late checkout 19h00 prévu",
      ],
      heatAdvisory: true,
      connectivity: { quality: "good", note: "SFR 5G Dijon ~180 Mbps" },
    },
    // Day 5 — Aug 4 (Tue): Drive Dijon → Mâcon
    {
      date: "2026-08-04",
      type: "drive",
      location: "Mâcon",
      leg: leg2,
      lodging: LODGING["macon-les-saugeys"],
      workStatus: "partial",
      notes: [
        "Télétravail 8h30–9h00, départ 9h00",
        "Trajet court ~75 km, pas de recharge nécessaire",
        "Arrivée Mâcon ~10h30",
      ],
      heatAdvisory: true,
      connectivity: { quality: "good", note: "SFR 5G Mâcon ~150 Mbps" },
    },
    // Day 6 — Aug 5 (Wed): Mâcon work
    {
      date: "2026-08-05",
      type: "work",
      location: "Mâcon",
      lodging: LODGING["macon-les-saugeys"],
      workStatus: "full",
      notes: [
        "Télétravail 8h30–19h00",
        "Confirmer desk 120cm et connexion Les Saugeys",
        "Recharge éventuelle Mâcon-Sancé si nécessaire",
      ],
      heatAdvisory: true,
      connectivity: { quality: "good", note: "SFR 5G Mâcon ~150 Mbps" },
    },
    // Day 7 — Aug 6 (Thu): Drive Mâcon → Tain-l'Hermitage
    {
      date: "2026-08-06",
      type: "drive",
      location: "Tain-l'Hermitage",
      leg: leg3,
      lodging: LODGING["tain-blue-vue-rhone"],
      workStatus: "partial",
      notes: [
        "Télétravail 8h30–9h00, départ 9h00",
        "Trajet 135 km sans recharge depuis 80% (arrivée ~47%)",
        "Nuit de passage — Blue Vue Rhône",
      ],
      heatAdvisory: true,
      connectivity: { quality: "fair", note: "SFR 5G Tain ~70 Mbps — étape non-travail" },
    },
    // Day 8 — Aug 7 (Fri): Drive Tain → Marseille
    {
      date: "2026-08-07",
      type: "drive",
      location: "Marseille",
      leg: leg4,
      lodging: LODGING["marseille-adagio-timone"],
      workStatus: "none",
      notes: [
        "Départ tôt 8h depuis Tain",
        "Recharge Porte-lès-Valence (47%→80%, ~10 min V4)",
        "Arrivée Marseille Adagio Timone ~12h30",
        "Installation avant mariage demain",
      ],
      heatAdvisory: true,
      connectivity: {
        quality: "excellent",
        note: "Marseille centre — très bonne couverture 5G/fibre",
      },
    },
    // Day 9 — Aug 8 (Sat): Mariage
    {
      date: "2026-08-08",
      type: "event",
      location: "Marseille",
      events: [weddingEvent],
      lodging: LODGING["marseille-adagio-timone"],
      workStatus: "none",
      notes: [
        "Mariage 11h30 — 258 bd Romain Rolland, 13009 Marseille",
        "Logement Adagio Timone à ~8 min du lieu (≤10 km requis ✓)",
        "Journée événement — pas de conduite",
      ],
      heatAdvisory: true,
      connectivity: { quality: "excellent", note: "Marseille centre" },
    },
    // Day 10 — Aug 9 (Sun): Drive Marseille → Montélimar (after wedding)
    {
      date: "2026-08-09",
      type: "drive",
      location: "Montélimar",
      leg: leg5,
      lodging: LODGING["montelimar-les-faysses"],
      workStatus: "none",
      notes: [
        "Départ 17h pour éviter la chaleur du milieu de journée",
        "Recharge Lançon-de-Provence (22%→80%, ~25 min)",
        "Arrivée Montélimar ~20h30",
      ],
      heatAdvisory: true,
      connectivity: {
        quality: "excellent",
        note: "SFR 5G Montélimar — excellent, 16 antennes, ~350 Mbps",
      },
    },
    // Day 11 — Aug 10 (Mon): Montélimar work
    {
      date: "2026-08-10",
      type: "work",
      location: "Montélimar",
      lodging: LODGING["montelimar-les-faysses"],
      workStatus: "full",
      notes: [
        "Télétravail 8h30–19h00",
        "Excellente 5G SFR (350 Mbps) — fallback fibre",
        "Grignan visite uniquement — pas de nuit",
        "Attention: 5G Grignan insuffisante (29 Mbps) si déplacement travail",
      ],
      heatAdvisory: true,
      connectivity: {
        quality: "excellent",
        note: "SFR 5G Montélimar ~350 Mbps — meilleure étape travail",
      },
    },
    // Day 12 — Aug 11 (Tue): Drive Montélimar → Beaune
    {
      date: "2026-08-11",
      type: "drive",
      location: "Beaune",
      leg: leg6,
      lodging: LODGING["beaune-coto-hotel"],
      workStatus: "partial",
      notes: [
        "Télétravail 8h30–19h00, départ 19h30",
        "Trajet 165 km de nuit (fraîcheur), sans recharge depuis 80%",
        "Arrivée Beaune ~21h30",
      ],
      heatAdvisory: false,
      connectivity: { quality: "fair", note: "SFR 5G Beaune ~80 Mbps (fair)" },
    },
    // Day 13 — Aug 12 (Wed): Beaune work
    {
      date: "2026-08-12",
      type: "work",
      location: "Beaune",
      lodging: LODGING["beaune-coto-hotel"],
      workStatus: "full",
      notes: [
        "Télétravail 8h30–19h00",
        "SFR 5G Beaune fair (~80 Mbps) — vérifier fibre à l'hôtel en priorité",
        "Visite vignoble possible en soirée",
      ],
      heatAdvisory: false,
      connectivity: { quality: "fair", note: "SFR 5G Beaune ~80 Mbps — vérifier fibre hôtel" },
    },
    // Day 14 — Aug 13 (Thu): Drive Beaune → Sens
    {
      date: "2026-08-13",
      type: "drive",
      location: "Sens",
      leg: leg7,
      lodging: LODGING["sens-kyriad"],
      workStatus: "partial",
      notes: [
        "Télétravail 8h30–19h00, départ 19h30",
        "Trajet 155 km de nuit, pas de recharge nécessaire",
        "Arrivée Sens ~21h15 — dernière nuit avant Fresnes",
      ],
      heatAdvisory: false,
      connectivity: { quality: "fair", note: "SFR 5G Sens ~90 Mbps — étape non-prioritaire" },
    },
    // Day 15 — Aug 14 (Fri): Drive Sens → Fresnes
    {
      date: "2026-08-14",
      type: "drive",
      location: "Fresnes",
      leg: leg8,
      workStatus: "none",
      notes: [
        "Départ 8h — dernier trajet 120 km",
        "Recharge Sens-Maillot (46%→80%, ~18 min) pour arriver confortablement",
        "Arrivée Fresnes ~10h30",
        "Fin du voyage !",
      ],
      heatAdvisory: false,
    },
  ]

  // -----------------------------------------------------------------
  // Lodging selections (date → lodging id)
  // -----------------------------------------------------------------
  const lodgingSelections: Record<string, string> = {
    "2026-07-31": "dijon-chapeau-rouge",
    "2026-08-01": "dijon-chapeau-rouge",
    "2026-08-02": "dijon-chapeau-rouge",
    "2026-08-03": "dijon-chapeau-rouge",
    "2026-08-04": "macon-les-saugeys",
    "2026-08-05": "macon-les-saugeys",
    "2026-08-06": "tain-blue-vue-rhone",
    "2026-08-07": "marseille-adagio-timone",
    "2026-08-08": "marseille-adagio-timone",
    "2026-08-09": "montelimar-les-faysses",
    "2026-08-10": "montelimar-les-faysses",
    "2026-08-11": "beaune-coto-hotel",
    "2026-08-12": "beaune-coto-hotel",
    "2026-08-13": "sens-kyriad",
  }

  const totalDistanceKm =
    leg1.distanceKm +
    leg2.distanceKm +
    leg3.distanceKm +
    leg4.distanceKm +
    leg5.distanceKm +
    leg6.distanceKm +
    leg7.distanceKm +
    leg8.distanceKm

  const totalDrivingMinutes =
    leg1.durationMinutes +
    leg2.durationMinutes +
    leg3.durationMinutes +
    leg4.durationMinutes +
    leg5.durationMinutes +
    leg6.durationMinutes +
    leg7.durationMinutes +
    leg8.durationMinutes

  const lodgingTotal = Object.values(LODGING)
    .filter((l) => Object.values(lodgingSelections).includes(l.id))
    .reduce((sum, l) => sum + l.priceTotal, 0)

  // Estimate charging cost: ~0.40 €/kWh at Supercharger
  const allChargeStops = [
    ...leg1.chargeStops,
    ...leg4.chargeStops,
    ...leg5.chargeStops,
    ...leg8.chargeStops,
  ]
  const totalEnergyAdded = allChargeStops.reduce((sum, cs) => sum + cs.energyAddedKwh, 0)
  const chargingTotal = Math.round(totalEnergyAdded * 0.4)

  const durationMs = Date.now() - startMs

  const plan: TripPlan = {
    id: `mock-${request.origin.toLowerCase().replace(/\s+/g, "-")}-${request.destination.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    version: 1,
    createdAt: new Date().toISOString(),
    profileId: request.profileId ?? "famille-default",
    tripRequest: {
      origin: request.origin,
      originLat: request.originLat,
      originLng: request.originLng,
      destination: request.destination,
      destinationLat: request.destinationLat,
      destinationLng: request.destinationLng,
      departureFrom: request.departureFrom,
      departureTo: request.departureTo,
      maxDays: request.maxDays,
      fixedEvents: request.fixedEvents,
    },
    days,
    totalDistanceKm,
    totalDrivingMinutes,
    lodgingSelections,
    budgetEstimate: {
      lodgingTotal,
      chargingTotal,
    },
    feasible: true,
    conflicts: [],
    agentLog: [
      {
        agent: "mock-orchestrator",
        input: request,
        output: { daysGenerated: days.length, chargeStopsTotal: allChargeStops.length },
        durationMs,
      },
    ],
  }

  return plan
}
