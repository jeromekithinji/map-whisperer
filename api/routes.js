import express from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import {
	addPlace,
	getAllPlaces,
	placeExists,
	placeExistsByUrl,
	getPlacesByListName,
	updatePlaceCoords,
} from './data.js'
import { parseTakeoutExport, validatePlaceData, parseCSV } from './import.js'
import { getRecommendations } from './ai.js'
import { enrichPlaces } from './ai.js'
import { resolvePlaceCoords } from './coordinateResolver.js'
import { fetchPlaceDetails } from './placeDetails.js'
import { handleChatSaved } from './chatSaved.js'

/**
 * Helper function to resolve coordinates in batches
 * Processes specific places without coordinates in batches of 20 to avoid API overload
 * @param {Array} placeIds - Array of place IDs to resolve (optional, if not provided resolves all)
 * @param {number} batchSize - Number of places to process per batch
 * @param {string} defaultCity - Optional default city for context
 */
async function resolveCoordinatesInBatches(
	placeIds = null,
	batchSize = 20,
	defaultCity = null
) {
	let placesToResolve

	if (placeIds && Array.isArray(placeIds) && placeIds.length > 0) {
		// Resolve only the specified places
		const allPlaces = getAllPlaces()
		placesToResolve = allPlaces.filter(
			p =>
				placeIds.includes(p.id) &&
				(!p.lat || !p.lng || p.lat === null || p.lng === null)
		)
	} else {
		// Resolve all places without coordinates (fallback)
		const allPlaces = getAllPlaces()
		placesToResolve = allPlaces.filter(
			p => !p.lat || !p.lng || p.lat === null || p.lng === null
		)
	}

	if (placesToResolve.length === 0) {
		return { resolved: 0, failed: 0 }
	}

	let totalResolved = 0
	let totalFailed = 0

	// Process in batches
	for (let i = 0; i < placesToResolve.length; i += batchSize) {
		const batch = placesToResolve.slice(i, i + batchSize)

		// Process batch with a small delay between API calls to avoid rate limiting
		for (const place of batch) {
			try {
				const result = await resolvePlaceCoords(place, defaultCity)

				if (result.resolved) {
					updatePlaceCoords(place.id, {
						lat: result.lat,
						lng: result.lng,
						placeId: result.placeId,
						address: result.address,
						geoStatus: result.geoStatus,
					})
					totalResolved++
				} else {
					totalFailed++
				}

				// Small delay between API calls to avoid rate limiting
				await new Promise(resolve => setTimeout(resolve, 100))
			} catch (error) {
				console.error(`Error resolving place ${place.id}:`, error)
				totalFailed++
			}
		}

		// Delay between batches
		if (i + batchSize < placesToResolve.length) {
			await new Promise(resolve => setTimeout(resolve, 500))
		}
	}

	return { resolved: totalResolved, failed: totalFailed }
}

const router = express.Router()

// Configure multer for file uploads (memory storage)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit
	},
})

/**
 * POST /api/import
 * Import saved places from Google Takeout export
 */
router.post('/import', async (req, res) => {
	try {
		const { takeoutData, places: placesData } = req.body

		let imported = 0
		let duplicates = 0
		let skipped = 0
		const placesPreview = []

		// Handle direct places array
		if (Array.isArray(placesData)) {
			for (const placeData of placesData) {
				if (!validatePlaceData(placeData)) {
					skipped++
					continue
				}

				if (placeExists(placeData.name, placeData.lat, placeData.lng)) {
					duplicates++
					continue
				}

				const place = addPlace(placeData)
				imported++
				if (placesPreview.length < 5) {
					placesPreview.push({
						id: place.id,
						name: place.name,
						address: place.address,
					})
				}
			}
		}

		// Handle Google Takeout export format
		if (takeoutData) {
			const _parsed = parseTakeoutExport(takeoutData)
			// TODO: Process parsed data and add to places
			// For now, this is a stub
		}

		res.json({
			ok: true,
			imported,
			duplicates,
			skipped,
			placesPreview,
		})
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error.message,
		})
	}
})

/**
 * Helper function to process a single CSV file
 * Returns imported place IDs for coordinate resolution
 */
function processCSVFile(csvContent, listName) {
	const parsed = parseCSV(csvContent, listName)

	let imported = 0
	let duplicates = 0
	let skipped = 0
	const placesPreview = []
	const importedPlaceIds = [] // Track IDs of newly imported places

	for (const placeData of parsed.places) {
		// Skip if name is missing
		if (!placeData.name || placeData.name.trim() === '') {
			skipped++
			continue
		}

		// Check for duplicates by name + url or name + note
		if (
			placeExistsByUrl(
				placeData.name,
				placeData.url,
				placeData.notes
			)
		) {
			duplicates++
			continue
		}

		// Add place
		const place = addPlace(placeData)
		imported++
		importedPlaceIds.push(place.id) // Track this newly imported place

		// Add to preview (first 5 per list)
		if (placesPreview.length < 5) {
			placesPreview.push({
				id: place.id,
				name: place.name,
				url: place.url,
				notes: place.notes,
				placeTags: place.placeTags,
			})
		}
	}

	return {
		list: {
			listName: parsed.listName,
			listTags: parsed.listTags,
			totalRows: parsed.totalRows,
		},
		imported,
		duplicates,
		skipped,
		placesPreview,
		importedPlaceIds, // Return IDs for coordinate resolution
	}
}

/**
 * POST /api/import-csv
 * Import saved places from CSV file upload or ZIP file containing multiple CSVs
 */
router.post('/import-csv', upload.single('file'), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({
				ok: false,
				error: 'No file uploaded',
			})
		}

		const filename = req.file.originalname || 'unknown'
		const fileExtension = filename.toLowerCase().split('.').pop()
		const isZip = fileExtension === 'zip'

		// Handle ZIP file
		if (isZip) {
			const zip = new AdmZip(req.file.buffer)
			const zipEntries = zip.getEntries()

			// Filter for CSV files only
			const csvEntries = zipEntries.filter(
				entry => entry.entryName.toLowerCase().endsWith('.csv')
			)

			if (csvEntries.length === 0) {
				return res.status(400).json({
					ok: false,
					error: 'No CSV files found in ZIP archive',
				})
			}

			// Process each CSV file
			const lists = []
			let totalImported = 0
			let totalDuplicates = 0
			let totalSkipped = 0
			const allPlacesPreview = []
			const allImportedPlaceIds = [] // Track all newly imported place IDs

			for (const entry of csvEntries) {
				// Extract list name from filename (remove .csv extension)
				const entryListName =
					entry.entryName
						.split('/')
						.pop()
						.replace(/\.csv$/i, '')
						.trim() || 'Untitled List'

				// Get CSV content
				const csvContent = entry.getData().toString('utf-8')

				// Process CSV
				const result = processCSVFile(csvContent, entryListName)

				lists.push(result.list)
				totalImported += result.imported
				totalDuplicates += result.duplicates
				totalSkipped += result.skipped

				// Collect imported place IDs
				if (result.importedPlaceIds) {
					allImportedPlaceIds.push(...result.importedPlaceIds)
				}

				// Add preview places (limit to 5 total across all lists)
				for (const preview of result.placesPreview) {
					if (allPlacesPreview.length < 5) {
						allPlacesPreview.push({
							...preview,
							listName: result.list.listName,
						})
					}
				}
			}

			// Send response immediately
			res.json({
				ok: true,
				type: 'zip',
				lists, // Array of all imported lists with their metadata
				imported: totalImported,
				duplicates: totalDuplicates,
				skipped: totalSkipped,
				placesPreview: allPlacesPreview,
			})

			// Resolve coordinates in background (async, non-blocking)
			// Only resolve coordinates for newly imported places
			if (allImportedPlaceIds.length > 0) {
				// Extract default city from first list name if available
				const defaultCity =
					lists.length > 0 && lists[0].listName
						? lists[0].listName
						: null

				// Resolve coordinates for only the newly imported places
				// Wrap in setTimeout to ensure it runs after response is sent
				setTimeout(() => {
					resolveCoordinatesInBatches(allImportedPlaceIds, 20, defaultCity)
						.then(({ resolved, failed }) => {
							console.log(
								`Coordinate resolution completed: ${resolved} resolved, ${failed} failed (out of ${allImportedPlaceIds.length} newly imported places)`
							)
						})
						.catch(error => {
							console.error('Error during coordinate resolution:', error)
							// Don't crash the server - just log the error
						})
				}, 100) // Small delay to ensure response is fully sent
			}
		}

		// Handle single CSV file
		const listName =
			req.body.listName ||
			filename.replace(/\.csv$/i, '').trim() ||
			'Untitled List'

		// Convert buffer to string
		const csvContent = req.file.buffer.toString('utf-8')

		// Process CSV
		const result = processCSVFile(csvContent, listName)

		// Send response immediately
		res.json({
			ok: true,
			type: 'csv',
			list: result.list,
			imported: result.imported,
			duplicates: result.duplicates,
			skipped: result.skipped,
			placesPreview: result.placesPreview,
		})

		// Resolve coordinates in background (async, non-blocking)
		// Only resolve coordinates for newly imported places
		if (result.importedPlaceIds && result.importedPlaceIds.length > 0) {
			// Use list name as default city for better context
			const defaultCity = listName || null

			// Resolve coordinates for only the newly imported places
			// Wrap in setTimeout to ensure it runs after response is sent
			setTimeout(() => {
				resolveCoordinatesInBatches(result.importedPlaceIds, 20, defaultCity)
					.then(({ resolved, failed }) => {
						console.log(
							`Coordinate resolution completed: ${resolved} resolved, ${failed} failed (out of ${result.importedPlaceIds.length} newly imported places)`
						)
					})
					.catch(error => {
						console.error('Error during coordinate resolution:', error)
						// Don't crash the server - just log the error
					})
			}, 100) // Small delay to ensure response is fully sent
		}
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error.message,
		})
	}
})

/**
 * GET /api/places
 * Get all saved places with optional filtering
 */
router.get('/places', (req, res) => {
	try {
		const {
			category,
			type,
			priceLevel,
			vibe,
			limit,
			offset,
			listName,
		} = req.query
		let places = getAllPlaces()

		// Filter by list name if provided
		if (listName) {
			places = getPlacesByListName(listName)
		}

		// Apply filters
		if (category || type) {
			const filterType = category || type
			places = places.filter(p => p.type === filterType)
		}

		if (priceLevel !== undefined) {
			places = places.filter(p => p.priceLevel === parseInt(priceLevel))
		}

		if (vibe) {
			places = places.filter(p => p.vibe === vibe)
		}

		const totalCount = places.length

		// Apply pagination
		const limitNum = limit ? parseInt(limit) : undefined
		const offsetNum = offset ? parseInt(offset) : 0

		if (limitNum) {
			places = places.slice(offsetNum, offsetNum + limitNum)
		} else if (offsetNum > 0) {
			places = places.slice(offsetNum)
		}

		// If filtering by listName, return listName and listTags at top level
		// If getting all places, keep listName in each place object for identification
		if (listName) {
			// Single list: extract metadata and remove from places
			let responseListName = listName
			let responseListTags = []
			if (places.length > 0) {
				responseListTags = places[0].listTags || []
			}

			// Remove listTags and tags from each place (keep listName for reference)
			const placesCleaned = places.map(place => {
				const { listTags: _listTags, tags: _tags, ...placeCleaned } = place
				return placeCleaned
			})

			return res.json({
				ok: true,
				listName: responseListName,
				listTags: responseListTags,
				count: placesCleaned.length,
				totalCount,
				places: placesCleaned,
				meta: {
					limit: limitNum,
					offset: offsetNum,
					hasMore: limitNum
						? offsetNum + placesCleaned.length < totalCount
						: false,
				},
			})
		}

		// All places: keep listName in each place, remove only listTags and tags
		// Get unique lists for metadata and count places per list
		const allPlacesInStorage = getAllPlaces() // Get all places from storage for accurate counts
		const uniqueLists = new Map()
		const listCounts = new Map()

		// Count places per list from all stored places
		allPlacesInStorage.forEach(place => {
			if (place.listName) {
				listCounts.set(
					place.listName,
					(listCounts.get(place.listName) || 0) + 1
				)
			}
		})

		// Build unique lists map from filtered places (for listTags)
		places.forEach(place => {
			if (place.listName && !uniqueLists.has(place.listName)) {
				uniqueLists.set(place.listName, {
					listName: place.listName,
					listTags: place.listTags || [],
					count: listCounts.get(place.listName) || 0, // Add count from all stored places
				})
			}
		})

		const placesCleaned = places.map(place => {
			const { listTags: _listTags, tags: _tags, ...placeCleaned } = place
			return placeCleaned
		})

		res.json({
			ok: true,
			lists: Array.from(uniqueLists.values()), // All unique lists with counts
			count: placesCleaned.length,
			totalCount,
			places: placesCleaned, // Each place has listName field for identification
			meta: {
				limit: limitNum,
				offset: offsetNum,
				hasMore: limitNum
					? offsetNum + placesCleaned.length < totalCount
					: false,
			},
		})
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error.message,
		})
	}
})

/**
 * POST /api/recommend
 * Get AI-powered recommendations based on context
 */
router.post('/recommend', async (req, res) => {
	try {
		const context = req.body
		const places = getAllPlaces()

		const result = await getRecommendations(places, context)

		res.json({
			ok: true,
			interpreted: result.interpreted,
			results: result.results,
		})
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error.message,
		})
	}
})

/**
 * POST /api/enrich
 * Enrich places with AI-generated metadata
 */
router.post('/enrich', async (req, res) => {
	try {
		const places = getAllPlaces()
		const enrichedCount = await enrichPlaces(places)

		res.json({
			ok: true,
			enrichedCount,
		})
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error.message,
		})
	}
})

/**
 * POST /api/resolve-coords
 * Resolve coordinates for saved places using URL extraction or Google Places API
 */
router.post('/resolve-coords', async (req, res) => {
	try {
		const { listName, limit, defaultCity } = req.body

		// Get places to resolve
		let placesToResolve = getAllPlaces()

		// Filter by list name if provided
		if (listName) {
			placesToResolve = getPlacesByListName(listName)
		}

		// Filter places that don't have coordinates yet
		placesToResolve = placesToResolve.filter(
			p => !p.lat || !p.lng || p.lat === null || p.lng === null
		)

		// Apply limit if provided
		const limitNum = limit ? parseInt(limit) : undefined
		if (limitNum && limitNum > 0) {
			placesToResolve = placesToResolve.slice(0, limitNum)
		}

		const requested = placesToResolve.length
		let resolved = 0
		let failed = 0
		const preview = []

		// Resolve coordinates for each place
		for (const place of placesToResolve) {
			try {
				const result = await resolvePlaceCoords(place, defaultCity || null)

				if (result.resolved) {
					// Update place with coordinates
					updatePlaceCoords(place.id, {
						lat: result.lat,
						lng: result.lng,
						placeId: result.placeId,
						address: result.address,
						geoStatus: result.geoStatus,
					})

					resolved++

					// Add to preview (first 5)
					if (preview.length < 5) {
						preview.push({
							id: place.id,
							name: place.name,
							lat: result.lat,
							lng: result.lng,
							geoStatus: result.geoStatus,
						})
					}
				} else {
					failed++
				}
			} catch (error) {
				console.error(`Error resolving place ${place.id}:`, error)
				failed++
			}
		}

		res.json({
			ok: true,
			requested,
			resolved,
			failed,
			preview,
		})
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error.message,
		})
	}
})

/**
 * GET /api/place-details/:placeId
 * Get detailed information for a place using Google Places API
 */
router.get('/place-details/:placeId', async (req, res) => {
	try {
		const { placeId } = req.params

		if (!placeId) {
			return res.status(400).json({
				ok: false,
				error: 'Place ID is required',
			})
		}

		const placeDetails = await fetchPlaceDetails(placeId)

		if (!placeDetails) {
			return res.status(404).json({
				ok: false,
				error: 'Place not found',
			})
		}

		res.json({
			ok: true,
			place: placeDetails,
		})
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error.message || 'Failed to fetch place details',
		})
	}
})

/**
 * POST /api/chat-saved
 * Chat with saved places using Gemini + Google Places enrichment
 */
router.post('/chat-saved', handleChatSaved)

export default router
