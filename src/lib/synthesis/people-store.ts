import type { Person } from "./types";
import { listPeople, addPerson, deletePerson } from "@/lib/db";

// Graphe social, stockage **local** (privé, hors-ligne) — fusionné dans la base
// Dexie existante (`odyssee-db`, table `people`, version 7) plutôt qu'une 2ᵉ base.
// Les personnes ne quittent jamais l'appareil.
export const peopleStore = {
  all: (): Promise<Person[]> => listPeople(),
  add: (p: Person): Promise<void> => addPerson(p),
  remove: (id: string): Promise<void> => deletePerson(id),
};
