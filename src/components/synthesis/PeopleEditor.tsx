"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/Badge";
import { peopleStore } from "@/lib/synthesis/people-store";
import { FRENCH_CITIES } from "@/data/cities";
import type { Person } from "@/lib/synthesis/types";

/**
 * Graphe social géolocalisé (S5) — déposer des personnes sur des lieux
 * (« Marie à Lyon ») avec une fenêtre de disponibilité optionnelle. Stockage
 * **100 % local** (IndexedDB) : les personnes ne quittent jamais l'appareil.
 * Elles deviennent des opportunités que le solveur tisse (ambiance « Sociable »).
 */
export function PeopleEditor({ onChange }: { onChange?: (people: Person[]) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState(FRENCH_CITIES[0]?.name ?? "Lyon");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    void peopleStore.all().then((p) => {
      setPeople(p);
      onChange?.(p);
    });
    // Chargement initial uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const next = await peopleStore.all();
    setPeople(next);
    onChange?.(next);
  }

  async function add() {
    const c = FRENCH_CITIES.find((x) => x.name === city);
    if (!name.trim() || !c) return;
    const person: Person = {
      id: `person-${Date.now()}`,
      title: `${name.trim()} (${c.name})`,
      category: "people",
      location: { lat: c.lat, lng: c.lng },
      score: 0.9,
      durationMin: 180,
      source: "carnet personnel",
      sourceStatus: "verified",
      availability: from && to ? [{ start: from, end: to }] : undefined,
    };
    await peopleStore.add(person);
    setName("");
    setFrom("");
    setTo("");
    await refresh();
  }

  async function remove(id: string) {
    await peopleStore.remove(id);
    await refresh();
  }

  return (
    <section className="card p-4 space-y-4">
      <div>
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Vos proches sur la route
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Stockés sur cet appareil uniquement. Ils deviennent des étapes possibles.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Prénom</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Marie"
            className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Ville</span>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          >
            {FRENCH_CITIES.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Disponible du (optionnel)</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>au (optionnel)</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          />
        </label>
      </div>

      <Button onClick={add} size="sm" disabled={!name.trim()}>
        Ajouter cette personne
      </Button>

      {people.length > 0 && (
        <ul className="space-y-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{p.title}</span>
                <SourceBadge status={p.sourceStatus} />
                {p.availability?.[0] && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.availability[0].start} → {p.availability[0].end}
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={() => remove(p.id)} aria-label={`Retirer ${p.title}`}>
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
