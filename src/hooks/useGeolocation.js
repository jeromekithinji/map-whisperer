import { useState, useEffect } from "react";

const useGeolocation = () => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    // Use less strict options for better compatibility
    const options = {
      enableHighAccuracy: false, // Use less accurate but faster location (WiFi/IP-based)
      timeout: 15000, // Increase timeout to 15 seconds
      maximumAge: 300000, // Accept cached location up to 5 minutes old
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Get timezone from browser (will match user's location in most cases)
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading || null, // Direction in degrees (0-360)
          accuracy: position.coords.accuracy,
          timezone: timezone, // User's timezone
        });
        setLoading(false);
      },
      (error) => {
        // Suppress console errors for common location failures
        // These errors are handled gracefully by the UI
        if (error.code !== error.PERMISSION_DENIED) {
          // Only log non-permission errors for debugging
          console.log('Geolocation:', error.message || 'Unable to determine location');
        }
        
        let errorMessage = "Unable to retrieve your location";
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access denied. Please enable location permissions.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out.";
            break;
          default:
            errorMessage = "An unknown error occurred.";
            break;
        }
        
        setError(errorMessage);
        setLoading(false);
      },
      options
    );
  }, []);

  return { location, error, loading };
};

export default useGeolocation;
