/**
 * Generates booking deep-link URLs for a lodging search across major platforms.
 */

export interface DeepLinkOptions {
  city: string
  checkin: string    // YYYY-MM-DD
  checkout: string   // YYYY-MM-DD
  adults: number
  children: number   // infants / children
  lat?: number
  lng?: number
  radiusKm?: number
}

export interface BookingLink {
  platform: string
  url: string
}

/**
 * Returns one URL per supported booking platform for a given city and date range.
 * All parameters are URL-encoded where necessary.
 */
export function generateBookingLinks(opts: DeepLinkOptions): BookingLink[] {
  const encodedCity = encodeURIComponent(opts.city)

  // Booking.com
  const bookingUrl =
    `https://www.booking.com/searchresults.fr.html` +
    `?ss=${encodedCity}` +
    `&checkin=${opts.checkin}` +
    `&checkout=${opts.checkout}` +
    `&group_adults=${opts.adults}` +
    `&group_children=${opts.children}` +
    `&nr_rooms=1` +
    `&lang=fr`

  // Airbnb
  const airbnbUrl =
    `https://www.airbnb.fr/s/${encodedCity}/homes` +
    `?checkin=${opts.checkin}` +
    `&checkout=${opts.checkout}` +
    `&adults=${opts.adults}` +
    `&children=${opts.children}`

  // Abritel / Vrbo (French locale)
  const abritelUrl =
    `https://www.abritel.fr/search` +
    `?q=${encodedCity}` +
    `&startDate=${opts.checkin}` +
    `&endDate=${opts.checkout}` +
    `&adults=${opts.adults}` +
    `&children=${opts.children}`

  // Google Hotels
  const googleDates = `${opts.checkin}%2C${opts.checkout}`
  const googleUrl =
    `https://www.google.fr/travel/hotels/${encodedCity}` +
    `?q=hotels+${encodedCity}` +
    `&dates=${googleDates}` +
    `&adults=${opts.adults}` +
    `&children=${opts.children}`

  // Trivago
  const trivagoUrl =
    `https://www.trivago.fr/` +
    `?search%5Bdestination%5D=${encodeURIComponent(opts.city)}` +
    `&search%5BcheckInDate%5D=${opts.checkin}` +
    `&search%5BcheckOutDate%5D=${opts.checkout}` +
    `&search%5BnumberOfAdults%5D=${opts.adults}` +
    `&search%5BnumberOfChildren%5D=${opts.children}`

  return [
    { platform: "booking", url: bookingUrl },
    { platform: "airbnb", url: airbnbUrl },
    { platform: "abritel", url: abritelUrl },
    { platform: "google", url: googleUrl },
    { platform: "trivago", url: trivagoUrl },
  ]
}
