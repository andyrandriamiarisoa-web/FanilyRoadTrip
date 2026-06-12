import type { TripPlan } from "@/types";
import LZString from "lz-string";

export function exportTripAsJson(plan: TripPlan): void {
  const json = JSON.stringify(plan, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `odyssee-${plan.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shareTripUrl(plan: TripPlan): string {
  const json = JSON.stringify(plan);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return `${window.location.origin}/carnet?trip=${compressed}`;
}

export function decodeTripFromUrl(encoded: string): TripPlan | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    return JSON.parse(json) as TripPlan;
  } catch {
    return null;
  }
}

export function importTripFromJson(file: File): Promise<TripPlan> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const plan = JSON.parse(text) as TripPlan;
        resolve(plan);
      } catch {
        reject(new Error("Fichier JSON invalide"));
      }
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier"));
    reader.readAsText(file);
  });
}
