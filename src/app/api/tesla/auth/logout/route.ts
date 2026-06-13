import { NextResponse } from "next/server"
import { TESLA_SESSION_COOKIE } from "@/lib/vehicle/tesla-session"

/** Déconnecte le compte Tesla : purge le cookie de session chiffré. */
export const runtime = "nodejs"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(TESLA_SESSION_COOKIE)
  return res
}
