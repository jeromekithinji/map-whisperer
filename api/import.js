// Google Takeout export parsing logic
import { parse } from 'csv-parse/sync'

/**
 * Parse Google Takeout export data
 * TODO: Implement actual parsing logic for Google Takeout JSON format
 * Expected format from Google Takeout: Saved Places JSON export
 */
export function parseTakeoutExport(takeoutData) {
	// Stub implementation
	// TODO: Parse the actual Google Takeout JSON structure
	// Google Takeout exports saved places in a specific JSON format
	// that includes location data, place names, lists, etc.

	const imported = []
	const duplicates = []
	const skipped = []

	// Example structure (to be replaced with actual parsing):
	// if (Array.isArray(takeoutData)) {
	//   takeoutData.forEach(item => {
	//     const place = {
	//       name: item.title || item.name,
	//       lat: item.location?.latitude,
	//       lng: item.location?.longitude,
	//       address: item.address,
	//       listName: item.listName,
	//       notes: item.notes,
	//       savedAt: item.savedAt,
	//     }
	//     // Check for duplicates and add to places
	//   })
	// }

	return {
		imported,
		duplicates,
		skipped,
	}
}

/**
 * Parse CSV file content for saved places
 * @param {string} csvContent - Raw CSV content as string
 * @param {string} listName - Name of the list (from filename)
 * @returns {Object} Parsed data with list metadata and places
 */
export function parseCSV(csvContent, listName) {
	try {
		// Parse CSV with proper handling of multi-line fields
		const records = parse(csvContent, {
			columns: true,
			skip_empty_lines: true,
			trim: true,
			relax_column_count: true,
		})

		if (records.length === 0) {
			return {
				listName,
				listTags: [],
				places: [],
				totalRows: 0,
			}
		}

		// First data row (index 0 after headers) contains list metadata
		const metadataRow = records[0]
		let listTags = []
		const totalRows = records.length // Count before potentially removing metadata row

		// Check if first row is metadata (Title is empty/null)
		if (!metadataRow.Title || metadataRow.Title.trim() === '') {
			// Extract list tags from Tags column
			if (metadataRow.Tags) {
				listTags = metadataRow.Tags.split(';')
					.map(tag => tag.trim())
					.filter(tag => tag.length > 0)
			}
			// Remove metadata row from places
			records.shift()
		}

		// Parse places from remaining rows
		const places = []
		for (const row of records) {
			// Skip rows without a Title
			if (!row.Title || row.Title.trim() === '') {
				continue
			}

			// Parse place tags (single tag or semicolon-separated)
			let placeTags = []
			if (row.Tags && row.Tags.trim()) {
				placeTags = row.Tags.split(';')
					.map(tag => tag.trim())
					.filter(tag => tag.length > 0)
			}

			// Combine list tags and place tags (avoid duplicates)
			const allTags = [...listTags]
			for (const tag of placeTags) {
				if (!allTags.includes(tag)) {
					allTags.push(tag)
				}
			}

			const place = {
				name: row.Title.trim(),
				notes: row.Note ? row.Note.trim() : null,
				url: row.URL ? row.URL.trim() : null,
				placeTags: [...placeTags], // Store place-specific tags separately
				tags: allTags, // Combined tags (list + place, deduplicated)
				listName,
				listTags: [...listTags], // Store list tags separately for context
				comment: row.Comment ? row.Comment.trim() : null,
				// TODO: Extract coordinates from Google Maps URL
				// TODO: Use Google Places API to enrich with lat/lng, placeId, address
				lat: null,
				lng: null,
				placeId: null,
				address: null,
			}

			places.push(place)
		}

		return {
			listName,
			listTags,
			places,
			totalRows, // Total rows including metadata row if it existed
		}
	} catch (error) {
		throw new Error(`CSV parsing failed: ${error.message}`)
	}
}

/**
 * Validate place data before importing
 */
export function validatePlaceData(placeData) {
	if (!placeData.name || !placeData.lat || !placeData.lng) {
		return false
	}
	if (
		typeof placeData.lat !== 'number' ||
		typeof placeData.lng !== 'number'
	) {
		return false
	}
	if (placeData.lat < -90 || placeData.lat > 90) {
		return false
	}
	if (placeData.lng < -180 || placeData.lng > 180) {
		return false
	}
	return true
}
