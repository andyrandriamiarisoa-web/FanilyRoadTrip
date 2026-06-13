"use client";

import { useEffect, useMemo, useState } from "react";
import { loadActiveProfile, loadPackingState, savePackingState } from "@/lib/db";
import {
  generatePackingList,
  seasonFromMonth,
  type PackingGroup,
} from "@/lib/packing/packing";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

const SEASON_LABELS: Record<string, string> = {
  winter: "hiver",
  spring: "printemps",
  summer: "été",
  autumn: "automne",
};

export function PackingList() {
  const [durationDays, setDurationDays] = useState(15);
  const [month, setMonth] = useState(8);
  const [babyAgeMonths, setBabyAgeMonths] = useState(6);
  const [isWorkation, setIsWorkation] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([loadPackingState(), loadActiveProfile()]).then(([state, profile]) => {
      if (!active) return;
      setDurationDays(state.durationDays);
      setMonth(state.month);
      setChecked(new Set(state.checkedKeys));
      setBabyAgeMonths(profile.baby.ageMonths);
      setIsWorkation(profile.work.workDays.length > 0);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const season = seasonFromMonth(month);

  const groups: PackingGroup[] = useMemo(
    () =>
      generatePackingList({
        durationDays,
        season,
        babyAgeMonths,
        isWorkation,
        travelers: 2,
      }),
    [durationDays, season, babyAgeMonths, isWorkation],
  );

  const allItems = groups.flatMap((g) => g.items);
  const checkedCount = allItems.filter((i) => checked.has(i.key)).length;

  async function persist(nextChecked: Set<string>, nextDuration = durationDays, nextMonth = month) {
    await savePackingState({
      durationDays: nextDuration,
      month: nextMonth,
      checkedKeys: [...nextChecked],
    });
  }

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      void persist(next);
      return next;
    });
  }

  if (loading) {
    return (
      <section className="card p-5" aria-busy="true">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Génération de la liste…
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Durée (jours)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={Number.isNaN(durationDays) ? "" : durationDays}
              onChange={(e) => {
                const v = Math.max(1, Math.min(60, e.target.valueAsNumber));
                setDurationDays(v);
                void persist(checked, v, month);
              }}
              className="h-11 px-3 rounded-lg text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Mois de départ
            </span>
            <select
              value={month}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMonth(v);
                void persist(checked, durationDays, v);
              }}
              className="h-11 px-3 rounded-lg text-sm"
              style={inputStyle}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2026, m - 1, 1).toLocaleString("fr-FR", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Liste adaptée : saison {SEASON_LABELS[season]}, bébé {babyAgeMonths} mois
          {isWorkation ? ", workation" : ""} · {checkedCount}/{allItems.length} cochés
        </p>
      </section>

      {groups.map((group) => (
        <section key={group.category} className="card p-5 space-y-2">
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            {group.label}
          </h2>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const on = checked.has(item.key);
              return (
                <li key={item.key}>
                  <label className="flex items-start gap-3 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(item.key)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent-amber)]"
                    />
                    <span className="min-w-0">
                      <span
                        className="text-sm"
                        style={{
                          color: on ? "var(--text-muted)" : "var(--text-primary)",
                          textDecoration: on ? "line-through" : "none",
                        }}
                      >
                        {item.label}
                        {item.quantity > 1 && (
                          <span className="font-semibold"> × {item.quantity}</span>
                        )}
                        {item.essential && (
                          <span className="badge-estimated ml-2">essentiel</span>
                        )}
                      </span>
                      <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                        {item.reason}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
