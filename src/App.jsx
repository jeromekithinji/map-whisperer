import React, { useState } from "react";
import Header from "./components/Header/Header";
import LeftPanel from "./components/LeftPanel/LeftPanel";
import MapPanel from "./components/MapPanel/MapPanel";
import useGeolocation from "./hooks/useGeolocation";
import "./App.scss";

const App = () => {
  const { location, error, loading } = useGeolocation();
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedDistance, setSelectedDistance] = useState([]);
  const [selectedOpenStatus, setSelectedOpenStatus] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedMinRating, setSelectedMinRating] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recommendedPlaceIds, setRecommendedPlaceIds] = useState([]);
  const [isLoadingMarkers, setIsLoadingMarkers] = useState(false);
  const [markerProgress, setMarkerProgress] = useState(0);

  const handlePlaceSelect = (placeId) => {
    setSelectedPlaceId(placeId);
  };

  const handlePlaceDeselect = () => {
    setSelectedPlaceId(null);
  };

  const handleTagsChange = (tags) => {
    setSelectedTags(tags);
  };

  const handleDistanceChange = (distances) => {
    setSelectedDistance(distances);
  };

  const handleOpenStatusChange = (status) => {
    setSelectedOpenStatus(status);
  };

  const handleTypesChange = (types) => {
    setSelectedTypes(types);
  };

  const handleMinRatingChange = (rating) => {
    setSelectedMinRating(rating);
  };

  const handleClearFilters = () => {
    setSelectedTags([]);
    setSelectedDistance([]);
    setSelectedOpenStatus(null);
    setSelectedTypes([]);
    setSelectedMinRating(null);
  };

  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const handleMarkerLoadingChange = (isLoading, progress) => {
    setIsLoadingMarkers(isLoading);
    setMarkerProgress(progress);
  };

  return (
    <div className="app">
      <Header isLoadingMarkers={isLoadingMarkers} markerProgress={markerProgress} />
      <div className="app__main-content">
        <LeftPanel 
          onPlaceSelect={handlePlaceSelect}
          selectedTags={selectedTags}
          onTagsChange={handleTagsChange}
          selectedDistance={selectedDistance}
          onDistanceChange={handleDistanceChange}
          selectedOpenStatus={selectedOpenStatus}
          onOpenStatusChange={handleOpenStatusChange}
          selectedTypes={selectedTypes}
          onTypesChange={handleTypesChange}
          selectedMinRating={selectedMinRating}
          onMinRatingChange={handleMinRatingChange}
          onClearFilters={handleClearFilters}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={handleClearSearch}
          selectedPlaceId={selectedPlaceId}
          userLocation={location}
          onRecommendedPlaceIdsChange={setRecommendedPlaceIds}
          onMarkerLoadingChange={handleMarkerLoadingChange}
        />
        <MapPanel 
          userLocation={location} 
          locationError={error} 
          locationLoading={loading}
          selectedPlaceId={selectedPlaceId}
          onPlaceSelect={handlePlaceSelect}
          onPlaceDeselect={handlePlaceDeselect}
          selectedTags={selectedTags}
          selectedDistance={selectedDistance}
          searchQuery={searchQuery}
          selectedOpenStatus={selectedOpenStatus}
          selectedTypes={selectedTypes}
          selectedMinRating={selectedMinRating}
          recommendedPlaceIds={recommendedPlaceIds}
        />
      </div>
    </div>
  );
};

export default App;
