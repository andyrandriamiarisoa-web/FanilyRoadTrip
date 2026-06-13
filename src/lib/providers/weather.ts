import type { SourceStatus } from "./types"

export interface WeatherInput {
  lat: number
  lng: number
  date: string // YYYY-MM-DD
}

export interface WeatherOutput {
  date: string
  tempMaxC: number
  tempMinC: number
  precipMm: number
  heatwave: boolean // tempMax ≥ 36°C
  sourceStatus: SourceStatus
}

// ---------------------------------------------------------------------------
// Seed weather for the Fresnes↔Marseille corridor (early August)
// Based on historical Météo-France averages for 2020-2025
// ---------------------------------------------------------------------------

const SEED_WEATHER: Record<string, Omit<WeatherOutput, "sourceStatus">> = {
  // Fresnes / Île-de-France region
  "48.75,2.32": {
    date: "",
    tempMaxC: 30,
    tempMinC: 18,
    precipMm: 2,
    heatwave: false,
  },
  // Dijon / Côte-d'Or
  "47.32,5.04": {
    date: "",
    tempMaxC: 32,
    tempMinC: 17,
    precipMm: 1,
    heatwave: false,
  },
  // Mâcon / Saône-et-Loire
  "46.29,4.83": {
    date: "",
    tempMaxC: 34,
    tempMinC: 19,
    precipMm: 0,
    heatwave: false,
  },
  // Tain-l'Hermitage / Drôme
  "44.93,4.89": {
    date: "",
    tempMaxC: 37,
    tempMinC: 21,
    precipMm: 0,
    heatwave: true,
  },
  // Marseille
  "43.30,5.37": {
    date: "",
    tempMaxC: 33,
    tempMinC: 22,
    precipMm: 0,
    heatwave: false,
  },
  // Montélimar
  "44.56,4.75": {
    date: "",
    tempMaxC: 38,
    tempMinC: 22,
    precipMm: 0,
    heatwave: true,
  },
  // Beaune
  "47.05,4.84": {
    date: "",
    tempMaxC: 31,
    tempMinC: 16,
    precipMm: 3,
    heatwave: false,
  },
  // Sens
  "48.19,3.28": {
    date: "",
    tempMaxC: 29,
    tempMinC: 17,
    precipMm: 2,
    heatwave: false,
  },
}

function nearestSeedKey(lat: number, lng: number): string | null {
  let bestKey: string | null = null
  let bestDist = Infinity

  for (const key of Object.keys(SEED_WEATHER)) {
    const [klat, klng] = key.split(",").map(Number)
    const dist = Math.hypot(lat - klat, lng - klng)
    if (dist < bestDist) {
      bestDist = dist
      bestKey = key
    }
  }
  // Only use seed if within ~1.5 degrees (~150 km)
  return bestDist < 1.5 ? bestKey : null
}

// ---------------------------------------------------------------------------
// Open-Meteo live fetch (free, no API key)
// ---------------------------------------------------------------------------

interface OpenMeteoResponse {
  daily?: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
  }
}

async function fetchOpenMeteo(input: WeatherInput): Promise<WeatherOutput | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${input.lat}&longitude=${input.lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=Europe%2FParis` +
    `&start_date=${input.date}&end_date=${input.date}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return null

    const data = (await res.json()) as OpenMeteoResponse
    if (!data.daily?.time?.length) return null

    const idx = data.daily.time.indexOf(input.date)
    if (idx === -1) return null

    const tempMaxC = data.daily.temperature_2m_max[idx]
    const tempMinC = data.daily.temperature_2m_min[idx]
    const precipMm = data.daily.precipitation_sum[idx]

    return {
      date: input.date,
      tempMaxC,
      tempMinC,
      precipMm,
      heatwave: tempMaxC >= 36,
      sourceStatus: "verified",
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public weather provider
// Resolution: 1. Open-Meteo live  2. Seed nearest point  3. Default estimate
// ---------------------------------------------------------------------------

export async function getWeather(input: WeatherInput): Promise<WeatherOutput> {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live") {
    return getSeedWeather(input)
  }

  const live = await fetchOpenMeteo(input)
  if (live) return live

  return getSeedWeather(input)
}

function getSeedWeather(input: WeatherInput): WeatherOutput {
  const key = nearestSeedKey(input.lat, input.lng)
  if (key) {
    const seed = SEED_WEATHER[key]
    return { ...seed, date: input.date, sourceStatus: "seed" }
  }
  // Generic estimate for southern France in August
  return {
    date: input.date,
    tempMaxC: 32,
    tempMinC: 18,
    precipMm: 0,
    heatwave: false,
    sourceStatus: "estimated",
  }
}
