// Distance and scoring utilities

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
	const R = 6371 // Earth's radius in kilometers
	const dLat = toRadians(lat2 - lat1)
	const dLng = toRadians(lng2 - lng1)

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRadians(lat1)) *
			Math.cos(toRadians(lat2)) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2)

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
	return R * c
}

function toRadians(degrees) {
	return degrees * (Math.PI / 180)
}

/**
 * Score a place based on various factors
 * Returns a score from 0-100
 */
export function scorePlace(place, context = {}) {
	let score = 50 // Base score

	// Distance scoring (closer = higher score)
	if (context.userLat && context.userLng) {
		const distance = calculateDistance(
			context.userLat,
			context.userLng,
			place.lat,
			place.lng
		)
		// Closer places get higher scores (max 30 points for distance)
		const distanceScore = Math.max(0, 30 - distance * 2)
		score += distanceScore
	}

	// Time of day scoring
	if (context.timeOfDay && place.type) {
		// TODO: Implement time-based scoring logic
		// e.g., breakfast places score higher in morning
	}

	// Category/type matching
	if (context.category && place.type === context.category) {
		score += 20
	}

	// Price level matching
	if (context.priceLevel !== undefined && place.priceLevel === context.priceLevel) {
		score += 10
	}

	// Vibe/mood matching
	if (context.vibe && place.vibe === context.vibe) {
		score += 10
	}

	return Math.min(100, Math.max(0, score))
}

/**
 * Sort places by score (descending)
 */
export function sortByScore(places, context) {
	return places
		.map(place => ({
			place,
			score: scorePlace(place, context),
		}))
		.sort((a, b) => b.score - a.score)
		.map(item => item.place)
}
