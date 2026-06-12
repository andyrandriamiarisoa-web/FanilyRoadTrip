import type { TripRequest } from "@/types";

export const REFERENCE_TRIP_REQUEST: TripRequest = {
  origin: "Fresnes",
  originLat: 48.754,
  originLng: 2.321,
  destination: "Marseille",
  destinationLat: 43.296,
  destinationLng: 5.370,
  departureFrom: "2026-07-31",
  departureTo: "2026-08-01",
  maxDays: 15,
  fixedEvents: [
    {
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
    },
  ],
};
