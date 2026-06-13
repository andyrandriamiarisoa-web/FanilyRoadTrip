/**
 * Cache TTL devant un `LodgingAvailabilityProvider` — préserve le **quota
 * gratuit** (Amadeus) et la latence : au plus une recherche facturée par
 * (ville + dates + occupants) et par fenêtre TTL. Le `readAt` des offres reste
 * la vraie heure de lecture → fraîcheur affichée honnêtement.
 */

import type {
  AvailabilityRequest,
  AvailabilityResult,
  AvailabilityMode,
  LodgingAvailabilityProvider,
} from "./types"

interface CacheEntry {
  value: AvailabilityResult
  expiresAt: number
}

export interface CachingOptions {
  ttlMs: number
  now?: () => number
  store?: Map<string, CacheEntry>
}

const moduleStore = new Map<string, CacheEntry>()

export class CachingLodgingAvailabilityProvider implements LodgingAvailabilityProvider {
  readonly mode: AvailabilityMode
  private readonly delegate: LodgingAvailabilityProvider
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly store: Map<string, CacheEntry>

  constructor(delegate: LodgingAvailabilityProvider, opts: CachingOptions) {
    this.delegate = delegate
    this.mode = delegate.mode
    this.ttlMs = opts.ttlMs
    this.now = opts.now ?? Date.now
    this.store = opts.store ?? moduleStore
  }

  async search(req: AvailabilityRequest): Promise<AvailabilityResult> {
    const key = `${this.mode}|${req.city}|${req.lat}|${req.lng}|${req.checkIn}|${req.checkOut}|${req.adults}|${req.children}`
    const hit = this.store.get(key)
    if (hit && hit.expiresAt > this.now()) return hit.value
    const value = await this.delegate.search(req)
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs })
    return value
  }
}
