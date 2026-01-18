import React, { useState, useEffect } from "react";
import { GoogleMap, LoadScript, Marker, InfoWindow } from "@react-google-maps/api";
import "./MapPanel.scss";

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const defaultCenter = {
  lat: 45.5017,
  lng: -73.5673, // Montreal coordinates
};

// Custom user location marker icon (using SVG approach)
const createUserLocationIcon = (google) => {
  if (!google || !google.maps || !google.maps.SymbolPath) return null;
  
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: "#4285F4",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 3,
    scale: 10,
  };
};

// Direction indicator (arrow) icon with glow effect
const createDirectionIcon = (google, heading) => {
  if (!google || !google.maps || !google.maps.SymbolPath || !heading) return null;
  
  return {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    fillColor: "#34A853",
    fillOpacity: 0.9,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 6,
    rotation: heading,
  };
};


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

// Helper function to create green marker icon for recommended places
const createRecommendedIcon = (google) => {
  if (!google || !google.maps || !google.maps.SymbolPath) return null;
  
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: "#34A853", // Green color
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 10,
  };
};

const MapPanel = ({ userLocation, selectedPlaceId, onPlaceSelect, onPlaceDeselect, selectedTags = [], selectedDistance = [], searchQuery = "", selectedOpenStatus, selectedTypes, selectedMinRating, recommendedPlaceIds = [] }) => {
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [map, setMap] = useState(null);
  const [googleMaps, setGoogleMaps] = useState(null);
  const [places, setPlaces] = useState([]);
  const [placeDetailsCache, setPlaceDetailsCache] = useState({});
  const [internalSelectedPlaceId, setInternalSelectedPlaceId] = useState(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  // Use external selectedPlaceId if provided, otherwise use internal state
  const currentSelectedPlaceId = selectedPlaceId !== undefined ? selectedPlaceId : internalSelectedPlaceId;

  // Update map center when user location is available
  React.useEffect(() => {
    if (userLocation && userLocation.lat && userLocation.lng) {
      setMapCenter({
        lat: userLocation.lat,
        lng: userLocation.lng,
      });
    }
  }, [userLocation]);

  const handleCenterToLocation = () => {
    if (userLocation && userLocation.lat && userLocation.lng && map) {
      map.setCenter({
        lat: userLocation.lat,
        lng: userLocation.lng,
      });
      map.setZoom(16);
    }
  };

  const onMapLoad = (mapInstance) => {
    setMap(mapInstance);
  };

  const handleMarkerClick = (placeId) => {
    if (selectedPlaceId === undefined) {
      setInternalSelectedPlaceId(placeId);
    } else {
      // If using external state, call onPlaceSelect to update parent state
      if (onPlaceSelect) {
        onPlaceSelect(placeId);
      }
    }
  };

  const handleInfoWindowClose = () => {
    if (selectedPlaceId === undefined) {
      setInternalSelectedPlaceId(null);
    } else if (onPlaceDeselect) {
      onPlaceDeselect();
    }
  };

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

    // Filter by distance
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
  }, [places, searchQuery, selectedTags, selectedDistance, userLocation, selectedOpenStatus, selectedTypes, selectedMinRating, placeDetailsCache]);

  // Center map on selected place when it changes
  useEffect(() => {
    if (currentSelectedPlaceId && places.length > 0 && map) {
      const selectedPlace = places.find(p => p.id === currentSelectedPlaceId);
      if (selectedPlace && selectedPlace.lat && selectedPlace.lng) {
        map.setCenter({
          lat: selectedPlace.lat,
          lng: selectedPlace.lng,
        });
        map.setZoom(15);
      }
    }
  }, [currentSelectedPlaceId, places, map]);

  // Close InfoWindow when clicking on the map
  const handleMapClick = () => {
    if (selectedPlaceId === undefined) {
      setInternalSelectedPlaceId(null);
    } else if (onPlaceDeselect) {
      onPlaceDeselect();
    }
  };

  // Wait for Google Maps API to be fully loaded
  useEffect(() => {
    const checkGoogleMaps = () => {
      if (window.google && window.google.maps && window.google.maps.SymbolPath) {
        setGoogleMaps(window.google.maps);
        console.log("Google Maps API loaded successfully");
      } else {
        // Retry after a short delay if not loaded yet
        setTimeout(checkGoogleMaps, 100);
      }
    };
    
    checkGoogleMaps();
  }, []);

  // Fetch places from API
  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/places`);
        const data = await response.json();

        if (data.ok && data.places) {
          // Filter places that have coordinates
          const placesWithCoords = data.places.filter(
            (place) => place.lat && place.lng && place.lat !== null && place.lng !== null
          );
          console.log(`Loaded ${placesWithCoords.length} places with coordinates`);
          setPlaces(placesWithCoords);
        } else {
          console.log("No places found in API response:", data);
        }
      } catch (error) {
        console.error("Error fetching places:", error);
      }
    };

    // Fetch places on mount and then periodically to get updates
    fetchPlaces();
    const interval = setInterval(fetchPlaces, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [API_BASE_URL]);

  // Fetch place details for places that have placeId (needed for filtering by types, rating, price, openStatus)
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

  if (!apiKey) {
    return (
      <div className="map-panel map-panel__error">
        <div className="map-panel__error-content">
          <h3 className="map-panel__error-title">Google Maps API Key Required</h3>
          <p className="map-panel__error-text">
            Please add your Google Maps API key to the <code>.env</code> file:
          </p>
          <code className="map-panel__error-code">
            VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
          </code>
          <p className="map-panel__error-text">
            Get your API key from{" "}
            <a
              href="https://console.cloud.google.com/google/maps-apis"
              target="_blank"
              rel="noopener noreferrer"
              className="map-panel__error-link"
            >
              Google Cloud Console
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-panel">
      <LoadScript googleMapsApiKey={apiKey}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={mapCenter}
          zoom={12}
          onLoad={onMapLoad}
          onClick={handleMapClick}
          options={{
            draggable: true,
            zoomControl: true,
            scrollwheel: true,
            streetViewControl: true,
            fullscreenControl: false,
            mapTypeControl: true,
          }}
        >
          {/* Place markers - render filtered places with coordinates */}
          {filteredPlaces.length > 0 &&
           filteredPlaces.map((place) => {
             const isRecommended = recommendedPlaceIds.includes(place.id);
             const markerIcon = isRecommended && googleMaps 
               ? createRecommendedIcon(googleMaps) 
               : null;
             
             return (
               <React.Fragment key={place.id}>
                 <Marker
                   position={{ lat: place.lat, lng: place.lng }}
                   title={place.name}
                   zIndex={isRecommended ? 200 : 100}
                   icon={markerIcon}
                   onClick={() => handleMarkerClick(place.id)}
                 />
               {currentSelectedPlaceId === place.id && (
                 <InfoWindow
                   position={{ lat: place.lat, lng: place.lng }}
                   onCloseClick={handleInfoWindowClose}
                 >
                   <div className="map-infowindow">
                     <h4 className="map-infowindow__name">{place.name}</h4>
                     <div className="map-infowindow__details">
                       {place.address && (
                         <div className="map-infowindow__detail">
                           <span className="map-infowindow__label">Address:</span>
                           <span className="map-infowindow__value">{place.address}</span>
                         </div>
                       )}
                       {place.notes && (
                         <div className="map-infowindow__detail">
                           <span className="map-infowindow__label">Notes:</span>
                           <span className="map-infowindow__value">{place.notes}</span>
                         </div>
                       )}
                       {place.placeTags && place.placeTags.length > 0 && (
                         <div className="map-infowindow__detail">
                           <span className="map-infowindow__label">Tags:</span>
                           <span className="map-infowindow__tags">
                             {place.placeTags.map((tag, index) => (
                               <span key={index} className="map-infowindow__tag">
                                 {tag}
                               </span>
                             ))}
                           </span>
                         </div>
                       )}
                     </div>
                   </div>
                 </InfoWindow>
               )}
             </React.Fragment>
             );
           })}

          {/* User location marker - only render when Google Maps is loaded */}
          {userLocation && 
           userLocation.lat && 
           userLocation.lng && 
           googleMaps &&
           googleMaps.SymbolPath && (
            (() => {
              const userIcon = createUserLocationIcon(googleMaps);
              const directionIcon = userLocation.heading !== null && 
                                   userLocation.heading !== undefined 
                                   ? createDirectionIcon(googleMaps, userLocation.heading)
                                   : null;
              
              if (!userIcon) return null;
              
              return (
                <>
                  <Marker
                    position={{ lat: userLocation.lat, lng: userLocation.lng }}
                    icon={userIcon}
                    zIndex={1000}
                  />
                  {directionIcon && (
                    <Marker
                      position={{ lat: userLocation.lat, lng: userLocation.lng }}
                      icon={directionIcon}
                      zIndex={1001}
                    />
                  )}
                </>
              );
            })()
          )}
        </GoogleMap>
      </LoadScript>
      
      {/* Location button */}
      {userLocation && userLocation.lat && userLocation.lng && (
        <button
          className="map-panel__location-button"
          onClick={handleCenterToLocation}
          aria-label="Center map on my location"
        >
          <svg
            className="map-panel__location-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z"
              fill="#4285F4"
            />
            <circle cx="12" cy="9" r="2" fill="#ffffff" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default MapPanel;
