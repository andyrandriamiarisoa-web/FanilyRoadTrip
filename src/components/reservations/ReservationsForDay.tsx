"use client";

import {
  RESERVATION_TYPE_LABELS,
  type Reservation,
  type ReservationType,
} from "@/lib/reservations/reservation-types";

const TYPE_ICON: Record<ReservationType, string> = {
  lodging: "🛏️",
  train: "🚆",
  flight: "✈️",
  car: "🚗",
  activity: "🎟️",
  other: "📌",
};

/** Réservations importées rattachées à une journée du carnet. */
export function ReservationsForDay({ reservations }: { reservations: Reservation[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Réservations
      </p>
      <ul className="space-y-1.5">
        {reservations.map((r) => (
          <li
            key={r.id}
            className="p-2.5 rounded-lg text-sm"
            style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
          >
            <span className="font-medium">
              <span aria-hidden="true">{TYPE_ICON[r.type]}</span> {r.title}
            </span>
            <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {RESERVATION_TYPE_LABELS[r.type]}
              {r.confirmationNumber ? ` · Réf ${r.confirmationNumber}` : ""}
              {r.provider ? ` · ${r.provider}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
