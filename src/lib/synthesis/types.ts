export type LatLng = { lat: number; lng: number };
export type SourceStatus = "seed" | "estimated" | "verified";

export type OpportunityCategory =
  | "museum" | "park" | "attraction" | "water" | "playground"
  | "food" | "coworking" | "viewpoint" | "event" | "people" | "other";

export interface Anchor {
  id: string;
  kind: "event";
  title: string;
  location: LatLng;
  start: string; // ISO datetime — fixe
  end: string;   // ISO datetime — fixe
  source: string;
  sourceStatus: SourceStatus;
}

export interface Opportunity {
  id: string;
  title: string;
  category: OpportunityCategory;
  location: LatLng;
  score: number;            // désirabilité de base, 0..1
  durationMin: number;      // durée de visite typique
  timeWindow?: { start: string; end: string }; // disponibilité datée/saisonnière (ex. OpenAgenda)
  indoor?: boolean;         // pour la curation canicule
  babyFriendly?: boolean;
  source: string;
  sourceStatus: SourceStatus;
  /**
   * Étape **garantie** saisie par l'utilisateur : le solveur l'honore toujours
   * (jamais arbitrée par le sac à dos), comme l'ancre. Si elle est infaisable
   * dans la fenêtre, un conflit explicite est émis — jamais d'abandon
   * silencieux.
   */
  forced?: boolean;
  /** Nombre de nuits à passer sur place (étape garantie multi-nuits). */
  stayNights?: number;
}

export interface Person extends Opportunity {
  category: "people";
  availability?: { start: string; end: string }[];
}

export interface VacationWindow {
  origin: LatLng;          // domicile
  earliestStart: string;   // date ISO (incluse)
  latestEnd: string;       // date ISO (incluse)
  minNights: number;
  maxNights: number;
}

export interface HouseholdConstraints {
  babyPauseEveryMin: number;     // ex. 105
  babyPauseDurationMin: number;  // ex. 15
  maxDrivePerDayMin: number;     // plafond confort
  workDays: number[];            // 1=lun..7=dim → [1,2,3,4]
  workStart: string;             // "08:30"
  workEnd: string;               // "19:00"
  caniculeNoDrive: { start: string; end: string }; // "12:00".."16:00"
}

export type Ambiance = "reposant" | "sociable" | "decouvreur" | "theme";

export interface SynthesisRequest {
  anchors: Anchor[];
  opportunities: Opportunity[];
  people?: Person[];
  window: VacationWindow;
  constraints: HouseholdConstraints;
  themeCategory?: OpportunityCategory; // pour l'ambiance "theme"
}

export interface PlannedStop {
  opportunityId?: string;
  title: string;
  kind: "drive" | "visit" | "baby-pause" | "charge" | "anchor" | "night" | "work" | "canicule-block";
  start: string; // ISO datetime
  end: string;   // ISO datetime
  location?: LatLng;
  source?: string;
  sourceStatus?: SourceStatus;
  note?: string;
  /** Suggestions curatées le long de la contrainte (S4), classées sans exclure. */
  curated?: { id: string; title: string; source: string; sourceStatus: SourceStatus }[];
}

export interface PlannedDay {
  date: string;        // date ISO
  isWorkday: boolean;
  stops: PlannedStop[];
  driveMinutes: number;
}

export interface TripCandidate {
  ambiance: Ambiance;
  label: string;       // libellé FR
  startDate: string;
  endDate: string;
  days: PlannedDay[];
  includedOpportunityIds: string[];
  totalDriveMinutes: number;
  score: number;
  conflicts: string[]; // problèmes non résolus, AFFICHÉS
  caniculeExposureDays: number;
}
