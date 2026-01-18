import React, { useState, useEffect, useRef } from "react";
import "./PlaceCard.scss";

const PlaceCard = ({ place, onClick, isSelected = false, userTimezone = null }) => {
  const [placeDetails, setPlaceDetails] = useState(null);
  const [isOpeningHoursOpen, setIsOpeningHoursOpen] = useState(false);
  const openingHoursRef = useRef(null);
  const cardRef = useRef(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  // Fetch place details if placeId exists
  useEffect(() => {
    if (place?.placeId) {
      const fetchDetails = async () => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/place-details/${place.placeId}`
          );
          const data = await response.json();
          if (data.ok && data.place) {
            setPlaceDetails(data.place);
          }
        } catch (error) {
          console.error("Error fetching place details:", error);
        }
      };
      fetchDetails();
    }
  }, [place?.placeId, API_BASE_URL]);

  // Close opening hours popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        openingHoursRef.current &&
        !openingHoursRef.current.contains(event.target)
      ) {
        setIsOpeningHoursOpen(false);
      }
    };

    if (isOpeningHoursOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpeningHoursOpen]);

  if (!place) return null;

  // Get current day opening hours
  const getCurrentDayHours = () => {
    if (!placeDetails?.openingHours?.weekdayText) return null;
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    // Google Maps weekdayDescriptions: 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
    // JavaScript getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Convert: Sunday (0) -> 6, Monday (1) -> 0, Tuesday (2) -> 1, etc.
    const googleDayIndex = today === 0 ? 6 : today - 1;
    return placeDetails.openingHours.weekdayText[googleDayIndex] || null;
  };

  // Calculate if place opens or closes soon (within 30 minutes)
  const getOpeningStatus = () => {
    if (!placeDetails?.openingHours) return null;
    
    const isOpenNow = placeDetails.openingHours.openNow;
    const periods = placeDetails.openingHours.periods;
    
    if (!periods || periods.length === 0) {
      // Fallback: if we have openNow, use it
      return {
        status: isOpenNow ? 'open' : 'closed',
        soon: false
      };
    }

    // Use timezone-aware date if userTimezone is provided
    // Get current time components in the user's timezone
    let currentDay, currentHours, currentMinutes;
    const utcDate = new Date();
    
    if (userTimezone) {
      // Get time components in the user's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        weekday: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(utcDate);
      
      // Get weekday (0 = Sunday, 1 = Monday, etc.)
      // Intl.DateTimeFormat with weekday: 'short' returns 3-letter abbreviations (Sun, Mon, Tue, etc.)
      const weekdayStr = parts.find(p => p.type === 'weekday')?.value?.toLowerCase().substring(0, 3) || '';
      const weekdayMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
      currentDay = weekdayMap[weekdayStr] ?? utcDate.getDay(); // Fallback to local time if mapping fails
      
      // Get hours and minutes
      currentHours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      currentMinutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    } else {
      // Fall back to local time
      currentDay = utcDate.getDay();
      currentHours = utcDate.getHours();
      currentMinutes = utcDate.getMinutes();
    }
    
    // Create a date object for compatibility (though we'll use the components directly)
    const now = new Date();
    // Google Places API periods use: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // JavaScript getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // So they match!
    const googleDay = currentDay;
    
    // Find periods for today
    const todayPeriods = periods.filter(p => p.open?.day === googleDay);
    
    if (todayPeriods.length === 0) {
      // Check if there are periods for tomorrow (might open soon)
      const tomorrowDay = (googleDay + 1) % 7;
      const tomorrowPeriods = periods.filter(p => p.open?.day === tomorrowDay);
      
      if (tomorrowPeriods.length > 0) {
        // Check if it opens early tomorrow (within 30 minutes of midnight)
        const minutesUntilMidnight = (24 * 60) - (currentHours * 60 + currentMinutes);
        if (minutesUntilMidnight <= 30) {
          const firstOpenTime = tomorrowPeriods[0].open?.time || '0000';
          const openMinutes = parseInt(firstOpenTime.substring(0, 2)) * 60 + parseInt(firstOpenTime.substring(2, 4));
          const totalMinutes = minutesUntilMidnight + openMinutes;
          if (totalMinutes <= 30) {
            return { status: 'closed', soon: true, action: 'opens' };
          }
        }
      }
      
      return {
        status: 'closed',
        soon: false
      };
    }

    const currentTime = currentHours * 60 + currentMinutes; // Current time in minutes (in user's timezone)
    
    // Check each period for today
    for (const period of todayPeriods) {
      const openTime = period.open?.time || '0000';
      const closeTime = period.close?.time || '2359';
      
      const openMinutes = parseInt(openTime.substring(0, 2)) * 60 + parseInt(openTime.substring(2, 4));
      const closeMinutes = parseInt(closeTime.substring(0, 2)) * 60 + parseInt(closeTime.substring(2, 4));
      
      // Handle periods that span midnight
      if (closeMinutes < openMinutes) {
        // Period spans midnight
        if (currentTime >= openMinutes || currentTime < closeMinutes) {
          // Currently open
          const minutesUntilClose = currentTime < closeMinutes 
            ? closeMinutes - currentTime 
            : (24 * 60 - currentTime) + closeMinutes;
          
          if (minutesUntilClose <= 30) {
            return { status: 'open', soon: true, action: 'closes' };
          }
          return { status: 'open', soon: false };
        } else {
          // Currently closed
          const minutesUntilOpen = openMinutes - currentTime;
          if (minutesUntilOpen > 0 && minutesUntilOpen <= 30) {
            return { status: 'closed', soon: true, action: 'opens' };
          }
          return { status: 'closed', soon: false };
        }
      } else {
        // Normal period (same day)
        if (currentTime >= openMinutes && currentTime < closeMinutes) {
          // Currently open
          const minutesUntilClose = closeMinutes - currentTime;
          if (minutesUntilClose <= 30) {
            return { status: 'open', soon: true, action: 'closes' };
          }
          return { status: 'open', soon: false };
        } else if (currentTime < openMinutes) {
          // Closed, will open today
          const minutesUntilOpen = openMinutes - currentTime;
          if (minutesUntilOpen <= 30) {
            return { status: 'closed', soon: true, action: 'opens' };
          }
          return { status: 'closed', soon: false };
        } else {
          // Closed, already closed today - check tomorrow
          const tomorrowDay = (googleDay + 1) % 7;
          const tomorrowPeriods = periods.filter(p => p.open?.day === tomorrowDay);
          if (tomorrowPeriods.length > 0) {
            const minutesUntilMidnight = (24 * 60) - currentTime;
            const firstOpenTime = tomorrowPeriods[0].open?.time || '0000';
            const openMinutesTomorrow = parseInt(firstOpenTime.substring(0, 2)) * 60 + parseInt(firstOpenTime.substring(2, 4));
            const totalMinutes = minutesUntilMidnight + openMinutesTomorrow;
            if (totalMinutes <= 30) {
              return { status: 'closed', soon: true, action: 'opens' };
            }
          }
          return { status: 'closed', soon: false };
        }
      }
    }
    
    // Fallback
    return {
      status: isOpenNow ? 'open' : 'closed',
      soon: false
    };
  };

  const currentDayHours = getCurrentDayHours();
  const openingStatus = getOpeningStatus();

  // Format price level
  const formatPriceLevel = (level) => {
    if (level === null || level === undefined) return null;
    return "$".repeat(level);
  };

  return (
    <div 
      className={`place-card ${isSelected ? 'place-card--selected' : ''}`}
      onClick={onClick}
      data-place-id={place.id}
      ref={cardRef}
    >
      <div className="place-card__content">
        <div className="place-card__main">
          <h4 className="place-card__name">{place.name || "Unnamed Place"}</h4>
          
          {/* Primary Display Name */}
          {placeDetails?.categories?.primaryDisplayName && (
            <p className="place-card__primary-type">
              {typeof placeDetails.categories.primaryDisplayName === 'string'
                ? placeDetails.categories.primaryDisplayName
                : placeDetails.categories.primaryDisplayName?.text || ''}
            </p>
          )}

          {/* Rating and User Rating Count */}
          {(placeDetails?.rating || placeDetails?.userRatingCount) && (
            <div className="place-card__rating-row">
              {placeDetails.rating && (
                <span className="place-card__rating">
                  ⭐ {placeDetails.rating.toFixed(1)}
                </span>
              )}
              {placeDetails.userRatingCount && (
                <span className="place-card__rating-count">
                  ({placeDetails.userRatingCount} reviews)
                </span>
              )}
            </div>
          )}

          {/* Price Level */}
          {placeDetails?.priceLevel !== null && placeDetails?.priceLevel !== undefined && (
            <p className="place-card__price-level">
              {formatPriceLevel(placeDetails.priceLevel)}
            </p>
          )}

          {/* Address */}
          {(placeDetails?.address || place.address) && (
            <p className="place-card__address">
              {placeDetails?.address || place.address}
            </p>
          )}

          {/* About */}
          {placeDetails?.about && (
            <p className="place-card__about">{placeDetails.about}</p>
          )}

          {/* Notes */}
          {place.notes && (
            <p className="place-card__notes">
              <span className="place-card__label">Notes:</span> {place.notes}
            </p>
          )}

          {/* Comments */}
          {place.comment && (
            <p className="place-card__comments">
              <span className="place-card__label">Comments:</span> {place.comment}
            </p>
          )}

          {/* Opening Hours */}
          {placeDetails?.openingHours && (
            <div
              className="place-card__opening-hours"
              ref={openingHoursRef}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="place-card__opening-hours-header"
                onClick={() => setIsOpeningHoursOpen(!isOpeningHoursOpen)}
              >
                <span className="place-card__opening-hours-text">
                  {currentDayHours || "Hours not available"}
                </span>
                {openingStatus ? (
                  <span
                    className={`place-card__open-now ${
                      openingStatus.status === 'open'
                        ? openingStatus.soon
                          ? "place-card__open-now--soon"
                          : "place-card__open-now--open"
                        : openingStatus.soon
                          ? "place-card__open-now--soon"
                          : "place-card__open-now--closed"
                    }`}
                  >
                    {openingStatus.soon
                      ? openingStatus.action === 'opens'
                        ? "Opens Soon"
                        : "Closes Soon"
                      : openingStatus.status === 'open'
                        ? "Open now"
                        : "Closed"}
                  </span>
                ) : placeDetails?.openingHours?.openNow === false ? (
                  <span className="place-card__open-now place-card__open-now--closed">
                    Closed
                  </span>
                ) : null}
              </div>
              {isOpeningHoursOpen && placeDetails.openingHours.weekdayText && (
                <div className="place-card__opening-hours-popup">
                  {placeDetails.openingHours.weekdayText.map((hours, index) => (
                    <div key={index} className="place-card__opening-hours-day">
                      {hours}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Contact Details at Bottom */}
        {(placeDetails?.contact?.phone || placeDetails?.contact?.website) && (
          <div className="place-card__contact">
            {placeDetails.contact.phone && (
              <a
                href={`tel:${placeDetails.contact.phone}`}
                className="place-card__contact-item"
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  className="place-card__contact-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{placeDetails.contact.phone}</span>
              </a>
            )}
            {placeDetails.contact.website && (
              <a
                href={placeDetails.contact.website}
                target="_blank"
                rel="noopener noreferrer"
                className="place-card__contact-item"
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  className="place-card__contact-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Website</span>
              </a>
            )}
          </div>
        )}

        {/* Place Tags */}
        {place.placeTags && place.placeTags.length > 0 && (
          <div className="place-card__tags">
            {place.placeTags.map((tag, index) => (
              <span key={index} className="place-card__tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaceCard;
