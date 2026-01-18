// In-memory storage for places
let places = []

// Generate unique ID
function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Add a place
export function addPlace(placeData) {
	const place = {
		id: generateId(),
		name: placeData.name || '',
		lat: placeData.lat || null,
		lng: placeData.lng || null,
		address: placeData.address || null,
		listName: placeData.listName || null,
		listTags: placeData.listTags || [],
		placeTags: placeData.placeTags || [], // Place-specific tags
		notes: placeData.notes || null,
		url: placeData.url || null,
		savedAt: placeData.savedAt || null,
		tags: placeData.tags || [], // Combined tags (list + place)
		type: placeData.type || null,
		vibe: placeData.vibe || null,
		priceLevel: placeData.priceLevel || null,
		placeId: placeData.placeId || null,
		comment: placeData.comment || null,
		createdAt: new Date().toISOString(),
	}
	places.push(place)
	return place
}

// Get all places
export function getAllPlaces() {
	return [...places]
}

// Get place by ID
export function getPlaceById(id) {
	return places.find(p => p.id === id) || null
}

// Check if place already exists (by coordinates and name)
export function placeExists(name, lat, lng) {
	return places.some(
		p =>
			p.name === name &&
			Math.abs(p.lat - lat) < 0.0001 &&
			Math.abs(p.lng - lng) < 0.0001
	)
}

// Check if place already exists by name + url, or name + note if url is missing
export function placeExistsByUrl(name, url, note = null) {
	if (!name) return false

	return places.some(p => {
		if (p.name !== name) return false

		// If both have URLs, match by name + url
		if (url && p.url) {
			return p.url === url
		}

		// If URL is missing, match by name + note
		if (!url && !p.url && note && p.notes) {
			return p.notes === note
		}

		// If one has URL and other doesn't, they're different
		if ((url && !p.url) || (!url && p.url)) {
			return false
		}

		// Both missing URL and note - match by name only (could be improved)
		return !url && !p.url && !note && !p.notes
	})
}

// Clear all places
export function clearPlaces() {
	places = []
}

// Get places count
export function getPlacesCount() {
	return places.length
}

// Get places by list name
export function getPlacesByListName(listName) {
	return places.filter(p => p.listName === listName)
}

// Update place coordinates
export function updatePlaceCoords(placeId, coords) {
	const place = places.find(p => p.id === placeId)
	if (!place) return null

	if (coords.lat !== undefined) place.lat = coords.lat
	if (coords.lng !== undefined) place.lng = coords.lng
	if (coords.placeId !== undefined) place.placeId = coords.placeId
	if (coords.address !== undefined) place.address = coords.address
	if (coords.geoStatus !== undefined) place.geoStatus = coords.geoStatus

	return place
}
