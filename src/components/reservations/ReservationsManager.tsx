"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { addReservation, deleteReservation, listReservations } from "@/lib/db";
import {
  RESERVATION_TYPE_LABELS,
  RESERVATION_TYPES,
  type Reservation,
  type ReservationDraft,
  type ReservationType,
} from "@/lib/reservations/reservation-types";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

const TYPE_ICON: Record<ReservationType, string> = {
  lodging: "🛏️",
  train: "🚆",
  flight: "✈️",
  car: "🚗",
  activity: "🎟️",
  other: "📌",
};

const SAMPLE = `Bonjour,
Votre réservation est confirmée.
Hôtel le Chapeau Rouge
5 Rue Michelet, 21000 Dijon
Arrivée : 03/08/2026 — Départ : 07/08/2026
Référence : CHAP-2026-778
Booking.com`;

export function ReservationsManager() {
  const [text, setText] = useState(SAMPLE);
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [source, setSource] = useState<"mock" | "ai" | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listReservations().then((r) => active && setReservations(r));
    return () => {
      active = false;
    };
  }, []);

  async function extract() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Extraction impossible");
      setDraft(data.draft as ReservationDraft);
      setSource(data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'extraction");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!draft) return;
    const reservation: Reservation = {
      ...draft,
      id: crypto.randomUUID(),
      importedAt: new Date().toISOString(),
    };
    await addReservation(reservation);
    setReservations((prev) => [...prev, reservation].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    setDraft(null);
  }

  async function remove(id: string) {
    await deleteReservation(id);
    setReservations((prev) => prev.filter((r) => r.id !== id));
  }

  function patch<K extends keyof ReservationDraft>(key: K, value: ReservationDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  return (
    <div className="space-y-5">
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Importer une confirmation
        </h2>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Collez l&apos;e-mail ou le texte de confirmation : la réservation est extraite
          puis agrégée dans l&apos;itinéraire par date.
        </p>
        <textarea
          aria-label="Texte de confirmation"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="p-3 rounded-lg w-full text-sm resize-y"
          style={inputStyle}
        />
        <Button onClick={extract} loading={loading} disabled={loading}>
          Extraire la réservation
        </Button>
        {error && (
          <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>
            {error}
          </p>
        )}
      </section>

      {draft && (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              Réservation extraite (éditable)
            </h3>
            {source && (
              <span className={source === "ai" ? "badge-verified" : "badge-seed"}>
                {source === "ai" ? "Extrait par Claude" : "Extraction auto"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledSelect
              label="Type"
              value={draft.type}
              options={RESERVATION_TYPES.map((t) => ({ value: t, label: RESERVATION_TYPE_LABELS[t] }))}
              onChange={(v) => patch("type", v as ReservationType)}
            />
            <LabeledInput label="Début" type="date" value={draft.startDate} onChange={(v) => patch("startDate", v)} />
          </div>
          <LabeledInput label="Intitulé" value={draft.title} onChange={(v) => patch("title", v)} />
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="Fin (optionnel)" type="date" value={draft.endDate ?? ""} onChange={(v) => patch("endDate", v || undefined)} />
            <LabeledInput label="Confirmation" value={draft.confirmationNumber ?? ""} onChange={(v) => patch("confirmationNumber", v || undefined)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="Prestataire" value={draft.provider ?? ""} onChange={(v) => patch("provider", v || undefined)} />
            <LabeledInput label="Lieu" value={draft.location ?? ""} onChange={(v) => patch("location", v || undefined)} />
          </div>
          <Button onClick={save} disabled={!draft.startDate || !draft.title}>
            Ajouter à l&apos;itinéraire
          </Button>
        </section>
      )}

      {reservations.length > 0 && (
        <section className="card p-5 space-y-2">
          <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            Itinéraire des réservations ({reservations.length})
          </h3>
          <ul className="space-y-2">
            {reservations.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    <span aria-hidden="true">{TYPE_ICON[r.type]}</span> {r.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {RESERVATION_TYPE_LABELS[r.type]} · {r.startDate}
                    {r.endDate ? ` → ${r.endDate}` : ""}
                    {r.location ? ` · ${r.location}` : ""}
                  </p>
                  {r.confirmationNumber && (
                    <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      Réf : {r.confirmationNumber}
                      {r.provider ? ` · ${r.provider}` : ""}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label={`Supprimer ${r.title}`}
                  className="text-xs underline shrink-0"
                  style={{ color: "var(--accent-danger)", minHeight: "auto", minWidth: "auto" }}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 px-3 rounded-lg text-sm w-full"
        style={inputStyle}
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 px-3 rounded-lg text-sm w-full"
        style={inputStyle}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
