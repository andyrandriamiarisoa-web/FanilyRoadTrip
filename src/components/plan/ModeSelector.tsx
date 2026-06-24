/**
 * `ModeSelector` — sélecteur entre les deux modes de planification de la page
 * `/plan`. Deux cartes radio bien lisibles, accessibles au clavier
 * (`role="radiogroup"`), avec un libellé clair pour chaque mode.
 */
"use client";

export type PlanMode = "planned" | "anchored";

interface ModeSelectorProps {
  value: PlanMode;
  onChange: (next: PlanMode) => void;
}

const OPTIONS: { value: PlanMode; title: string; description: string }[] = [
  {
    value: "planned",
    title: "Voyage planifié",
    description:
      "Vous connaissez les dates de départ et de retour, et les villes à respecter. L'app propose un itinéraire cohérent jour par jour.",
  },
  {
    value: "anchored",
    title: "Voyage avec ancre",
    description:
      "Vous avez un événement à date et lieu fixes (mariage, concert, RDV). L'app calcule les dates de départ et de retour et propose plusieurs voyages cohérents pour s'y rendre.",
  },
];

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choisir un mode de planification"
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="text-left rounded-xl p-4 min-h-[44px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: active ? "var(--bg-surface)" : "var(--bg-base)",
              border: `2px solid ${
                active ? "var(--accent-amber)" : "var(--border-default)"
              }`,
              outlineColor: "var(--accent-amber)",
            }}
          >
            <p
              className="font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {opt.title}
            </p>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {opt.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
