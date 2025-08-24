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

            // Use larger image for better banner display
        const headerImageUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${details.steam_appid}/library_hero.jpg`;
        const fallbackImageUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${details.steam_appid}/header.jpg`;

    return (
      <>
        <div 
          className="game-detail-page__banner"
          style={{ backgroundImage: `url(${!imageError ? headerImageUrl : fallbackImageUrl})` }}
        >
          {/* Hidden img to detect if main image fails to load */}
          <img 
            src={headerImageUrl} 
            alt="" 
            style={{ display: 'none' }} 
            onError={handleImageError} 
          />
          {imageError && <div className="banner-placeholder"><FaGamepad /></div>}
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
            <div className="info-block downloads-block">
              <p>No downloads available</p>
            </div>
            <div className="info-block meta-block">
              <p>Released on {details.release_date?.date || 'N/A'}</p>
              <p>Published by {details.publishers?.join(', ') || 'N/A'}</p>
            </div>
            <div className="info-block media-block">
               {/* Screenshots section */}
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
                   // Fallback placeholder screenshots
                   <div className="screenshots-placeholder">
                      <div className="screenshot"></div>
                      <div className="screenshot"></div>
                      <div className="screenshot"></div>
                      <div className="screenshot"></div>
                   </div>
                 )}
               </div>
            </div>
            
            {/* About the game section */}
            {details.about_the_game && (
              <div className="info-block about-game-block">
                <h3>About the Game</h3>
                <div dangerouslySetInnerHTML={{ __html: details.about_the_game }}></div>
              </div>
            )}
            
            {/* Short description fallback */}
            {!details.about_the_game && details.short_description && (
              <div className="info-block description-block" dangerouslySetInnerHTML={{ __html: details.short_description }}>
              </div>
            )}
            {/* More description sections */}
          </div>
          <div className="game-detail-page__right-col">
            <div className="collapsible-section">
              <div className="section-header">
                <h3>Achievements</h3>
                <FaChevronUp />
              </div>
              <div className="section-content achievements-locked">
                <FaLock />
                <p>Sign in to see achievements</p>
              </div>
            </div>
            <div className="collapsible-section">
              <div className="section-header">
                <h3>Stats</h3>
                <FaChevronUp />
              </div>
               <div className="section-content stats-content">
                  <div className="stat-item">
                      <p>Downloads</p>
                      <p>163,628</p>
                  </div>
                   <div className="stat-item">
                      <p>Active Players</p>
                      <p>175</p>
                  </div>
              </div>
            </div>
             <div className="collapsible-section">
              <div className="section-header">
                <h3>HowLongToBeat</h3>
                <FaChevronUp />
              </div>
              <div className="section-content hltb-content">
                 <div className="hltb-item">
                      <p>Main Story</p>
                      <p>16 hours</p>
                  </div>
              </div>
            </div>
            <div className="collapsible-section">
              <div className="section-header">
                <h3>System requirements</h3>
                <FaChevronUp />
              </div>
               <div className="section-content requirements-content">
                 {/* System requirements content */}
                 <p>Minimum and Recommended tabs would go here.</p>
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
