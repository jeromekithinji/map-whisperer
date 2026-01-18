import React from "react";
import HeaderLoadingWalker from "./HeaderLoadingWalker";
import "./Header.scss";

const Header = ({ isLoadingMarkers = false, markerProgress = 0 }) => {
  return (
    <header className="header">
      <div className="header__content">
        <img src="/logo.svg" alt="Map Whisperer Logo" className="header__logo" />
        <div className="header__title-container">
          <h1 className="header__title">Map Whisperer</h1>
          <span className="header__tagline">Talk to your map. It listens.</span>
        </div>
        <HeaderLoadingWalker 
          isLoading={isLoadingMarkers} 
          progress={markerProgress} 
        />
      </div>
    </header>
  );
};

export default Header;
