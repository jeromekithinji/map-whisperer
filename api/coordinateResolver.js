// Coordinate resolver for saved places
// Extracts coordinates from Google Maps URLs or uses Google Places API

/**
 * Extract coordinates from Google Maps URL using regex patterns
 * @param {string} url - Google Maps URL
 * @returns {Object|null} - { lat, lng } or null if not found
 */
export function extractCoordsFromUrl(url) {
	if (!url || typeof url !== 'string') return null

	// Pattern 1: @lat,lng (e.g., @45.5017,-73.5673)
	const pattern1 = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/i
	const match1 = url.match(pattern1)
	if (match1) {
		return {
			lat: parseFloat(match1[1]),
			lng: parseFloat(match1[2]),
		}
	}

	// Pattern 2: !3dLAT!4dLNG (e.g., !3d45.5017!4d-73.5673)
	const pattern2 = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/i
	const match2 = url.match(pattern2)
	if (match2) {
		return {
			lat: parseFloat(match2[1]),
			lng: parseFloat(match2[2]),
		}
	}

	// Pattern 3: q=lat,lng (e.g., q=45.5017,-73.5673)
	const pattern3 = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/i
	const match3 = url.match(pattern3)
	if (match3) {
		return {
			lat: parseFloat(match3[1]),
			lng: parseFloat(match3[2]),
		}
	}

	return null
}

/**
 * Resolve coordinates using Google Places API (New) v1
 * @param {string} placeName - Name of the place
 * @param {string} address - Optional address
 * @param {string} defaultCity - Optional default city for context
 * @returns {Promise<Object|null>} - { lat, lng, placeId } or null
 */
export async function resolveCoordsWithPlacesAPI(
	placeName,
	address = null,
	defaultCity = null
) {
	const apiKey = process.env.GOOGLE_PLACES_API_KEY
	if (!apiKey) {
		console.warn('Google Places API key not configured')
		return null
	}

	try {
		// Build search query
		let query = placeName
		if (address) {
			query += ` ${address}`
		}
		if (defaultCity) {
			query += ` ${defaultCity}`
		}

		// Use Google Places API (New) Text Search
		const response = await fetch(
			'https://places.googleapis.com/v1/places:searchText',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Api-Key': apiKey,
					'X-Goog-FieldMask': 'places.id,places.location,places.formattedAddress',
				},
				body: JSON.stringify({
					textQuery: query,
					maxResultCount: 1,
				}),
			}
		)

		if (!response.ok) {
			console.error('Google Places API error:', response.statusText)
			return null
		}

		const data = await response.json()

		if (data.places && data.places.length > 0) {
			const place = data.places[0]
			const location = place.location

			if (location && location.latitude && location.longitude) {
				return {
					lat: location.latitude,
					lng: location.longitude,
					placeId: place.id || null,
					address: place.formattedAddress || null,
				}
			}
		}

		return null
	} catch (error) {
		console.error('Error resolving coordinates with Places API:', error)
		return null
	}
}

/**
 * Resolve coordinates for a single place
 * @param {Object} place - Place object
 * @param {string} defaultCity - Optional default city
 * @returns {Promise<Object>} - { resolved: boolean, lat?, lng?, placeId?, address?, geoStatus }
 */
export async function resolvePlaceCoords(place, defaultCity = null) {
	// Try URL extraction first
	if (place.url) {
		const coords = extractCoordsFromUrl(place.url)
		if (coords) {
			return {
				resolved: true,
				lat: coords.lat,
				lng: coords.lng,
				geoStatus: 'resolved',
			}
		}
	}

	// Fallback to Google Places API
	if (place.name) {
		const apiResult = await resolveCoordsWithPlacesAPI(
			place.name,
			place.address,
			defaultCity
		)

		if (apiResult) {
			return {
				resolved: true,
				lat: apiResult.lat,
				lng: apiResult.lng,
				placeId: apiResult.placeId,
				address: apiResult.address,
				geoStatus: 'resolved',
			}
		}
	}

	return {
		resolved: false,
		geoStatus: 'failed',
	}
}
