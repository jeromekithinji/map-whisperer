// Place details fetcher using Google Places API (New) v1

/**
 * Fetch place details from Google Places API
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object|null>} - Normalized place details or null
 */
export async function fetchPlaceDetails(placeId) {
	const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
	if (!apiKey) {
		console.warn('Google Places API key not configured')
		return null
	}

	if (!placeId) {
		return null
	}

	try {
		// Google Places API (New) v1 Place Details endpoint
		const url = `https://places.googleapis.com/v1/places/${placeId}`
		
		// FieldMask specifies which fields to return (required by API)
		// Requesting only the fields we need to minimize response size
		// Field paths use dot notation for nested fields
		const fieldMask = [
			'displayName',
			'formattedAddress',
			'websiteUri',
			'nationalPhoneNumber',
			'internationalPhoneNumber',
			'rating',
			'userRatingCount',
			'priceLevel',
			'primaryType',
			'primaryTypeDisplayName',
			'types',
			'regularOpeningHours.weekdayDescriptions',
			'regularOpeningHours.openNow',
			'regularOpeningHours.periods',
			'reviews.authorAttribution.displayName',
			'reviews.rating',
			'reviews.text.text',
			'reviews.publishTime',
			'editorialSummary.text',
		].join(',')

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': apiKey,
				'X-Goog-FieldMask': fieldMask,
			},
		})

		if (!response.ok) {
			if (response.status === 404) {
				return null // Place not found
			}
			console.error('Google Places API error:', response.status, response.statusText)
			return null
		}

		const data = await response.json()

		// Normalize the response
		return normalizePlaceDetails(data, placeId)
	} catch (error) {
		console.error('Error fetching place details:', error)
		return null
	}
}

/**
 * Normalize Google Places API response to frontend-friendly format
 * @param {Object} data - Raw API response
 * @param {string} placeId - Place ID
 * @returns {Object} - Normalized place details
 */
function normalizePlaceDetails(data, placeId) {
	// Normalize opening hours
	let openingHours = null
	if (data.regularOpeningHours) {
		openingHours = {
			weekdayText: data.regularOpeningHours.weekdayDescriptions || [],
			openNow: data.regularOpeningHours.openNow || null,
			periods: data.regularOpeningHours.periods || null, // Store periods for time calculations
		}
	}

	// Normalize reviews (limit to first 3)
	let reviews = []
	if (data.reviews && Array.isArray(data.reviews)) {
		reviews = data.reviews.slice(0, 3).map((review) => ({
			author: review.authorAttribution?.displayName || 'Anonymous',
			rating: review.rating || null,
			text: review.text?.text || null,
			relativeTime: review.publishTime || null,
		}))
	}

	// Normalize categories/types
	// primaryTypeDisplayName might be an object with text property
	const primaryDisplayName = data.primaryTypeDisplayName
		? typeof data.primaryTypeDisplayName === 'string'
			? data.primaryTypeDisplayName
			: data.primaryTypeDisplayName.text || null
		: null

	// Types might be strings or objects
	const types = (data.types || []).map((type) =>
		typeof type === 'string' ? type : type.text || type
	)

	const categories = {
		primary: data.primaryType || null,
		primaryDisplayName,
		types,
	}

	return {
		placeId,
		name: data.displayName?.text || data.displayName || null,
		address: data.formattedAddress || null,
		rating: data.rating || null,
		userRatingCount: data.userRatingCount || null,
		priceLevel: data.priceLevel || null, // 0-4 scale
		categories,
		contact: {
			phone: data.nationalPhoneNumber || data.internationalPhoneNumber || null,
			website: data.websiteUri || null,
		},
		openingHours,
		about: data.editorialSummary?.text || data.editorialSummary || null,
		reviews,
	}
}
