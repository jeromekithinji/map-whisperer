// Chat with saved places using Gemini + Google Places enrichment
// Note: Using direct fetch calls instead of OpenRouter SDK for better server-side compatibility

import { getAllPlaces, getPlacesByListName } from './data.js'
import { fetchPlaceDetails } from './placeDetails.js'

// Initialize OpenRouter client - check if API key is available
const getOpenRouterApiKey = () => {
	return process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || null
}

// Note: We use direct fetch calls instead of OpenRouter SDK for better server-side compatibility

// In-memory session storage (simple map)
const sessions = new Map()

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
	const R = 6371 // Earth's radius in km
	const dLat = ((lat2 - lat1) * Math.PI) / 180
	const dLng = ((lng2 - lng1) * Math.PI) / 180
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2)
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
	return R * c
}

/**
 * Call Gemini API to understand user intent and update slots
 */
async function interpretMessageWithGemini(message, currentSlots = {}) {
	const apiKey = getOpenRouterApiKey()
	if (!apiKey) {
		console.warn('OpenRouter API key not configured. Please set OPENROUTER_API_KEY or GEMINI_API_KEY environment variable.')
		// Fallback: simple keyword matching
		return {
			intentType: "recommendations",
			slots: currentSlots,
			targetPlaceName: null,
			questionType: null,
			needsFollowUp: false,
			questions: [],
			assistantMessage: "I can help you find places from your saved lists. What are you looking for?",
		}
	}
	
	try {
		const prompt = `You are a helpful assistant that helps users find places from their saved places list.

Current conversation slots (what we know so far):
${JSON.stringify(currentSlots, null, 2)}

User message: "${message}"

IMPORTANT: First determine the user's intent:

A) If the user is asking a SPECIFIC QUESTION about a place (e.g., "what time does it open", "what's the rating", "what's the address", "is it open now", "what's the phone number", "what's the website"), then:
   - Set "intentType" to "informational"
   - Extract the place name from the message or context (e.g., "African BBQ House")
   - Set "targetPlaceName" to the place name (null if unclear)
   - Set "questionType" to one of: "openingHours", "rating", "address", "phone", "website", "openNow", "general"
   - Set "needsFollowUp" to false
   - Don't set any slots - this is just an information request
   - assistantMessage should indicate you'll provide the answer

B) If the user is looking for RECOMMENDATIONS (e.g., "looking for restaurants", "find me places", "where can I eat"), then:
   - Set "intentType" to "recommendations"
   - Extract any new information from the user's message and update the slots accordingly
   - ALWAYS show results based on what we know - don't require all details
   - After showing results, you can ask ONE simple follow-up question (optional) to help narrow down further
   - Set "needsFollowUp" to false (we show results first, questions come after)
   - Only populate questions array if you want to suggest a refinement after results (max 1 question)

Return a JSON object with this structure:
{
  "intentType": "informational" | "recommendations",
  "slots": { ...updated slots... } (only if intentType is "recommendations"),
  "targetPlaceName": "place name or null" (only if intentType is "informational"),
  "questionType": "openingHours" | "rating" | "address" | "phone" | "website" | "openNow" | "general" | null,
  "needsFollowUp": false,
  "questions": ["one optional question"] (max 1, empty array if none needed, only if intentType is "recommendations"),
  "assistantMessage": "A friendly response explaining what you'll do"
}

Only return valid JSON, no other text.`

		// Check if API key is available
		if (!apiKey) {
			throw new Error('OpenRouter API key not configured. Please set OPENROUTER_API_KEY or GEMINI_API_KEY environment variable.')
		}

		// Use OpenRouter REST API directly (more reliable than SDK for server-side)
		const httpResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://saveMapDemo.local', // Optional: for OpenRouter analytics
				'X-Title': 'Map Whisperer Chat', // Optional: for OpenRouter analytics
			},
			body: JSON.stringify({
				model: "google/gemini-2.5-flash",
				messages: [
					{
						role: "user",
						content: prompt
					}
				]
			})
		})

		if (!httpResponse.ok) {
			const errorText = await httpResponse.text().catch(() => 'Unknown error')
			throw new Error(`OpenRouter API error: ${httpResponse.status} ${httpResponse.statusText} - ${errorText}`)
		}

		const responseData = await httpResponse.json()

		// OpenRouter response format: data.choices[0].message.content (string)
		const text = responseData.choices?.[0]?.message?.content || '{}'
		
		// Extract JSON from response (handle markdown code blocks if present)
		const jsonMatch = text.match(/\{[\s\S]*\}/)
		const jsonText = jsonMatch ? jsonMatch[0] : text
		
		const result = JSON.parse(jsonText)
		
		return {
			intentType: result.intentType || "recommendations",
			slots: result.slots || currentSlots,
			targetPlaceName: result.targetPlaceName || null,
			questionType: result.questionType || null,
			needsFollowUp: result.needsFollowUp || false,
			questions: result.questions || [],
			assistantMessage: result.assistantMessage || "I can help you find places. What are you looking for?",
		}
	} catch (error) {
		console.error('Error calling OpenRouter/Gemini API:', error)
		// Fallback response
		return {
			intentType: "recommendations",
			slots: currentSlots,
			targetPlaceName: null,
			questionType: null,
			needsFollowUp: false,
			questions: [],
			assistantMessage: "I can help you find places from your saved lists. What are you looking for?",
		}
	}
}

/**
 * Filter candidates from saved places based on slots
 */
function filterCandidates(places, slots, listName = null) {
	let candidates = listName ? getPlacesByListName(listName) : places

	// Filter by category if specified
	if (slots.category) {
		const categoryLower = slots.category.toLowerCase()
		candidates = candidates.filter((p) => {
			// Check tags, placeTags, type, name
			const allTags = [
				...(p.tags || []),
				...(p.placeTags || []),
				p.type,
				p.name,
			].filter(Boolean).map(t => t.toLowerCase())
			
			return allTags.some(tag => tag.includes(categoryLower))
		})
	}

	// Filter by cuisine if specified
	if (slots.cuisine) {
		const cuisineLower = slots.cuisine.toLowerCase()
		candidates = candidates.filter((p) => {
			const allTags = [
				...(p.tags || []),
				...(p.placeTags || []),
				p.name,
				p.notes,
			].filter(Boolean).map(t => t.toLowerCase())
			
			return allTags.some(tag => tag.includes(cuisineLower))
		})
	}

	// Filter by price if specified
	if (slots.price && slots.price !== 'any') {
		// Map price to priceLevel: cheap = 0-1, mid = 2
		const targetLevels = slots.price === 'cheap' ? [0, 1] : [2, 3]
		candidates = candidates.filter((p) => {
			if (p.priceLevel === null || p.priceLevel === undefined) return true // Include if unknown
			return targetLevels.includes(p.priceLevel)
		})
	}

	// Limit to top 30-50 candidates for further processing
	return candidates.slice(0, 50)
}

/**
 * Score a place based on slots and enriched data
 */
function scorePlace(place, slots, enrichedData = null, userLocation = null) {
	let score = 0

	// Category match (20 points)
	if (slots.category) {
		const categoryLower = slots.category.toLowerCase()
		const allTags = [
			...(place.tags || []),
			...(place.placeTags || []),
			place.type,
			enrichedData?.categories?.primaryDisplayName,
		].filter(Boolean).map(t => String(t).toLowerCase())
		
		if (allTags.some(tag => tag.includes(categoryLower))) {
			score += 20
		}
	}

	// Cuisine match (15 points)
	if (slots.cuisine) {
		const cuisineLower = slots.cuisine.toLowerCase()
		const allTags = [
			...(place.tags || []),
			...(place.placeTags || []),
			place.name,
			place.notes,
			enrichedData?.categories?.primaryDisplayName,
		].filter(Boolean).map(t => String(t).toLowerCase())
		
		if (allTags.some(tag => tag.includes(cuisineLower))) {
			score += 15
		}
	}

	// Price match (10 points)
	if (slots.price && slots.price !== 'any' && enrichedData?.priceLevel !== null) {
		const targetLevels = slots.price === 'cheap' ? [0, 1] : [2, 3]
		if (targetLevels.includes(enrichedData.priceLevel)) {
			score += 10
		}
	}

	// Open now (15 points)
	if (slots.openNow === true && enrichedData?.openingHours?.openNow === true) {
		score += 15
	} else if (slots.openNow === false && enrichedData?.openingHours?.openNow === false) {
		score += 5 // Partial match
	}

	// Rating boost (10 points max)
	if (enrichedData?.rating) {
		score += Math.min(enrichedData.rating * 2, 10)
	}

	// Distance (if user location provided, 10 points max)
	if (userLocation && place.lat && place.lng) {
		const distance = calculateDistance(
			userLocation.lat,
			userLocation.lng,
			place.lat,
			place.lng
		)
		
		if (slots.distanceKm && distance <= slots.distanceKm) {
			score += 10
		} else if (distance <= 5) {
			score += 5 // Bonus for nearby places
		}
	}

	// Vibe match (10 points)
	if (slots.vibe && place.vibe) {
		const vibeLower = slots.vibe.toLowerCase()
		if (place.vibe.toLowerCase().includes(vibeLower)) {
			score += 10
		}
	}

	return score
}

/**
 * Batch generate explanations for multiple places in ONE Gemini call
 */
async function generateBatchExplanations(top5Places, slots) {
	const apiKey = getOpenRouterApiKey()
	if (!apiKey) {
		// Fallback: simple explanations
		return top5Places.map(({ enrichedData }) => 
			`Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`
		)
	}

	try {
		// Build prompt with all places
		const placesInfo = top5Places.map(({ place, enrichedData }, index) => {
			return `${index + 1}. ${place.name}
   Type: ${enrichedData?.categories?.primaryDisplayName || place.type || 'Unknown'}
   Rating: ${enrichedData?.rating || 'N/A'}${enrichedData?.userRatingCount ? ` (${enrichedData.userRatingCount} reviews)` : ''}
   Price: ${enrichedData?.priceLevel !== null && enrichedData?.priceLevel !== undefined ? '$'.repeat(enrichedData.priceLevel) : 'Unknown'}
   Open now: ${enrichedData?.openingHours?.openNow ? 'Yes' : 'No'}`
		}).join('\n\n')

		const prompt = `Generate a one-line explanation (max 80 characters) for why each of these places matches the user's request.

User request context: ${JSON.stringify(slots)}

Places:
${placesInfo}

Return a JSON array with exactly ${top5Places.length} strings, one explanation per place in the same order (1-${top5Places.length}).
Example format: ["Explanation for place 1", "Explanation for place 2", ...]

Only return the JSON array, no other text.`

		// Check if API key is available
		if (!apiKey) {
			throw new Error('OpenRouter API key not configured. Please set OPENROUTER_API_KEY or GEMINI_API_KEY environment variable.')
		}

		// Use OpenRouter REST API directly (more reliable than SDK for server-side)
		const httpResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://saveMapDemo.local', // Optional: for OpenRouter analytics
				'X-Title': 'Map Whisperer Chat', // Optional: for OpenRouter analytics
			},
			body: JSON.stringify({
				model: "google/gemini-2.5-flash",
				messages: [
					{
						role: "user",
						content: prompt
					}
				]
			})
		})

		if (!httpResponse.ok) {
			const errorText = await httpResponse.text().catch(() => 'Unknown error')
			throw new Error(`OpenRouter API error: ${httpResponse.status} ${httpResponse.statusText} - ${errorText}`)
		}

		const responseData = await httpResponse.json()

		// OpenRouter response format: data.choices[0].message.content (string)
		const text = responseData.choices?.[0]?.message?.content || '[]'
		
		// Extract JSON array from response
		const jsonMatch = text.match(/\[[\s\S]*\]/)
		const jsonText = jsonMatch ? jsonMatch[0] : text
		
		const explanations = JSON.parse(jsonText)
		
		// Ensure we have the right number of explanations
		if (Array.isArray(explanations) && explanations.length === top5Places.length) {
			return explanations
		}
		
		// Fallback if response format is wrong
		console.warn('Unexpected batch explanations format, using fallback')
		return top5Places.map(({ enrichedData }) => 
			`Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`
		)
	} catch (error) {
		console.error('Error generating batch explanations via OpenRouter:', error)
		// Fallback: simple explanations
		return top5Places.map(({ enrichedData }) => 
			`Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`
		)
	}
}

/**
 * Generate "why" explanation using Gemini (DEPRECATED - use generateBatchExplanations instead)
 * @deprecated Use generateBatchExplanations for batched generation
 */
async function _generateWhyExplanation(place, enrichedData, slots) {
	const apiKey = getOpenRouterApiKey()
	if (!apiKey) {
		// Fallback: simple explanation
		return `Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`
	}

	try {
		const prompt = `Generate a one-line explanation (max 80 characters) for why this place matches the user's request.

Place: ${place.name}
Type: ${enrichedData?.categories?.primaryDisplayName || place.type || 'Unknown'}
Rating: ${enrichedData?.rating || 'N/A'}${enrichedData?.userRatingCount ? ` (${enrichedData.userRatingCount} reviews)` : ''}
Price: ${enrichedData?.priceLevel !== null && enrichedData?.priceLevel !== undefined ? '$'.repeat(enrichedData.priceLevel) : 'Unknown'}
Open now: ${enrichedData?.openingHours?.openNow ? 'Yes' : 'No'}
User request: ${JSON.stringify(slots)}

Return only the explanation text, nothing else. Keep it concise and friendly.`

		// Use gemini-2.5-flash model
		const modelsToTry = ['gemini-2.5-flash']
		let lastError = null
		
		for (const modelName of modelsToTry) {
			try {
				const response = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							contents: [
								{
									parts: [{ text: prompt }],
								},
							],
						}),
					}
				)

				if (!response.ok) {
					const errorText = await response.text().catch(() => 'Unknown error')
					lastError = new Error(`Gemini API error (${modelName}): ${response.status} ${response.statusText}`)
					console.error(`Gemini API error (${modelName}):`, response.status, response.statusText, errorText)
					// Try next model if 404
					if (response.status === 404 && modelsToTry.indexOf(modelName) < modelsToTry.length - 1) {
						continue
					}
					throw lastError
				}

				const data = await response.json()
				const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
				return text.trim() || `Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`
			} catch (modelError) {
				// If this is the last model, use fallback
				if (modelsToTry.indexOf(modelName) === modelsToTry.length - 1) {
					break
				}
				// Otherwise continue to next model
				lastError = modelError
			}
		}
		
		// Fallback if all models failed
		return `Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`
	} catch (error) {
		console.error('Error generating explanation:', error)
		return `Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`
	}
}

/**
 * Main chat endpoint handler
 */
export async function handleChatSaved(req, res) {
	try {
		const { message, context = {} } = req.body

		if (!message || typeof message !== 'string') {
			return res.status(400).json({
				ok: false,
				error: 'Message is required',
			})
		}

		const {
			sessionId = `session_${Date.now()}`,
			listName = null,
			userLocation = null,
			slots: initialSlots = {},
		} = context

		// Get or create session
		let session = sessions.get(sessionId) || { slots: initialSlots }
		
		// Check if message is a greeting (simple detection)
		const messageLower = message.toLowerCase().trim()
		const greetingPatterns = [
			/^(hi|hello|hey|greetings|howdy|hi there|hello there|hey there)(\s|$|[!.,?])/i,
			/^(\s|^)(hi|hello|hey)(\s|$|[!.,?])/i,
		]
		const isGreeting = greetingPatterns.some(pattern => pattern.test(messageLower)) && 
			messageLower.split(/\s+/).length <= 5 // Only treat as greeting if short message

		// If it's a greeting and no slots are filled yet, respond with greeting and question
		if (isGreeting && Object.keys(session.slots).length === 0) {
			return res.json({
				ok: true,
				mode: 'recommendations',
				assistantMessage: "Hi there! I can help you find places from your saved list. To get started, what kind of place are you looking for?",
				updatedSlots: session.slots,
				results: [],
				optionalQuestion: null,
			})
		}
		
		// Combined: Interpret message AND prepare for batch processing in ONE Gemini call
		// We'll still need to call once for interpretation, but we'll optimize the explanations
		const interpretation = await interpretMessageWithGemini(message, session.slots)
		
		// Handle informational questions (e.g., "what time does it open", "what's the rating")
		if (interpretation.intentType === "informational") {
			// Find the place by name (fuzzy match)
			const allPlaces = getAllPlaces()
			let targetPlace = null
			
			if (interpretation.targetPlaceName) {
				const searchName = interpretation.targetPlaceName.toLowerCase()
				// Try exact match first, then fuzzy match
				targetPlace = allPlaces.find(p => 
					p.name && p.name.toLowerCase() === searchName
				) || allPlaces.find(p => 
					p.name && p.name.toLowerCase().includes(searchName) || 
					searchName.includes(p.name.toLowerCase())
				)
			}
			
			// If place found, fetch details and answer the question
			if (targetPlace && targetPlace.placeId) {
				try {
					const enrichedData = await fetchPlaceDetails(targetPlace.placeId)
					let answer = ""
					
					if (interpretation.questionType === "openingHours" || interpretation.questionType === "openNow") {
						if (enrichedData?.openingHours?.openNow !== null) {
							const isOpen = enrichedData.openingHours.openNow
							if (interpretation.questionType === "openNow") {
								answer = `${targetPlace.name} is currently ${isOpen ? "**open**" : "**closed**"}.`
							} else {
								answer = `${targetPlace.name} is currently ${isOpen ? "**open**" : "**closed**"}.`
							}
							
							if (enrichedData.openingHours.weekdayText && enrichedData.openingHours.weekdayText.length > 0) {
								answer += `\n\nOpening hours:\n${enrichedData.openingHours.weekdayText.slice(0, 7).join('\n')}`
							}
						} else {
							answer = `I don't have opening hours information for ${targetPlace.name}.`
						}
					} else if (interpretation.questionType === "rating") {
						if (enrichedData?.rating) {
							const reviewCount = enrichedData.userRatingCount || 0
							answer = `${targetPlace.name} has a rating of **${enrichedData.rating}⭐**${reviewCount > 0 ? ` (${reviewCount.toLocaleString()} reviews)` : ''}.`
						} else {
							answer = `I don't have rating information for ${targetPlace.name}.`
						}
					} else if (interpretation.questionType === "address") {
						answer = `${targetPlace.name} is located at **${enrichedData?.address || targetPlace.address || 'address not available'}**.`
					} else if (interpretation.questionType === "phone") {
						if (enrichedData?.contact?.phone) {
							answer = `You can reach ${targetPlace.name} at **${enrichedData.contact.phone}**.`
						} else {
							answer = `I don't have phone number information for ${targetPlace.name}.`
						}
					} else if (interpretation.questionType === "website") {
						if (enrichedData?.contact?.website) {
							answer = `You can visit ${targetPlace.name}'s website at **${enrichedData.contact.website}**.`
						} else {
							answer = `I don't have website information for ${targetPlace.name}.`
						}
					} else {
						// General question - provide basic info
						answer = `Here's what I know about ${targetPlace.name}:\n\n`
						if (enrichedData?.address) answer += `📍 Address: ${enrichedData.address}\n`
						if (enrichedData?.rating) {
							const reviewCount = enrichedData.userRatingCount || 0
							answer += `⭐ Rating: ${enrichedData.rating}${reviewCount > 0 ? ` (${reviewCount.toLocaleString()} reviews)` : ''}\n`
						}
						if (enrichedData?.openingHours?.openNow !== null) {
							answer += `🕐 Status: ${enrichedData.openingHours.openNow ? 'Open now' : 'Closed'}\n`
						}
						if (enrichedData?.contact?.phone) answer += `📞 Phone: ${enrichedData.contact.phone}\n`
						if (enrichedData?.contact?.website) answer += `🌐 Website: ${enrichedData.contact.website}\n`
					}
					
					return res.json({
						ok: true,
						mode: 'recommendations',
						assistantMessage: answer,
						updatedSlots: session.slots,
						results: [],
						optionalQuestion: null,
					})
				} catch (error) {
					console.error('Error fetching place details for informational question:', error)
					return res.json({
						ok: true,
						mode: 'recommendations',
						assistantMessage: `I couldn't find detailed information for ${targetPlace.name}. Would you like to see it in a recommendation list?`,
						updatedSlots: session.slots,
						results: [],
						optionalQuestion: null,
					})
				}
			} else {
				// Place not found - ask which place they meant
				return res.json({
					ok: true,
					mode: 'recommendations',
					assistantMessage: interpretation.assistantMessage || "I couldn't find that place in your saved list. Which place are you asking about?",
					updatedSlots: session.slots,
					results: [],
					optionalQuestion: null,
				})
			}
		}
		
		// Update session slots (for recommendation mode)
		session.slots = interpretation.slots || session.slots
		sessions.set(sessionId, session)

		// ALWAYS show results first - soft scoring, no hard filtering
		// Get all places
		const allPlaces = getAllPlaces()
		
		// Score candidates using soft scoring (no hard filtering)
		const scoredCandidates = filterCandidates(allPlaces, session.slots, listName, userLocation)

		if (scoredCandidates.length === 0) {
			return res.json({
				ok: true,
				mode: 'recommendations',
				assistantMessage: "I couldn't find any places matching your criteria. Try adjusting your search!",
				updatedSlots: session.slots,
				results: [],
			})
		}

		// Enrich top candidates (15-20) with Place Details for final ranking
		// Only enrich places that have placeId (for types/priceLevel/rating/openNow/reviewSummary)
		const topCandidatesForEnrichment = scoredCandidates.filter(p => p.placeId).slice(0, 20)
		const enrichedCandidates = await Promise.all(
			topCandidatesForEnrichment.map(async (place) => {
				try {
					const enrichedData = await fetchPlaceDetails(place.placeId)
					return { place, enrichedData }
				} catch (error) {
					console.error(`Error enriching place ${place.id}:`, error)
					return { place, enrichedData: null }
				}
			})
		)

		// Include places without placeId (won't be enriched but still rankable by basic info)
		const placesWithoutEnrichment = scoredCandidates
			.filter(p => !p.placeId)
			.slice(0, 10)
			.map(place => ({ place, enrichedData: null }))

		// Combine enriched and non-enriched candidates for final ranking
		const allCandidatesForRanking = [...enrichedCandidates, ...placesWithoutEnrichment]

		// Score and rank all candidates (enriched data improves scores with types/priceLevel/rating/openNow)
		const scored = allCandidatesForRanking.map(({ place, enrichedData }) => ({
			place,
			enrichedData,
			score: scorePlace(place, session.slots, enrichedData, userLocation),
		}))

		// Sort by score (descending)
		scored.sort((a, b) => b.score - a.score)

		// Get top 5 after final ranking
		const top5 = scored.slice(0, 5)

		// If no results found, check if we should ask a question to help refine
		if (top5.length === 0) {
			// If we have an optional refinement question, return it with empty results
			const optionalQuestion = interpretation.questions && interpretation.questions.length > 0 
				? interpretation.questions[0] 
				: null
			
			return res.json({
				ok: true,
				mode: 'recommendations',
				assistantMessage: interpretation.assistantMessage || "I couldn't find any places matching your criteria. Try adjusting your search!",
				updatedSlots: session.slots,
				results: [],
				optionalQuestion: optionalQuestion, // Include optional question after empty results
			})
		}

		// Batch generate all explanations in ONE Gemini call
		const explanations = await generateBatchExplanations(top5, session.slots)
		
		// Format results with batched explanations
		const results = top5.map(({ place, enrichedData, score }, index) => {
			// Format opening hours text
			let openingHoursText = null
			if (enrichedData?.openingHours?.weekdayText) {
				openingHoursText = enrichedData.openingHours.weekdayText.join(', ')
			}

			return {
				id: place.id,
				placeId: place.placeId || enrichedData?.placeId || null,
				name: enrichedData?.name || place.name,
				address: enrichedData?.address || place.address,
				rating: enrichedData?.rating || null,
				userRatingCount: enrichedData?.userRatingCount || null,
				priceLevel: enrichedData?.priceLevel ?? place.priceLevel ?? null,
				primaryType: enrichedData?.categories?.primary || null,
				primaryTypeDisplayName: enrichedData?.categories?.primaryDisplayName || null,
				types: enrichedData?.categories?.types || [],
				openNow: enrichedData?.openingHours?.openNow ?? null,
				openingHoursText,
				reviewSummary: enrichedData?.about || null, // Using editorialSummary as review summary
				why: explanations[index] || `Great ${enrichedData?.categories?.primaryDisplayName || 'place'} with ${enrichedData?.rating ? `${enrichedData.rating}⭐ rating` : 'good reviews'}.`,
				score,
				lat: place.lat || null,
				lng: place.lng || null,
			}
		})

		// Include optional refinement question if provided (after showing results)
		const optionalQuestion = interpretation.questions && interpretation.questions.length > 0 
			? interpretation.questions[0] 
			: null

		return res.json({
			ok: true,
			mode: 'recommendations',
			assistantMessage: interpretation.assistantMessage || `Here are ${results.length} recommendations based on your saved places:`,
			updatedSlots: session.slots,
			results,
			optionalQuestion: optionalQuestion, // Optional question to help refine further
		})
	} catch (error) {
		console.error('Error in chat-saved endpoint:', error)
		return res.status(500).json({
			ok: false,
			error: error.message || 'Internal server error',
		})
	}
}
