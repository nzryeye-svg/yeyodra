import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { 
  FaArrowLeft, 
  FaCloud, 
  FaPlus, 
  FaGamepad, 
  FaSpinner, 
  FaLock,
  FaDownload,
  FaChevronUp,
  FaCog,
  FaTrash
} from 'react-icons/fa';
import { FiSettings, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import './GameDetails.scss';
import DlcManager from './DlcManager';
import SystemRequirements from './SystemRequirements';
import DrmNotice from './DrmNotice';

const GameDetails = ({ game, onBack, isLibraryMode = false, showNotification = null, onDownload = null, isDownloading = false }) => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [showDlcManager, setShowDlcManager] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!game || !game.app_id) return;
      setLoading(true);
      setError(null);
      // CRITICAL: Reset ALL image states when game changes
      setImageError(false);
      setCurrentImageIndex(0);
      setImageFallbackComplete(false);
      try {
        const gameDetails = await invoke('get_game_details', { appId: game.app_id });
        setDetails(gameDetails);
      } catch (err) {
        console.error("Failed to fetch game details:", err);
        setError("Could not load game details. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [game]);
  
  const handleImageError = () => {
    console.log("Main banner image failed to load, trying fallback...");
    setImageError(true);
  };

  // Advanced image fallback state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageFallbackComplete, setImageFallbackComplete] = useState(false);

  // Generate multiple fallback URLs for better reliability
  const getImageUrls = (appId) => {
    return [
      `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
      `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      details?.header_image // Use API provided URL if available
    ].filter(Boolean);
  };



  // Advanced fallback handler
  const handleAdvancedImageError = () => {
    const imageUrls = getImageUrls(details?.steam_appid);
    const nextIndex = currentImageIndex + 1;
    
    if (nextIndex < imageUrls.length) {
      console.log(`Image ${currentImageIndex + 1} failed, trying fallback ${nextIndex + 1}...`);
      setCurrentImageIndex(nextIndex);
    } else {
      console.log("All image fallbacks failed, showing placeholder");
      setImageFallbackComplete(true);
    }
  };

  // Library actions
  const handleUpdate = async () => {
    if (!details) return;
    setIsUpdating(true);
    try {
      const result = await invoke('update_game_files', {
        appId: game.app_id,
        gameName: details.name
      });
      if (showNotification) {
        showNotification(result, 'success');
      }
    } catch (err) {
      if (showNotification) {
        showNotification(`Update failed: ${err.toString()}`, 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async () => {
    if (!details) return;
    
    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to remove ${details.name} from your library? This will delete all associated files.`
    );
    
    if (!confirmed) return;
    
    setIsRemoving(true);
    try {
      const result = await invoke('remove_game', { appId: game.app_id });
      if (showNotification) {
        showNotification(result, 'success');
      }
      // Go back to library after removal
      setTimeout(() => onBack(), 1500);
    } catch (err) {
      if (showNotification) {
        showNotification(`Remove failed: ${err.toString()}`, 'error');
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const handleManageDlcs = () => {
    setShowDlcManager(true);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="loading-container">
          <FaSpinner className="loading-spinner" />
          <p>Loading game details...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="error-container">
          <p>{error}</p>
        </div>
      );
    }

    if (!details) {
      return (
        <div className="error-container">
          <p>No game details available.</p>
        </div>
      );
    }

    // Get current image URL from fallback array
    const imageUrls = getImageUrls(details.steam_appid);
    const currentImageUrl = imageUrls[currentImageIndex] || imageUrls[0];

    return (
      <>
        <div 
          className="game-detail-page__banner"
          style={{ 
            backgroundImage: imageFallbackComplete ? 'none' : `url(${currentImageUrl})`,
            backgroundColor: imageFallbackComplete ? '#1a1a1a' : 'transparent'
          }}
        >
          {/* Hidden img to detect if current image fails to load */}
          {!imageFallbackComplete && (
            <img 
              key={`${details.steam_appid}-${currentImageIndex}`} // Force re-render on URL change
              src={currentImageUrl} 
              alt="" 
              style={{ display: 'none' }} 
              onError={handleAdvancedImageError} 
            />
          )}
          {imageFallbackComplete && <div className="banner-placeholder"><FaGamepad /></div>}
          <div className="banner-overlay">
            {/* Action buttons */}
            <div className="banner-actions">
              {isLibraryMode ? (
                // Library mode buttons
                <>
                  <button 
                    className="banner-action-btn update-btn"
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    title={isUpdating ? 'Updating...' : 'Update game files'}
                  >
                    {isUpdating ? <FaSpinner className="spinning" /> : <FiRefreshCw />}
                    <span>{isUpdating ? 'Updating...' : 'Update'}</span>
                  </button>
                  <button 
                    className="banner-action-btn dlc-btn"
                    onClick={handleManageDlcs}
                    title="Manage DLCs"
                  >
                    <FiSettings />
                    <span>DLCs</span>
                  </button>
                  <button 
                    className="banner-action-btn remove-btn"
                    onClick={handleRemove}
                    disabled={isRemoving}
                    title={isRemoving ? 'Removing...' : 'Remove from library'}
                  >
                    {isRemoving ? <FaSpinner className="spinning" /> : <FiTrash2 />}
                    <span>{isRemoving ? 'Removing...' : 'Remove'}</span>
                  </button>
                </>
              ) : (
                // Catalogue mode button
                <button 
                  className="banner-action-btn download-btn"
                  onClick={async () => {
                    if (onDownload && !isDownloading) {
                      try {
                        if (showNotification) {
                          showNotification.showInfo(`Starting download for ${game.game_name}...`);
                        }
                        await onDownload(game);
                        if (showNotification) {
                          showNotification.showSuccess(`Download completed for ${game.game_name}!`);
                        }
                      } catch (error) {
                        if (showNotification) {
                          showNotification.showError(`Download failed for ${game.game_name}: ${error.message || error}`);
                        }
                      }
                    }
                  }}
                  disabled={isDownloading}
                  title={isDownloading ? 'Downloading...' : 'Download game'}
                >
                  {isDownloading ? <FaSpinner className="spinning" /> : <FaDownload />}
                  <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="game-detail-page__main">
          <div className="game-detail-page__left-col">
            {/* Meta Information */}
            <div className="meta-info-section">
              <div className="release-info">
                <span className="release-date">Released on {details.release_date?.date || 'N/A'}</span>
                <span className="publisher">Published by {details.publishers?.join(', ') || 'N/A'}</span>
              </div>
              <DrmNotice drmNotice={details.drm_notice} />
            </div>

            {/* Screenshots */}
            <div className="screenshots-section">
              <div className="screenshots-grid">
                {details.screenshots && details.screenshots.length > 0 ? (
                  details.screenshots.slice(0, 4).map((screenshot, index) => (
                    <div key={screenshot.id} className="screenshot-item">
                      <img 
                        src={screenshot.path_thumbnail} 
                        alt={`Screenshot ${index + 1}`}
                        onClick={() => window.open(screenshot.path_full, '_blank')}
                        className="screenshot-image"
                      />
                    </div>
                  ))
                ) : (
                  <div className="screenshots-placeholder">
                     <div className="screenshot"></div>
                     <div className="screenshot"></div>
                     <div className="screenshot"></div>
                     <div className="screenshot"></div>
                  </div>
                )}
              </div>
            </div>

            {/* About the Game */}
            <div className="about-section">
              <h2 className="section-title">About the Game</h2>
              {details.about_the_game ? (
                <div className="game-description" dangerouslySetInnerHTML={{ __html: details.about_the_game }}></div>
              ) : details.short_description ? (
                <div className="game-description" dangerouslySetInnerHTML={{ __html: details.short_description }}></div>
              ) : (
                <p className="no-description">No description available.</p>
              )}
            </div>

          </div>

          <div className="game-detail-page__right-col">
            {/* Achievements Card */}
            <div className="stat-card">
              <h3>Achievements</h3>
              <div className="stat-content achievements-locked">
                <FaLock />
                <span>Sign in to see achievements</span>
              </div>
            </div>

            {/* System Requirements Card */}
            <div className="stat-card requirements-card">
              <h3>System Requirements</h3>
              <div className="stat-content requirements-content">
                <SystemRequirements requirements={details.pc_requirements} compact={true} />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="game-detail-page">
      <div className="game-detail-page__content">
        {renderContent()}
      </div>
      
      {/* DLC Manager Modal */}
      {showDlcManager && details && (
        <DlcManager
          game={{
            app_id: game.app_id, // Use original library game app_id
            name: details.name,   // Use details name for display
            ...details           // Include all other details
          }}
          onClose={() => setShowDlcManager(false)}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default GameDetails;

