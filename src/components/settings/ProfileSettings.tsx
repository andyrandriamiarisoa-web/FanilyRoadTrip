"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadActiveProfile, saveProfilePatch } from "@/lib/db";
import {
  ORDERED_WEEKDAYS,
  WEEKDAY_LABELS,
  formatDecimalHour,
  type ProfilePatch,
  type Weekday,
} from "@/lib/profile/profile";
import type { FamilyProfile } from "@/types";

type Status = "loading" | "ready" | "saving" | "saved" | "error";

/** Brouillon éditable : les champs réellement modifiables depuis l'UI. */
interface Draft {
  name: string;
  babyAgeMonths: number;
  babyMaxLegMinutes: number;
  heatStart: number;
  heatEnd: number;
  firmMattress: boolean;
  acRequired: boolean;
  workDays: Weekday[];
  workStartHour: number;
  workEndHour: number;
  deskCm: number;
  fiber: boolean;
  fallback5G: boolean;
  maxSegmentMinutes: number;
  avoidLargeUrbanCores: boolean;
  preferPeripheryWithTransport: boolean;
}

function toDraft(p: FamilyProfile): Draft {
  return {
    name: p.name,
    babyAgeMonths: p.baby.ageMonths,
    babyMaxLegMinutes: p.baby.maxLegMinutes,
    heatStart: p.baby.noDrivingHours[0],
    heatEnd: p.baby.noDrivingHours[1],
    firmMattress: p.medical.requiresFirmMattress,
    acRequired: p.medical.acRequired,
    workDays: [...p.work.workDays],
    workStartHour: p.work.workStartHour,
    workEndHour: p.work.workEndHour,
    deskCm: p.work.requiresDeskCm,
    fiber: p.work.requiresFiber,
    fallback5G: p.work.fallback5G,
    maxSegmentMinutes: p.driving.maxSegmentMinutes,
    avoidLargeUrbanCores: p.avoidLargeUrbanCores,
    preferPeripheryWithTransport: p.preferPeripheryWithTransport,
  };
}

function toPatch(d: Draft): ProfilePatch {
  return {
    name: d.name,
    baby: {
      ageMonths: d.babyAgeMonths,
      maxLegMinutes: d.babyMaxLegMinutes,
      noDrivingHours: [d.heatStart, d.heatEnd],
    },
    medical: {
      requiresFirmMattress: d.firmMattress,
      acRequired: d.acRequired,
    },
    work: {
      workDays: d.workDays,
      workStartHour: d.workStartHour,
      workEndHour: d.workEndHour,
      requiresDeskCm: d.deskCm,
      requiresFiber: d.fiber,
      fallback5G: d.fallback5G,
    },
    driving: {
      maxSegmentMinutes: d.maxSegmentMinutes,
      // Fenêtre canicule alignée sur celle du bébé.
      noHeatDrivingRange: [d.heatStart, d.heatEnd],
    },
    avoidLargeUrbanCores: d.avoidLargeUrbanCores,
    preferPeripheryWithTransport: d.preferPeripheryWithTransport,
  };
}

export function ProfileSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [meta, setMeta] = useState<{ version: number; updatedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadActiveProfile()
      .then((p) => {
        if (!active) return;
        setDraft(toDraft(p));
        setMeta({ version: p.version, updatedAt: p.updatedAt });
        setStatus("ready");
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Erreur de chargement");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    if (status === "saved") setStatus("ready");
  }

  function toggleWorkDay(day: Weekday) {
    setDraft((d) => {
      if (!d) return d;
      const has = d.workDays.includes(day);
      return {
        ...d,
        workDays: has ? d.workDays.filter((x) => x !== day) : [...d.workDays, day],
      };
    });
    if (status === "saved") setStatus("ready");
  }

  async function save() {
    if (!draft) return;
    setStatus("saving");
    setError(null);
    try {
      const saved = await saveProfilePatch(toPatch(draft));
      setDraft(toDraft(saved));
      setMeta({ version: saved.version, updatedAt: saved.updatedAt });
      setStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'enregistrement");
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <section className="card p-5" aria-busy="true">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Chargement du profil foyer…
        </p>
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="card p-5" role="alert" style={{ borderColor: "var(--accent-danger)" }}>
        <p className="font-semibold" style={{ color: "var(--accent-danger)" }}>
          Profil indisponible
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {error ?? "Une erreur est survenue."}
        </p>
      </section>
    );
  }

  return (
    <form
      className="card p-5 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Profil foyer
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Contraintes consommées à chaque génération d&apos;itinéraire.
          </p>
        </div>
        {meta && (
          <span
            className="badge-verified shrink-0"
            title={`Dernière modification : ${new Date(meta.updatedAt).toLocaleString("fr-FR")}`}
          >
            v{meta.version}
          </span>
        )}
      </div>

      <FieldGroup legend="Identité">
        <TextField
          label="Nom du profil"
          value={draft.name}
          onChange={(v) => set("name", v)}
        />
      </FieldGroup>

      <FieldGroup legend="Bébé">
        <NumberField
          label="Âge (mois)"
          value={draft.babyAgeMonths}
          min={0}
          max={216}
          onChange={(v) => set("babyAgeMonths", v)}
        />
        <NumberField
          label="Pause maxi entre deux arrêts (min)"
          value={draft.babyMaxLegMinutes}
          min={30}
          max={240}
          step={5}
          onChange={(v) => set("babyMaxLegMinutes", v)}
        />
        <HourField
          label="Début fenêtre canicule"
          value={draft.heatStart}
          onChange={(v) => set("heatStart", v)}
        />
        <HourField
          label="Fin fenêtre canicule"
          value={draft.heatEnd}
          onChange={(v) => set("heatEnd", v)}
        />
      </FieldGroup>

      <FieldGroup legend="Médical">
        <ToggleField
          label="Matelas ferme obligatoire"
          checked={draft.firmMattress}
          onChange={(v) => set("firmMattress", v)}
        />
        <ToggleField
          label="Climatisation requise"
          checked={draft.acRequired}
          onChange={(v) => set("acRequired", v)}
        />
      </FieldGroup>

      <FieldGroup legend="Télétravail">
        <WeekdayPicker selected={draft.workDays} onToggle={toggleWorkDay} />
        <HourField
          label="Début de journée"
          value={draft.workStartHour}
          onChange={(v) => set("workStartHour", v)}
        />
        <HourField
          label="Fin de journée"
          value={draft.workEndHour}
          onChange={(v) => set("workEndHour", v)}
        />
        <NumberField
          label="Bureau minimum (cm)"
          value={draft.deskCm}
          min={60}
          max={300}
          step={5}
          onChange={(v) => set("deskCm", v)}
        />
        <ToggleField
          label="Fibre requise"
          checked={draft.fiber}
          onChange={(v) => set("fiber", v)}
        />
        <ToggleField
          label="Secours 5G"
          checked={draft.fallback5G}
          onChange={(v) => set("fallback5G", v)}
        />
      </FieldGroup>

      <FieldGroup legend="Conduite & hébergement">
        <NumberField
          label="Trajet maximum sans étape (min)"
          value={draft.maxSegmentMinutes}
          min={30}
          max={300}
          step={5}
          onChange={(v) => set("maxSegmentMinutes", v)}
        />
        <ToggleField
          label="Éviter les grands centres urbains"
          checked={draft.avoidLargeUrbanCores}
          onChange={(v) => set("avoidLargeUrbanCores", v)}
        />
        <ToggleField
          label="Préférer la périphérie desservie par les transports"
          checked={draft.preferPeripheryWithTransport}
          onChange={(v) => set("preferPeripheryWithTransport", v)}
        />
      </FieldGroup>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" loading={status === "saving"} disabled={status === "saving"}>
          Enregistrer le profil
        </Button>
        <span
          aria-live="polite"
          className="text-sm"
          style={{
            color:
              status === "saved"
                ? "var(--accent-success)"
                : status === "error"
                  ? "var(--accent-danger)"
                  : "var(--text-secondary)",
          }}
        >
          {status === "saved" && meta
            ? `Enregistré — version ${meta.version}`
            : status === "error"
              ? (error ?? "Erreur")
              : ""}
        </span>
      </div>
    </form>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────

function FieldGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
      <legend
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 px-3 rounded-lg w-full text-sm"
        style={inputStyle}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={Number.isNaN(value) ? "" : value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="h-11 px-3 rounded-lg w-full text-sm"
        style={inputStyle}
      />
    </div>
  );
}

function HourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isNaN(value) ? "" : value}
          min={0}
          max={24}
          step={0.5}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className="h-11 px-3 rounded-lg w-full text-sm"
          style={inputStyle}
        />
        <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
          {Number.isNaN(value) ? "—" : formatDecimalHour(value)}
        </span>
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-3 cursor-pointer py-1"
      style={{ color: "var(--text-primary)" }}
    >
      <span className="text-sm font-medium">{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--accent-amber)]"
      />
    </label>
  );
}

function WeekdayPicker({
  selected,
  onToggle,
}: {
  selected: Weekday[];
  onToggle: (d: Weekday) => void;
}) {
  return (
    <div role="group" aria-label="Jours de télétravail" className="space-y-1.5">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        Jours travaillés
      </span>
      <div className="flex flex-wrap gap-2">
        {ORDERED_WEEKDAYS.map((day) => {
          const active = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(day)}
              className="h-11 min-w-11 px-3 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: active ? "var(--accent-amber)" : "var(--bg-base)",
                color: active ? "var(--text-on-amber)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent-amber)" : "var(--border-default)"}`,
              }}
            >
              {WEEKDAY_LABELS[day]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
