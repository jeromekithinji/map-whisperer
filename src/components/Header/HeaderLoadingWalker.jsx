import React from "react";
import "./HeaderLoadingWalker.scss";

const HeaderLoadingWalker = ({ isLoading = false, progress = 0 }) => {
  // Clamp progress between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress || 0));
  
  // Calculate percentage for width
  const progressPercent = (clampedProgress * 100).toFixed(1);
  
  // Hide animation when not loading and progress is not complete
  if (!isLoading && clampedProgress < 1) {
    return null;
  }

  const isComplete = clampedProgress >= 1;

  return (
    <div className={`header-loading-walker ${isComplete ? 'header-loading-walker--complete' : ''}`}>
      <div className="header-loading-walker__track">
        <div 
          className="header-loading-walker__fill"
          style={{ width: `${progressPercent}%` }}
        />
        <div 
          className="header-loading-walker__walker"
          style={{ left: `${progressPercent}%` }}
        >
          {/* Stick figure SVG */}
          <svg
            className="header-loading-walker__svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Head */}
            <circle cx="12" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="currentColor" />
            {/* Body */}
            <line x1="12" y1="9" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            {/* Arms */}
            <line x1="12" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="header-loading-walker__arm-left" />
            <line x1="12" y1="12" x2="16" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="header-loading-walker__arm-right" />
            {/* Legs */}
            <line x1="12" y1="17" x2="9" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="header-loading-walker__leg-left" />
            <line x1="12" y1="17" x2="15" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="header-loading-walker__leg-right" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default HeaderLoadingWalker;
