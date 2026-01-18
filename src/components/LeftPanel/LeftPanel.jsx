import React, { useState, useRef, useEffect } from "react";
import PlaceCard from "../PlaceCard/PlaceCard";
import "./LeftPanel.scss";

// Helper function to calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

const LeftPanel = ({ 
  onPlaceSelect, 
  selectedTags, 
  onTagsChange, 
  selectedDistance = [], 
  onDistanceChange,
  selectedOpenStatus,
  onOpenStatusChange,
  selectedTypes,
  onTypesChange,
  selectedMinRating,
  onMinRatingChange,
  onClearFilters,
  searchQuery,
  onSearchChange,
  onClearSearch,
  selectedPlaceId,
  userLocation,
  onRecommendedPlaceIdsChange,
  onMarkerLoadingChange,
}) => {
  const [importStatus, setImportStatus] = useState("idle"); // idle, processing, done
  const [dataLoaded, setDataLoaded] = useState(false);
  const [lists, setLists] = useState([]);
  const [places, setPlaces] = useState([]);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [isFiltersDropdownOpen, setIsFiltersDropdownOpen] = useState(false);
  const [openFilterSection, setOpenFilterSection] = useState(null); // 'tags', 'distance', 'status', 'types', 'rating', 'price', or null
  const [placeDetailsCache, setPlaceDetailsCache] = useState({});
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSessionId, setChatSessionId] = useState(null);
  const [chatSlots, setChatSlots] = useState({});
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const fileInputRef = useRef(null);
  const filtersDropdownRef = useRef(null);
  const placesListRef = useRef(null);
  const chatInputRef = useRef(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  const distanceOptions = [
    { value: null, label: "All" },
    { value: 5, label: "< 5 km" },
    { value: 10, label: "< 10 km" },
    { value: 20, label: "< 20 km" },
    { value: 50, label: "< 50 km" },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        filtersDropdownRef.current &&
        !filtersDropdownRef.current.contains(event.target)
      ) {
        setIsFiltersDropdownOpen(false);
      }
    };

    if (isFiltersDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFiltersDropdownOpen]);

  // Fetch lists and places when data is loaded
  useEffect(() => {
    if (!dataLoaded) return;

    const fetchListsAndPlaces = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/places`);
        const data = await response.json();

        if (data.ok) {
          if (data.lists && data.lists.length > 0) {
            setLists(data.lists);
          }
          if (data.places && data.places.length > 0) {
            setPlaces(data.places);
          }
        }
      } catch (error) {
        console.error("Error fetching lists and places:", error);
      }
    };

    fetchListsAndPlaces();
  }, [dataLoaded, API_BASE_URL]);

  // Calculate marker loading progress based on places with coordinates
  useEffect(() => {
    if (!places || places.length === 0) {
      if (onMarkerLoadingChange) {
        onMarkerLoadingChange(false, 0);
      }
      return;
    }

    const placesWithCoords = places.filter(p => p.lat && p.lng && p.lat !== null && p.lng !== null);
    const totalCount = places.length;
    const resolvedCount = placesWithCoords.length;
    const progress = totalCount > 0 ? resolvedCount / totalCount : 0;
    
    // Show loading if there are places without coordinates
    const hasPlacesWithoutCoords = places.some(p => !p.lat || !p.lng || p.lat === null || p.lng === null);
    const isLoading = hasPlacesWithoutCoords && progress < 1;
    
    // Notify parent component
    if (onMarkerLoadingChange) {
      onMarkerLoadingChange(isLoading, progress);
    }
  }, [places, onMarkerLoadingChange]);

  // Get unique tags from all places
  const uniqueTags = React.useMemo(() => {
    const tagsSet = new Set();
    places.forEach((place) => {
      if (place.placeTags && place.placeTags.length > 0) {
        place.placeTags.forEach((tag) => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet).sort();
  }, [places]);

  // Fetch place details for places that have placeId
  useEffect(() => {
    const fetchPlaceDetails = async () => {
      const placesToFetch = places.filter(p => p.placeId && !placeDetailsCache[p.placeId]);
      if (placesToFetch.length === 0) return;

      // Fetch in batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < placesToFetch.length; i += batchSize) {
        const batch = placesToFetch.slice(i, i + batchSize);
        const promises = batch.map(async (place) => {
          try {
            const response = await fetch(`${API_BASE_URL}/api/place-details/${place.placeId}`);
            const data = await response.json();
            if (data.ok && data.place) {
              return { placeId: place.placeId, details: data.place };
            }
          } catch (error) {
            console.error(`Error fetching details for place ${place.placeId}:`, error);
          }
          return null;
        });
        
        const results = await Promise.all(promises);
        setPlaceDetailsCache(prev => {
          const newCache = { ...prev };
          results.forEach(result => {
            if (result) {
              newCache[result.placeId] = result.details;
            }
          });
          return newCache;
        });
        
        // Small delay between batches
        if (i + batchSize < placesToFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    };

    if (places.length > 0) {
      fetchPlaceDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, API_BASE_URL]);

  // Get unique types from place details
  const uniqueTypes = React.useMemo(() => {
    const typesSet = new Set();
    Object.values(placeDetailsCache).forEach((details) => {
      if (details?.categories?.primaryDisplayName) {
        const type = typeof details.categories.primaryDisplayName === 'string'
          ? details.categories.primaryDisplayName
          : details.categories.primaryDisplayName?.text;
        if (type) {
          typesSet.add(type);
        }
      }
      // Also check types array for common types
      if (details?.categories?.types && Array.isArray(details.categories.types)) {
        details.categories.types.forEach(type => {
          const typeStr = typeof type === 'string' ? type : type?.text || type;
          // Filter for relevant types
          const relevantTypes = ['restaurant', 'park', 'supermarket', 'store', 'cafe', 'bar', 'museum', 'library', 'gym', 'pharmacy', 'hospital', 'school', 'hotel', 'gas_station', 'bank', 'atm', 'shopping_mall'];
          if (relevantTypes.some(rt => typeStr.toLowerCase().includes(rt))) {
            const displayType = typeStr.replace(/_/g, ' ').split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            typesSet.add(displayType);
          }
        });
      }
    });
    return Array.from(typesSet).sort();
  }, [placeDetailsCache]);

  // Filter places based on search query, selected tags, and distance
  const filteredPlaces = React.useMemo(() => {
    let filtered = places;

    // Filter by search query (name, tags, address)
    if (searchQuery && searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((place) => {
        // Search in name
        if (place.name && place.name.toLowerCase().includes(query)) {
          return true;
        }
        // Search in address
        if (place.address && place.address.toLowerCase().includes(query)) {
          return true;
        }
        // Search in tags
        if (place.placeTags && place.placeTags.length > 0) {
          if (place.placeTags.some((tag) => tag.toLowerCase().includes(query))) {
            return true;
          }
        }
        // Search in notes
        if (place.notes && place.notes.toLowerCase().includes(query)) {
          return true;
        }
        return false;
      });
    }

    // Filter by tags
    if (selectedTags && selectedTags.length > 0) {
      filtered = filtered.filter((place) => {
        if (!place.placeTags || place.placeTags.length === 0) {
          return false;
        }
        // Check if place has at least one of the selected tags
        return place.placeTags.some((tag) => selectedTags.includes(tag));
      });
    }

    // Filter by distance (multiple distances allowed)
    if (selectedDistance && selectedDistance.length > 0 && userLocation && userLocation.lat && userLocation.lng) {
      filtered = filtered.filter((place) => {
        if (!place.lat || !place.lng) {
          return false;
        }
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          place.lat,
          place.lng
        );
        // Check if distance falls within any of the selected ranges
        return selectedDistance.some(maxDistance => distance <= maxDistance);
      });
    }

    // Filter by open status
    if (selectedOpenStatus !== null) {
      filtered = filtered.filter((place) => {
        const details = placeDetailsCache[place.placeId];
        if (!details?.openingHours) return false;
        const isOpen = details.openingHours.openNow;
        return selectedOpenStatus === 'open' ? isOpen === true : isOpen === false;
      });
    }

    // Filter by types
    if (selectedTypes && selectedTypes.length > 0) {
      filtered = filtered.filter((place) => {
        const details = placeDetailsCache[place.placeId];
        if (!details?.categories) return false;
        
        const primaryType = typeof details.categories.primaryDisplayName === 'string'
          ? details.categories.primaryDisplayName
          : details.categories.primaryDisplayName?.text;
        
        if (primaryType && selectedTypes.includes(primaryType)) {
          return true;
        }
        
        // Check types array
        if (details.categories.types && Array.isArray(details.categories.types)) {
          return details.categories.types.some(type => {
            const typeStr = typeof type === 'string' ? type : type?.text || type;
            const displayType = typeStr.replace(/_/g, ' ').split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            return selectedTypes.includes(displayType);
          });
        }
        
        return false;
      });
    }

    // Filter by rating (exact match - round down rating, e.g., 3.3 -> 3)
    if (selectedMinRating !== null) {
      filtered = filtered.filter((place) => {
        const details = placeDetailsCache[place.placeId];
        if (!details?.rating) return false;
        // Round down the rating and check for exact match (e.g., 3.3 -> 3, matches rating 3)
        const ratingFloor = Math.floor(details.rating);
        return ratingFloor === selectedMinRating;
      });
    }


    return filtered;
  }, [places, searchQuery, selectedTags, selectedDistance, selectedOpenStatus, selectedTypes, selectedMinRating, userLocation, placeDetailsCache]);

  // Scroll to selected place when selectedPlaceId changes
  useEffect(() => {
    if (selectedPlaceId && placesListRef.current && isListExpanded) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const placeCard = placesListRef.current?.querySelector(
          `[data-place-id="${selectedPlaceId}"]`
        );
        if (placeCard) {
          placeCard.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }, 100);
    }
  }, [selectedPlaceId, isListExpanded]);

  const handleTagToggle = (tag) => {
    if (onTagsChange) {
      const newTags = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];
      onTagsChange(newTags);
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith(".csv");
    const isZIP = fileName.endsWith(".zip");

    if (!isCSV && !isZIP) {
      alert("Please upload a CSV or ZIP file");
      return;
    }

    // Start processing stage
    setImportStatus("processing");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Start API call and minimum delay timer simultaneously
      const apiCall = fetch(`${API_BASE_URL}/api/import-csv`, {
        method: "POST",
        body: formData,
      });

      const minProcessingDelay = new Promise((resolve) => setTimeout(resolve, 5000));

      // Wait for both API call and minimum delay
      const [response] = await Promise.all([apiCall, minProcessingDelay]);

      const data = await response.json();

      if (data.ok) {
        // Show done state for 5 seconds
        setImportStatus("done");
        setTimeout(() => {
          setImportStatus("idle");
          // After done state, mark data as loaded and hide import section
          setDataLoaded(true);
        }, 5000);
      } else {
        throw new Error(data.error || "Import failed");
      }
    } catch (error) {
      console.error("Import error:", error);
      alert(`Failed to import: ${error.message}`);
      setImportStatus("idle");
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const getButtonContent = () => {
    switch (importStatus) {
      case "processing":
        return (
          <>
            <span className="left-panel__import-button-text">Processing...</span>
          </>
        );
      case "done":
        return (
          <>
            <svg
              className="left-panel__import-button-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                fill="currentColor"
              />
            </svg>
            <span className="left-panel__import-button-text">Done</span>
          </>
        );
      default:
        return (
          <span className="left-panel__import-button-text">Import Saved Places</span>
        );
    }
  };

  const handleStartChat = () => {
    setIsChatOpen(true);
    // Generate new session ID if starting fresh
    if (chatMessages.length === 0) {
      setChatSessionId(`session_${Date.now()}`);
      setChatSlots({});
    }
  };

  const handleBackToList = () => {
    setIsChatOpen(false);
  };

  const handleSendMessage = async () => {
    if (chatInput.trim() === "" || isLoadingResponse) return;
    
    const userMessageText = chatInput.trim();
    
    // Add user message
    const userMessage = {
      id: Date.now(),
      type: "user",
      text: userMessageText,
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setIsLoadingResponse(true);

    try {
      // Call chat API
      const response = await fetch(`${API_BASE_URL}/api/chat-saved`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessageText,
          context: {
            sessionId: chatSessionId || `session_${Date.now()}`,
            listName: lists.length > 0 ? lists[0].listName : null,
            userLocation: userLocation && userLocation.lat && userLocation.lng ? {
              lat: userLocation.lat,
              lng: userLocation.lng,
            } : null,
            slots: chatSlots,
          },
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      // Update session ID and slots
      if (data.updatedSlots) {
        setChatSlots(data.updatedSlots);
      }

      // Handle different response modes
      if (data.mode === "follow_up") {
        // Old mode - just questions (backwards compatibility)
        const assistantMessage = {
          id: Date.now() + 1,
          type: "agent",
          text: data.assistantMessage,
        };
        setChatMessages((prev) => [...prev, assistantMessage]);

        // Add follow-up questions
        if (data.questions && data.questions.length > 0) {
          data.questions.forEach((question, index) => {
            const questionMessage = {
              id: Date.now() + 2 + index,
              type: "agent",
              text: question,
            };
            setChatMessages((prev) => [...prev, questionMessage]);
          });
        }
      } else if (data.mode === "recommendations") {
        // Always show results first - combine assistant message with results
        const resultsMessage = {
          id: Date.now() + 1,
          type: "agent",
          text: data.assistantMessage,
          results: data.results || [],
        };
        setChatMessages((prev) => [...prev, resultsMessage]);

        // Track recommended place IDs from the most recent chat recommendations
        // Notify parent component about recommended places for map highlighting
        if (data.results && data.results.length > 0 && onRecommendedPlaceIdsChange) {
          const placeIds = data.results.map(result => result.id || result.placeId).filter(Boolean);
          onRecommendedPlaceIdsChange(placeIds);
        }

        // If optional refinement question (shown after results), add it separately
        if (data.optionalQuestion) {
          const questionMessage = {
            id: Date.now() + 2,
            type: "agent",
            text: data.optionalQuestion,
          };
          setChatMessages((prev) => [...prev, questionMessage]);
        }
      }
    } catch (error) {
      console.error("Error sending chat message:", error);
      const errorMessage = {
        id: Date.now() + 1,
        type: "agent",
        text: "Sorry, I encountered an error. Please try again.",
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoadingResponse(false);
    }
  };

  const handleChatInputKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      const scrollHeight = chatInputRef.current.scrollHeight;
      const maxHeight = 150; // Max height for 6 lines
      chatInputRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [chatInput]);

  // Chat View
  if (isChatOpen) {
    return (
      <div className="left-panel">
        <div className="left-panel__chat">
          {/* Chat Header */}
          <div className="left-panel__chat-header">
            <button className="left-panel__chat-back-button" onClick={handleBackToList}>
              <svg
                className="left-panel__chat-back-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M19 12H5M5 12l6-6m-6 6l6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Back</span>
            </button>
            <h2 className="left-panel__chat-title">map whisperer</h2>
          </div>

          {/* Chat Messages */}
          <div className="left-panel__chat-messages">
            {chatMessages.length === 0 ? (
              <div className="left-panel__chat-empty">
                <p>Start a conversation to get personalized recommendations.</p>
              </div>
            ) : (
              chatMessages.map((message) => (
                <div key={message.id}>
                  <div
                    className={`left-panel__chat-message left-panel__chat-message--${message.type}`}
                  >
                    <div className="left-panel__chat-message-indicator">
                      {message.type === "user" ? "u" : "a"}
                    </div>
                    <div className="left-panel__chat-message-bubble">
                      {message.text}
                    </div>
                  </div>
                  {/* Show recommendations if available */}
                  {message.results && message.results.length > 0 && (
                    <div className="left-panel__chat-results">
                      {message.results.map((result) => (
                        <div
                          key={result.id}
                          className="left-panel__chat-result-card"
                          onClick={() => onPlaceSelect && onPlaceSelect(result.id)}
                        >
                          <h4 className="left-panel__chat-result-name">{result.name}</h4>
                          {result.primaryTypeDisplayName && (
                            <p className="left-panel__chat-result-type">{result.primaryTypeDisplayName}</p>
                          )}
                          {result.rating && (
                            <p className="left-panel__chat-result-rating">
                              ⭐ {result.rating.toFixed(1)}
                              {result.userRatingCount && ` (${result.userRatingCount} reviews)`}
                            </p>
                          )}
                          {result.address && (
                            <p className="left-panel__chat-result-address">{result.address}</p>
                          )}
                          {result.why && (
                            <p className="left-panel__chat-result-why">{result.why}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {isLoadingResponse && (
              <div className="left-panel__chat-message left-panel__chat-message--agent">
                <div className="left-panel__chat-message-indicator">a</div>
                <div className="left-panel__chat-message-bubble">
                  <span className="left-panel__chat-typing">Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="left-panel__chat-input-container">
            <textarea
              ref={chatInputRef}
              className="left-panel__chat-input-field"
              placeholder="Type your message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={handleChatInputKeyPress}
              rows={1}
            />
            <button 
              className="left-panel__chat-send-button" 
              onClick={handleSendMessage}
              disabled={isLoadingResponse}
            >
              Send (Enter)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Regular View (Lists, Places, etc.)
  return (
    <div className="left-panel">
      <div className="left-panel__content">
        {/* Welcome/Landing Page - Hide when data is loaded */}
        {!dataLoaded && (
          <>
            {/* Welcome Section */}
            <section className="left-panel__section left-panel__welcome-section">
              <h2 className="left-panel__heading">Welcome to Map Whisperer</h2>
              <p className="left-panel__text">
                Your saved places, organized and ready to recommend. Import yout Google Maps data
                to get tailored suggestions.
              </p>
              {/* Placeholder for future: Import instructions and site overview will go here */}
              {/* <div className="left-panel__welcome-instructions">
                <h3>Getting Started</h3>
                <p>Instructions will go here...</p>
              </div>
              <div className="left-panel__welcome-overview">
                <h3>About Map Whisperer</h3>
                <p>Overview will go here...</p>
              </div> */}
            </section>

            {/* Import Section */}
            <section className="left-panel__section">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.zip"
                onChange={handleFileSelect}
                className="left-panel__file-input"
                id="file-input"
              />
              <button
                className={`left-panel__import-button left-panel__import-button--${importStatus}`}
                onClick={handleImportClick}
                disabled={importStatus === "processing"}
              >
                {getButtonContent()}
              </button>
            </section>
          </>
        )}

        {/* List Section - Show when data is loaded */}
        {dataLoaded && lists.length > 0 && (
          <section className="left-panel__section left-panel__list-section">
            <h3 className="left-panel__list-title">
              List: <span className="left-panel__list-name">{lists[0].listName}</span>
            </h3>
            <button
              className="left-panel__list-toggle"
              onClick={() => setIsListExpanded(!isListExpanded)}
              aria-label={isListExpanded ? "Hide places" : "Show places"}
            >
              <span className="left-panel__list-toggle-label">Saved Places</span>
              <svg
                className={`left-panel__list-toggle-icon ${isListExpanded ? 'left-panel__list-toggle-icon--expanded' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M7 10l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isListExpanded && (
              <div className="left-panel__places-container">
                {/* Search Bar - Sticky */}
                <div className="left-panel__search-bar">
                  <div className="left-panel__search-wrapper">
                    <input
                      type="text"
                      className="left-panel__search-input"
                      placeholder="Search places, tags, addresses..."
                      value={searchQuery || ""}
                      onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
                    />
                    {searchQuery && searchQuery.trim() !== "" && (
                      <button
                        className="left-panel__search-clear"
                        onClick={onClearSearch}
                        aria-label="Clear search"
                      >
                        <svg
                          className="left-panel__search-clear-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {/* Filters Dropdown - Sticky */}
                <div className="left-panel__filter-bar-wrapper">
                  <div className="left-panel__filter-group" ref={filtersDropdownRef}>
                    <button
                      className="left-panel__filter-dropdown"
                      onClick={() => setIsFiltersDropdownOpen(!isFiltersDropdownOpen)}
                    >
                      <span className="left-panel__filter-label">Filters</span>
                      {((selectedTags && selectedTags.length > 0) || (selectedDistance && selectedDistance.length > 0) || selectedOpenStatus !== null || (selectedTypes && selectedTypes.length > 0) || selectedMinRating !== null) && (
                        <span className="left-panel__filter-count">Active</span>
                      )}
                      <svg
                        className={`left-panel__filter-dropdown-icon ${isFiltersDropdownOpen ? 'left-panel__filter-dropdown-icon--open' : ''}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M7 10l5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {isFiltersDropdownOpen && (
                      <div className="left-panel__filter-dropdown-content left-panel__filter-dropdown-content--all-filters">
                        {/* Tags Filter */}
                        <div className="left-panel__filter-section">
                          <button
                            className="left-panel__filter-section-header"
                            onClick={() => setOpenFilterSection(openFilterSection === 'tags' ? null : 'tags')}
                          >
                            <h4 className="left-panel__filter-section-title">Tags</h4>
                            <svg
                              className={`left-panel__filter-section-icon ${openFilterSection === 'tags' ? 'left-panel__filter-section-icon--open' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M7 10l5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {openFilterSection === 'tags' && (
                            <div className="left-panel__filter-section-content">
                              {uniqueTags.length > 0 ? (
                                uniqueTags.map((tag) => (
                                  <label
                                    key={tag}
                                    className="left-panel__filter-checkbox-label"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedTags && selectedTags.includes(tag)}
                                      onChange={() => handleTagToggle(tag)}
                                      className="left-panel__filter-checkbox"
                                    />
                                    <span className="left-panel__filter-checkbox-text">
                                      {tag}
                                    </span>
                                  </label>
                                ))
                              ) : (
                                <p className="left-panel__filter-empty">No tags available</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Distance Filter */}
                        <div className="left-panel__filter-section">
                          <button
                            className="left-panel__filter-section-header"
                            onClick={() => setOpenFilterSection(openFilterSection === 'distance' ? null : 'distance')}
                          >
                            <h4 className="left-panel__filter-section-title">Distance</h4>
                            <svg
                              className={`left-panel__filter-section-icon ${openFilterSection === 'distance' ? 'left-panel__filter-section-icon--open' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M7 10l5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {openFilterSection === 'distance' && (
                            <div className="left-panel__filter-section-content">
                              {distanceOptions.filter(opt => opt.value !== null).map((option) => (
                                <label
                                  key={option.value}
                                  className="left-panel__filter-checkbox-label"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedDistance && selectedDistance.includes(option.value)}
                                    onChange={() => {
                                      if (onDistanceChange) {
                                        const newDistances = selectedDistance?.includes(option.value)
                                          ? selectedDistance.filter(d => d !== option.value)
                                          : [...(selectedDistance || []), option.value];
                                        onDistanceChange(newDistances);
                                      }
                                    }}
                                    className="left-panel__filter-checkbox"
                                  />
                                  <span className="left-panel__filter-checkbox-text">
                                    {option.label}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Open/Close Status Filter */}
                        <div className="left-panel__filter-section">
                          <button
                            className="left-panel__filter-section-header"
                            onClick={() => setOpenFilterSection(openFilterSection === 'status' ? null : 'status')}
                          >
                            <h4 className="left-panel__filter-section-title">Status</h4>
                            <svg
                              className={`left-panel__filter-section-icon ${openFilterSection === 'status' ? 'left-panel__filter-section-icon--open' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M7 10l5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {openFilterSection === 'status' && (
                            <div className="left-panel__filter-section-content">
                              <label className="left-panel__filter-radio-label">
                                <input
                                  type="radio"
                                  name="openStatus"
                                  checked={selectedOpenStatus === null}
                                  onChange={() => onOpenStatusChange && onOpenStatusChange(null)}
                                  className="left-panel__filter-radio"
                                />
                                <span className="left-panel__filter-radio-text">All</span>
                              </label>
                              <label className="left-panel__filter-radio-label">
                                <input
                                  type="radio"
                                  name="openStatus"
                                  checked={selectedOpenStatus === 'open'}
                                  onChange={() => onOpenStatusChange && onOpenStatusChange('open')}
                                  className="left-panel__filter-radio"
                                />
                                <span className="left-panel__filter-radio-text">Open</span>
                              </label>
                              <label className="left-panel__filter-radio-label">
                                <input
                                  type="radio"
                                  name="openStatus"
                                  checked={selectedOpenStatus === 'closed'}
                                  onChange={() => onOpenStatusChange && onOpenStatusChange('closed')}
                                  className="left-panel__filter-radio"
                                />
                                <span className="left-panel__filter-radio-text">Closed</span>
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Types Filter */}
                        <div className="left-panel__filter-section">
                          <button
                            className="left-panel__filter-section-header"
                            onClick={() => setOpenFilterSection(openFilterSection === 'types' ? null : 'types')}
                          >
                            <h4 className="left-panel__filter-section-title">Types</h4>
                            <svg
                              className={`left-panel__filter-section-icon ${openFilterSection === 'types' ? 'left-panel__filter-section-icon--open' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M7 10l5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {openFilterSection === 'types' && (
                            <div className="left-panel__filter-section-content">
                              {uniqueTypes.length > 0 ? (
                                uniqueTypes.map((type) => (
                                  <label
                                    key={type}
                                    className="left-panel__filter-checkbox-label"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedTypes && selectedTypes.includes(type)}
                                      onChange={() => {
                                        if (onTypesChange) {
                                          const newTypes = selectedTypes?.includes(type)
                                            ? selectedTypes.filter(t => t !== type)
                                            : [...(selectedTypes || []), type];
                                          onTypesChange(newTypes);
                                        }
                                      }}
                                      className="left-panel__filter-checkbox"
                                    />
                                    <span className="left-panel__filter-checkbox-text">
                                      {type}
                                    </span>
                                  </label>
                                ))
                              ) : (
                                <p className="left-panel__filter-empty">No types available</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Rating Filter */}
                        <div className="left-panel__filter-section">
                          <button
                            className="left-panel__filter-section-header"
                            onClick={() => setOpenFilterSection(openFilterSection === 'rating' ? null : 'rating')}
                          >
                            <h4 className="left-panel__filter-section-title">Rating</h4>
                            <svg
                              className={`left-panel__filter-section-icon ${openFilterSection === 'rating' ? 'left-panel__filter-section-icon--open' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M7 10l5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {openFilterSection === 'rating' && (
                            <div className="left-panel__filter-section-content">
                              <label className="left-panel__filter-radio-label">
                                <input
                                  type="radio"
                                  name="minRating"
                                  checked={selectedMinRating === null}
                                  onChange={() => onMinRatingChange && onMinRatingChange(null)}
                                  className="left-panel__filter-radio"
                                />
                                <span className="left-panel__filter-radio-text">All</span>
                              </label>
                              {[1, 2, 3, 4, 5].map((rating) => (
                                <label key={rating} className="left-panel__filter-radio-label">
                                  <input
                                    type="radio"
                                    name="minRating"
                                    checked={selectedMinRating === rating}
                                    onChange={() => onMinRatingChange && onMinRatingChange(rating)}
                                    className="left-panel__filter-radio"
                                  />
                                  <span className="left-panel__filter-radio-text">
                                    ⭐ {rating}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Clear Filters Button */}
                        {((selectedTags && selectedTags.length > 0) || (selectedDistance && selectedDistance.length > 0) || selectedOpenStatus !== null || (selectedTypes && selectedTypes.length > 0) || selectedMinRating !== null) && (
                          <div className="left-panel__filter-clear-inline">
                            <button
                              className="left-panel__filter-clear"
                              onClick={onClearFilters}
                              aria-label="Clear all filters"
                            >
                              Clear Filters
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Reset Filters Link */}
                  {((selectedTags && selectedTags.length > 0) || (selectedDistance && selectedDistance.length > 0) || selectedOpenStatus !== null || (selectedTypes && selectedTypes.length > 0) || selectedMinRating !== null) && (
                    <div className="left-panel__filter-reset-container">
                      <button
                        className="left-panel__filter-reset"
                        onClick={onClearFilters}
                        aria-label="Reset all filters"
                      >
                        Reset Filters
                      </button>
                    </div>
                  )}
                </div>
                {/* Places List - Scrollable */}
                <div className="left-panel__places-list" ref={placesListRef}>
                  {filteredPlaces.length > 0 ? (
                    filteredPlaces.map((place) => (
                      <PlaceCard 
                        key={place.id} 
                        place={place}
                        isSelected={selectedPlaceId === place.id}
                        onClick={() => onPlaceSelect && onPlaceSelect(place.id)}
                        userTimezone={userLocation?.timezone || null}
                      />
                    ))
                  ) : (
                    <p className="left-panel__empty-places">
                      {places.length > 0 ? "No places match the selected filters" : "No places found"}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Chat Start Section - Only show after data is loaded */}
        {dataLoaded && (
          <section className="left-panel__section">
            <label className="left-panel__label">Ask for recommendations</label>
            <p className="left-panel__chat-prompt">
              Start a conversation to get personalized recommendations based on your saved places.
            </p>
            <button className="left-panel__start-chat-button" onClick={handleStartChat}>
              {chatMessages.length > 0 ? "Resume chat" : "Start a chat"}
            </button>
          </section>
        )}

        {/* How it works Section - Only show on welcome page */}
        {!dataLoaded && (
          <section className="left-panel__section left-panel__how-it-works">
            <h3 className="left-panel__how-it-works-title">How it works</h3>
            <div className="left-panel__how-it-works-steps">
              {/* Step 1: Export */}
              <div className="left-panel__how-it-works-step">
                <div className="left-panel__how-it-works-icon-container">
                  <svg className="left-panel__how-it-works-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="left-panel__how-it-works-content">
                  <h4 className="left-panel__how-it-works-step-title">Export your saved places</h4>
                  <p className="left-panel__how-it-works-step-text">
                    Download your saved places from{' '}
                    <a 
                      href="https://takeout.google.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="left-panel__how-it-works-link"
                    >
                      Google Takeout
                    </a>
                    . Select the option <strong>Maps (your places)</strong> and export and download that.
                  </p>
                </div>
              </div>

              {/* Step 2: Upload */}
              <div className="left-panel__how-it-works-step">
                <div className="left-panel__how-it-works-icon-container">
                  <svg className="left-panel__how-it-works-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="left-panel__how-it-works-content">
                  <h4 className="left-panel__how-it-works-step-title">Upload your file</h4>
                  <p className="left-panel__how-it-works-step-text">Upload your Google Maps export (CSV).</p>
                </div>
              </div>

              {/* Step 3: Organize & Enrich */}
              <div className="left-panel__how-it-works-step">
                <div className="left-panel__how-it-works-icon-container">
                  <svg className="left-panel__how-it-works-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <div className="left-panel__how-it-works-content">
                  <h4 className="left-panel__how-it-works-step-title">We organize & enrich</h4>
                  <p className="left-panel__how-it-works-step-text">We group, analyze, and add context to your places.</p>
                </div>
              </div>

              {/* Step 4: Chat */}
              <div className="left-panel__how-it-works-step">
                <div className="left-panel__how-it-works-icon-container">
                  <svg className="left-panel__how-it-works-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="left-panel__how-it-works-content">
                  <h4 className="left-panel__how-it-works-step-title">Ask for recommendations</h4>
                  <p className="left-panel__how-it-works-step-text">Tell us what you're looking for and we'll suggest the best spots.</p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;
