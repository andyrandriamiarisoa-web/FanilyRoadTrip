/**
 * Table de coordonnées géographiques pour ~40 villes françaises.
 * Utilisée par le géocodage déterministe (mode mock) de l'itinéraire IA.
 * Coordonnées approximatives (~2 décimales), suffisantes pour le routage.
 */

export interface CityCoord {
  name: string
  lat: number
  lng: number
}

/** Villes françaises avec coordonnées géographiques. */
export const FRENCH_CITIES: CityCoord[] = [
  // Corridor de référence Fresnes → Marseille
  { name: "Paris", lat: 48.86, lng: 2.35 },
  { name: "Fresnes", lat: 48.75, lng: 2.32 },
  { name: "Dijon", lat: 47.32, lng: 5.04 },
  { name: "Beaune", lat: 47.02, lng: 4.84 },
  { name: "Mâcon", lat: 46.31, lng: 4.83 },
  { name: "Lyon", lat: 45.75, lng: 4.84 },
  { name: "Valence", lat: 44.93, lng: 4.89 },
  { name: "Tain-l'Hermitage", lat: 45.07, lng: 4.84 },
  { name: "Montélimar", lat: 44.56, lng: 4.75 },
  { name: "Orange", lat: 44.14, lng: 4.81 },
  { name: "Avignon", lat: 43.95, lng: 4.81 },
  { name: "Aix-en-Provence", lat: 43.53, lng: 5.45 },
  { name: "Marseille", lat: 43.30, lng: 5.37 },
  { name: "Sens", lat: 48.20, lng: 3.28 },
  { name: "Auxerre", lat: 47.80, lng: 3.57 },

  // Grandes villes françaises
  { name: "Nîmes", lat: 43.84, lng: 4.36 },
  { name: "Montpellier", lat: 43.61, lng: 3.88 },
  { name: "Grenoble", lat: 45.19, lng: 5.72 },
  { name: "Chambéry", lat: 45.57, lng: 5.92 },
  { name: "Annecy", lat: 45.90, lng: 6.12 },
  { name: "Nice", lat: 43.71, lng: 7.26 },
  { name: "Toulon", lat: 43.12, lng: 5.93 },
  { name: "Cannes", lat: 43.55, lng: 7.02 },
  { name: "Bordeaux", lat: 44.84, lng: -0.58 },
  { name: "Toulouse", lat: 43.60, lng: 1.44 },
  { name: "Nantes", lat: 47.22, lng: -1.55 },
  { name: "Rennes", lat: 48.11, lng: -1.68 },
  { name: "Lille", lat: 50.63, lng: 3.07 },
  { name: "Strasbourg", lat: 48.58, lng: 7.75 },
  { name: "Reims", lat: 49.26, lng: 4.03 },
  { name: "Nancy", lat: 48.69, lng: 6.18 },
  { name: "Clermont-Ferrand", lat: 45.78, lng: 3.09 },
  { name: "Saint-Étienne", lat: 45.43, lng: 4.39 },
  { name: "Tours", lat: 47.39, lng: 0.69 },
  { name: "Orléans", lat: 47.90, lng: 1.91 },
  { name: "Le Mans", lat: 48.00, lng: 0.20 },
  { name: "Rouen", lat: 49.44, lng: 1.10 },
  { name: "Caen", lat: 49.18, lng: -0.37 },
  { name: "Brest", lat: 48.39, lng: -4.49 },
  { name: "Perpignan", lat: 42.70, lng: 2.90 },
  { name: "Metz", lat: 49.12, lng: 6.18 },
  { name: "Amiens", lat: 49.89, lng: 2.30 },
  { name: "Limoges", lat: 45.83, lng: 1.26 },
  { name: "Besançon", lat: 47.24, lng: 6.02 },
]
