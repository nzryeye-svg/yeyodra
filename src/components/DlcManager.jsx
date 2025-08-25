import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { FiX, FiLoader } from 'react-icons/fi';
import './DlcManager.scss';

const DlcManager = ({ game, onClose, showNotification }) => {
  const [dlcs, setDlcs] = useState([]); // Details for the current page
  const [allDlcAppIds, setAllDlcAppIds] = useState([]); // All available DLC AppIDs
  const [installedDlcs, setInstalledDlcs] = useState(new Set());
  const [selectedDlcs, setSelectedDlcs] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const dlcsPerPage = 10;

  // Step 1: Fetch the full list of DLC AppIDs and installed DLCs once.
  useEffect(() => {
    const fetchInitialDlcData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Get all DLC AppIDs for the main game
        const gameDetails = await invoke('get_game_details', { appId: game.app_id });
        const allIds = (gameDetails.dlc || []).map(String);

        if (allIds.length === 0) {
          setError('This game has no available DLCs.');
          setIsLoading(false);
          return;
        }
        setAllDlcAppIds(allIds);

        // Get currently installed DLCs from the LUA file
        const installed = await invoke('get_dlcs_in_lua', { appId: game.app_id });
        const installedSet = new Set(installed);
        setInstalledDlcs(installedSet);
        setSelectedDlcs(new Set(installedSet)); // Copy current state
        
      } catch (err) {
        setError(`Failed to load initial DLC list: ${err.toString()}`);
        setAllDlcAppIds([]);
      } finally {
        // Loading is handled by the next effect, which fetches the first page
      }
    };

    fetchInitialDlcData();
  }, [game.app_id]);

  // Step 2: Fetch details for the current page whenever page or the full list changes.
  useEffect(() => {
    if (allDlcAppIds.length === 0) {
      // Don't start loading if there are no IDs to fetch.
      // The "no DLCs" message will be shown from the first effect.
      return;
    }

    const fetchDlcPageDetails = async () => {
      setIsLoading(true);
      setDlcs([]); // Clear previous page's content

      const startIndex = (currentPage - 1) * dlcsPerPage;
      const endIndex = startIndex + dlcsPerPage;
      const pageAppIds = allDlcAppIds.slice(startIndex, endIndex);

      if (pageAppIds.length === 0) {
        setIsLoading(false);
        return;
      }

      console.log(`Fetching DLC details for page ${currentPage}, AppIDs:`, pageAppIds);

      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
      );

      try {
        const dlcDetailsPromise = invoke('get_batch_game_details', { appIds: pageAppIds });
        const dlcDetails = await Promise.race([dlcDetailsPromise, timeoutPromise]);
        
        console.log(`Successfully loaded ${dlcDetails.length} DLC details for page ${currentPage}`);
        setDlcs(dlcDetails);
        setError(null); // Clear any previous errors
      } catch (err) {
        console.error(`Failed to load DLC details for page ${currentPage}:`, err);
        setError(`Failed to load DLC details for page ${currentPage}: ${err.toString()}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDlcPageDetails();
  }, [currentPage, allDlcAppIds]);

  const handleAddDlc = (dlcId) => {
    setSelectedDlcs(prev => {
      const newSet = new Set(prev);
      newSet.add(dlcId.toString());
      return newSet;
    });
  };

  const handleRemoveDlc = (dlcId) => {
    setSelectedDlcs(prev => {
      const newSet = new Set(prev);
      newSet.delete(dlcId.toString());
      return newSet;
    });
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    
    // Show info notification about starting the process
    if (showNotification && showNotification.showInfo) {
      showNotification.showInfo('Saving DLC configuration...', 'DLC Management');
    }
    
    try {
      const result = await invoke('sync_dlcs_in_lua', {
        mainAppId: game.app_id,
        dlcIdsToSet: Array.from(selectedDlcs),
      });
      if (showNotification && showNotification.showSuccess) {
        showNotification.showSuccess(result, 'DLC Management');
      }
      onClose();
    } catch (err) {
      if (showNotification && showNotification.showError) {
        showNotification.showError(`Error saving DLCs: ${err.toString()}`, 'DLC Management');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const totalPages = Math.ceil(allDlcAppIds.length / dlcsPerPage);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="dlc-manager-overlay">
      <div className="dlc-manager">
        {/* Header */}
        <div className="dlc-manager__header">
          <h2 className="dlc-manager__title">Manage DLCs for {game.name}</h2>
          <button onClick={onClose} className="dlc-manager__close">
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="dlc-manager__content">
          {isLoading && (
            <div className="dlc-manager__loading">
              <FiLoader className="dlc-manager__loading-spinner" />
              <p>Loading DLC Information...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="dlc-manager__error">{error}</div>
          )}

          {!isLoading && !error && allDlcAppIds.length > 0 && (
            <>
              {/* Bulk Actions */}
              <div className="dlc-manager__bulk-actions">
                <button 
                  className="dlc-manager__bulk-btn"
                  onClick={() => setSelectedDlcs(new Set(allDlcAppIds))}
                >
                  Select All
                </button>
                <button 
                  className="dlc-manager__bulk-btn"
                  onClick={() => setSelectedDlcs(new Set())}
                >
                  Select None
                </button>
              </div>

              {/* DLC Grid */}
              <div className="dlc-manager__grid">
                {dlcs.map(dlc => {
                  const dlcIdStr = dlc.steam_appid.toString();
                  const isSelected = selectedDlcs.has(dlcIdStr);

                  return (
                    <div 
                      key={dlc.steam_appid} 
                      className={`dlc-manager__card ${isSelected ? 'dlc-manager__card--selected' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          handleRemoveDlc(dlc.steam_appid);
                        } else {
                          handleAddDlc(dlc.steam_appid);
                        }
                      }}
                    >
                      {/* Selection indicator */}
                      <div className="dlc-manager__card-selector">
                        {isSelected ? '✓' : '✗'}
                      </div>

                      {/* DLC Image */}
                      <div className="dlc-manager__card-image">
                        <img 
                          src={dlc.header_image} 
                          alt={dlc.name}
                          className="dlc-manager__card-img"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                        <div className="dlc-manager__card-fallback" style={{display: 'none'}}>
                          <span>No Image</span>
                        </div>
                      </div>
                      
                      {/* DLC Info */}
                      <div className="dlc-manager__card-info">
                        <p className="dlc-manager__card-name">{dlc.name}</p>
                        <p className="dlc-manager__card-id">ID: {dlc.steam_appid}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && !error && (
            <div className="dlc-manager__pagination">
                <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || isLoading}
                    className="dlc-manager__pagination-button"
                >
                    Previous
                </button>
                <span className="dlc-manager__pagination-info">
                    Page {currentPage} of {totalPages}
                </span>
                <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || isLoading}
                    className="dlc-manager__pagination-button"
                >
                    Next
                </button>
            </div>
        )}

        {/* Footer */}
        <div className="dlc-manager__footer">
          <div className="dlc-manager__footer-info">
            <span>{selectedDlcs.size} of {allDlcAppIds.length} DLCs selected</span>
          </div>
          <div className="dlc-manager__footer-actions">
            <button 
              onClick={onClose} 
              className="dlc-manager__footer-button dlc-manager__footer-button--cancel"
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveChanges} 
              disabled={isSaving || isLoading}
              className="dlc-manager__footer-button dlc-manager__footer-button--save"
            >
              {isSaving && <FiLoader className="dlc-manager__loading-icon" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DlcManager;