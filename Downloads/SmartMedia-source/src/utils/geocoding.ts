/**
 * Reverse Geocoding Utilities
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 */

interface LocationInfo {
  city?: string
  state?: string
  country?: string
  displayName: string
}

// Cache to avoid repeated API calls for same coordinates
const geocodeCache = new Map<string, LocationInfo>()

/**
 * Get location name from GPS coordinates using reverse geocoding
 * @param lat Latitude
 * @param lon Longitude
 * @returns Location information (city, state, country)
 */
export async function reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null> {
  // Round coordinates to 3 decimal places for caching (~100m precision)
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`
  
  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!
  }
  
  try {
    // Use Nominatim API (free, open source)
    // Rate limit: 1 request per second (we handle this with caching)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?` +
      `lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'SmartMedia-PhotoApp/1.0' // Required by Nominatim
        }
      }
    )
    
    if (!response.ok) {
      console.warn('[Geocoding] API request failed:', response.status)
      return null
    }
    
    const data = await response.json()
    
    if (!data || data.error) {
      console.warn('[Geocoding] No results found')
      return null
    }
    
    // Extract location components
    const address = data.address || {}
    const locationInfo: LocationInfo = {
      city: address.city || address.town || address.village || address.suburb,
      state: address.state || address.region,
      country: address.country,
      displayName: data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    }
    
    // Cache the result
    geocodeCache.set(cacheKey, locationInfo)
    
    console.log('[Geocoding] Success:', locationInfo)
    return locationInfo
    
  } catch (error) {
    console.error('[Geocoding] Error:', error)
    return null
  }
}

/**
 * Format location info for display
 * @param info Location information
 * @param short If true, return short format (City, Country)
 */
export function formatLocation(info: LocationInfo, short: boolean = false): string {
  if (short) {
    const parts = []
    if (info.city) parts.push(info.city)
    if (info.country) parts.push(info.country)
    return parts.join(', ') || info.displayName
  }
  
  // Full format: City, State, Country
  const parts = []
  if (info.city) parts.push(info.city)
  if (info.state) parts.push(info.state)
  if (info.country) parts.push(info.country)
  
  return parts.length > 0 ? parts.join(', ') : info.displayName
}

/**
 * Clear geocoding cache (useful for testing)
 */
export function clearGeocodeCache() {
  geocodeCache.clear()
}
