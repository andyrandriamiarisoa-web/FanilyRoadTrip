/**
 * `StopList` — liste éditable d'étapes intermédiaires (mode A et B).
 *
 * Chaque étape : ville + nombre de nuits + option « date fixée » (révèle un
 * champ date) ou « laisser l'algo proposer ». Aucune contrainte excluante :
 * une étape sans date fixée est simplement une préférence, l'algorithme la
 * placera au mieux. La liste peut être vide.
 */
"use client";

import { CityAutocomplete } from "./CityAutocomplete";
import { Button } from "@/components/ui/Button";

export interface PlanStop {
  /** Nom de la ville (saisie libre + suggestions). */
  city: string;
  /** Nombre de nuits sur place (0 = simple passage). */
  nights: number;
  /** Date fixée (YYYY-MM-DD) ou null pour laisser l'algo proposer. */
  fixedDate: string | null;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

interface StopListProps {
  stops: PlanStop[];
  onChange: (next: PlanStop[]) => void;
  /** Libellé du bouton d'ajout (ex. « Ajouter une étape »). */
  addLabel?: string;
  /** Texte d'aide affiché sous la liste quand elle est vide. */
  emptyHint?: string;
}

export function StopList({
  stops,
  onChange,
  addLabel = "Ajouter une étape",
  emptyHint,
}: StopListProps) {
  function update(index: number, patch: Partial<PlanStop>) {
    onChange(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function remove(index: number) {
    onChange(stops.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...stops, { city: "", nights: 1, fixedDate: null }]);
  }

  return (
    <div className="space-y-3">
      {stops.length === 0 && emptyHint && (
        <p
          className="text-sm italic"
          style={{ color: "var(--text-secondary)" }}
        >
          {emptyHint}
        </p>
      )}

      <ol className="space-y-3">
        {stops.map((stop, i) => {
          const fixedId = `stop-${i}-fixed`;
          return (
            <li
              key={i}
              className="rounded-xl p-4 space-y-3"
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Étape {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-xs underline min-h-[44px] px-2"
                  style={{ color: "var(--text-secondary)" }}
                  aria-label={`Supprimer l'étape ${i + 1}`}
                >
                  Supprimer
                </button>
              </div>

              <CityAutocomplete
                label="Ville"
                value={stop.city}
                onChange={(v) => update(i, { city: v })}
                placeholder="ex. Lyon"
              />

              <label className="flex flex-col gap-1.5">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Nombre de nuits
                </span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={stop.nights}
                  onChange={(e) =>
                    update(i, {
                      nights: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="h-11 px-3 rounded-lg w-full text-sm"
                  style={inputStyle}
                />
                <span
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  0 = simple passage (sans nuit sur place)
                </span>
              </label>

              <div className="space-y-2">
                <label
                  htmlFor={fixedId}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    id={fixedId}
                    type="checkbox"
                    checked={stop.fixedDate !== null}
                    onChange={(e) =>
                      update(i, {
                        fixedDate: e.target.checked
                          ? (stop.fixedDate ?? "")
                          : null,
                      })
                    }
                    className="w-5 h-5"
                  />
                  <span
                    className="text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Date fixée dans le temps
                  </span>
                </label>
                {stop.fixedDate !== null && (
                  <input
                    type="date"
                    value={stop.fixedDate}
                    onChange={(e) => update(i, { fixedDate: e.target.value })}
                    aria-label={`Date fixée de l'étape ${i + 1}`}
                    className="h-11 px-3 rounded-lg w-full text-sm"
                    style={inputStyle}
                  />
                )}
                {stop.fixedDate === null && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    L’algorithme placera cette étape au mieux dans la fenêtre du voyage.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Button type="button" variant="secondary" onClick={add}>
        + {addLabel}
      </Button>
    </div>
  );
}
