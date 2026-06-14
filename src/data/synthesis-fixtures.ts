import type { SynthesisRequest, Opportunity, Person, Anchor } from "@/lib/synthesis/types";

const FRESNES = { lat: 48.7553, lng: 2.3247 };
const VELODROME = { lat: 43.2699, lng: 5.3958 };

export const REFERENCE_ANCHOR: Anchor = {
  id: "wedding-velodrome", kind: "event", title: "Mariage (près du Vélodrome)",
  location: VELODROME, start: "2026-08-08T16:00:00+02:00", end: "2026-08-09T01:00:00+02:00",
  source: "saisi par l'utilisateur", sourceStatus: "verified",
};

export const REFERENCE_OPPORTUNITIES: Opportunity[] = [
  { id: "dijon-beaux-arts", title: "Musée des Beaux-Arts de Dijon", category: "museum", location: { lat: 47.3221, lng: 5.0415 }, score: 0.7, durationMin: 90, indoor: true, babyFriendly: true, source: "Foursquare", sourceStatus: "seed" },
  { id: "beaune-hospices", title: "Hospices de Beaune", category: "museum", location: { lat: 47.0220, lng: 4.8400 }, score: 0.75, durationMin: 90, indoor: true, babyFriendly: true, source: "Overture", sourceStatus: "seed" },
  { id: "macon-solutre", title: "Roche de Solutré (point de vue)", category: "viewpoint", location: { lat: 46.2980, lng: 4.7200 }, score: 0.6, durationMin: 120, indoor: false, source: "Overture", sourceStatus: "seed" },
  { id: "lyon-tete-or", title: "Parc de la Tête d'Or", category: "park", location: { lat: 45.7770, lng: 4.8556 }, score: 0.8, durationMin: 120, indoor: false, babyFriendly: true, source: "Overture", sourceStatus: "seed" },
  { id: "lyon-halles", title: "Halles de Lyon Paul Bocuse", category: "food", location: { lat: 45.7620, lng: 4.8570 }, score: 0.65, durationMin: 75, indoor: true, babyFriendly: true, source: "Foursquare", sourceStatus: "seed" },
  { id: "valence-vieux", title: "Vieux Valence", category: "attraction", location: { lat: 44.9334, lng: 4.8924 }, score: 0.5, durationMin: 60, indoor: false, source: "Overture", sourceStatus: "seed" },
  { id: "avignon-papes", title: "Palais des Papes", category: "museum", location: { lat: 43.9509, lng: 4.8076 }, score: 0.85, durationMin: 120, indoor: true, babyFriendly: true, source: "Foursquare", sourceStatus: "seed" },
  { id: "avignon-plan-eau", title: "Base de loisirs de l'Islon", category: "water", location: { lat: 43.9300, lng: 4.8500 }, score: 0.6, durationMin: 120, indoor: false, babyFriendly: true, source: "Overture", sourceStatus: "seed" },
  { id: "orange-theatre", title: "Théâtre antique d'Orange", category: "attraction", location: { lat: 44.1360, lng: 4.8080 }, score: 0.7, durationMin: 90, indoor: false, babyFriendly: true, source: "Overture", sourceStatus: "seed" },
  { id: "aix-cours-mirabeau", title: "Cours Mirabeau (Aix)", category: "attraction", location: { lat: 43.5263, lng: 5.4490 }, score: 0.55, durationMin: 60, indoor: false, source: "Overture", sourceStatus: "seed" },
  { id: "marseille-mucem", title: "MuCEM", category: "museum", location: { lat: 43.2966, lng: 5.3615 }, score: 0.8, durationMin: 120, indoor: true, babyFriendly: true, source: "Foursquare", sourceStatus: "seed" },
  { id: "marseille-calanques", title: "Calanques (vue)", category: "viewpoint", location: { lat: 43.2148, lng: 5.4406 }, score: 0.75, durationMin: 90, indoor: false, source: "Overture", sourceStatus: "seed" },
];

export const REFERENCE_PEOPLE: Person[] = [
  { id: "marie-lyon", title: "Marie (Lyon)", category: "people", location: { lat: 45.7640, lng: 4.8357 }, score: 0.9, durationMin: 180, source: "carnet personnel", sourceStatus: "verified", availability: [{ start: "2026-08-01", end: "2026-08-03" }] },
];

// Événements datés mockés (OpenAgenda en mode mock).
export const SEED_EVENTS: Opportunity[] = [
  { id: "evt-lavande-valensole", title: "Fête de la lavande (Valensole)", category: "event", location: { lat: 43.8366, lng: 5.9836 }, score: 0.85, durationMin: 180, timeWindow: { start: "2026-07-25", end: "2026-08-02" }, indoor: false, source: "OpenAgenda", sourceStatus: "verified" },
  { id: "evt-festival-avignon", title: "Spectacle (Avignon)", category: "event", location: { lat: 43.9493, lng: 4.8055 }, score: 0.8, durationMin: 150, timeWindow: { start: "2026-07-30", end: "2026-08-05" }, indoor: true, source: "OpenAgenda", sourceStatus: "verified" },
];

export const REFERENCE_REQUEST: SynthesisRequest = {
  anchors: [REFERENCE_ANCHOR],
  opportunities: REFERENCE_OPPORTUNITIES,
  people: REFERENCE_PEOPLE,
  window: { origin: FRESNES, earliestStart: "2026-07-30", latestEnd: "2026-08-14", minNights: 10, maxNights: 15 },
  constraints: {
    babyPauseEveryMin: 105, babyPauseDurationMin: 15, maxDrivePerDayMin: 300,
    workDays: [1, 2, 3, 4], workStart: "08:30", workEnd: "19:00",
    caniculeNoDrive: { start: "12:00", end: "16:00" },
  },
};
