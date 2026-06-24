import { redirect } from "next/navigation";

/**
 * `/composer` est désormais fusionné dans `/plan` (Mode B — Voyage avec ancre).
 * Cette redirection conserve les anciens liens partagés.
 */
export default function ComposerPage() {
  redirect("/plan");
}
