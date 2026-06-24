/**
 * `CityAutocomplete` — input ville avec suggestions depuis `FRENCH_CITIES`.
 *
 * S'appuie sur l'élément HTML natif `<datalist>` pour l'accessibilité (clavier,
 * lecteur d'écran, contraste géré par le thème). Pas de dépendance tierce.
 * Le composant accepte n'importe quelle saisie libre — la liste ne filtre pas,
 * elle suggère seulement (anti-pattern #1 : classer sans exclure).
 */
"use client";

import { useId } from "react";
import { FRENCH_CITIES } from "@/data/cities";

interface CityAutocompleteProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  /** id unique du datalist (utile si plusieurs sur la page). */
  listId?: string;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

export function CityAutocomplete({
  label,
  value,
  onChange,
  placeholder,
  required,
  listId,
}: CityAutocompleteProps) {
  const auto = useId();
  const id = listId ?? `cities-${auto}`;
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        list={id}
        autoComplete="off"
        className="h-11 px-3 rounded-lg w-full text-sm"
        style={inputStyle}
      />
      <datalist id={id}>
        {FRENCH_CITIES.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
    </label>
  );
}
