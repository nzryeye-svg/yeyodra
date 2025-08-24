import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { 
  FaWifi, 
  FaFolder, 
  FaDownload, 
  FaCog, 
  FaGamepad, 
  FaExclamationTriangle,
  FaCheck,
  FaSync,
  FaSave,
  FaSearch,
  FaPlay,
  FaStethoscope,
  FaMicroscope,
  FaWrench
} from 'react-icons/fa';
import { SaveManager } from './SaveManager';
import './OfflineSetup.scss';

export function OfflineSetup({ showNotification }) {
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDirectory, setGameDirectory] = useState('');
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  const [setupResult, setSetupResult] = useState(null);
  const [activeSection, setActiveSection] = useState('game-select');
  const [searchQuery, setSearchQuery] = useState('');
  const [gameSearchResults, setGameSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [goldbergStatus, setGoldbergStatus] = useState(null);
  const [isCheckingGoldberg, setIsCheckingGoldberg] = useState(false);
  const [detectedGames, setDetectedGames] = useState(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [showAutoDetectResults, setShowAutoDetectResults] = useState(false);

  const handleSearchGames = async (query) => {
    if (!query?.trim()) {
      setGameSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await invoke('search_games', { 
        query: query.trim(), 
        page: 1, 
        perPage: 8 
      });
      setGameSearchResults(results.games || []);
    } catch (error) {
      // If offline, show message and clear results
      showNotification?.showWarning(`Search requires internet connection. Use Auto-Detect for offline games.`);
      setGameSearchResults([]);
      console.log('Search error (likely offline):', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectDirectory = async () => {
    try {
      const selectedDir = await invoke('select_directory');
      if (selectedDir) {
        setGameDirectory(selectedDir);
      }
    } catch (error) {
      showNotification?.showError(`Failed to select directory: ${error}`);
    }
  };

  const checkGoldbergDownload = async () => {
    setIsCheckingGoldberg(true);
    try {
      const result = await invoke('detect_goldberg_download');
      setGoldbergStatus(result);
      
      if (result.installed) {
        showNotification?.showSuccess(`Goldberg Emulator detected at: ${result.location}`);
      } else {
        showNotification?.showWarning('Goldberg Emulator not found in common locations');
      }
    } catch (error) {
      showNotification?.showError(`Failed to detect Goldberg: ${error}`);
      setGoldbergStatus({ installed: false });
    } finally {
      setIsCheckingGoldberg(false);
    }
  };

  const handleSetupOfflineMode = async () => {
    if (!selectedGame || !gameDirectory) {
      showNotification?.showWarning('Please select a game and directory first');
      return;
    }

    setIsSetupInProgress(true);
    setSetupResult(null);

    try {
      let result;
      
      // Use actual Goldberg if available, otherwise basic setup
      if (goldbergStatus?.installed && goldbergStatus.location) {
        result = await invoke('copy_goldberg_to_game', {
          goldbergPath: goldbergStatus.location,
          gamePath: gameDirectory,
          appId: selectedGame.app_id
        });
      } else {
        result = await invoke('setup_offline_game', {
          appId: selectedGame.app_id,
          gameName: selectedGame.game_name,
          gamePath: gameDirectory
        });
      }

      setSetupResult(result);
      if (result.success) {
        showNotification?.showSuccess(`Offline setup completed for ${selectedGame.game_name}`);
        setActiveSection('save-manager');
      } else {
        showNotification?.showError('Offline setup failed');
      }
    } catch (error) {
      showNotification?.showError(`Setup failed: ${error}`);
      setSetupResult({
        success: false,
        message: error.toString()
      });
    } finally {
      setIsSetupInProgress(false);
    }
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setActiveSection('directory-select');
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim()) {
      handleSearchGames(query);
    } else {
      setGameSearchResults([]);
    }
  };

  const handleAutoDetectGames = async () => {
    setIsAutoDetecting(true);
    try {
      const result = await invoke('auto_detect_games');
      setDetectedGames(result);
      setShowAutoDetectResults(true);
      
      showNotification?.showSuccess(
        `Found ${result.total_found} games (${result.steam_games.length} Steam, ${result.other_games.length} others)`
      );
    } catch (error) {
      showNotification?.showError(`Auto-detection failed: ${error}`);
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const handleAutoSetupGame = async (detectedGame) => {
    try {
      showNotification?.showInfo(`Setting up ${detectedGame.name}...`);
      
      const result = await invoke('auto_setup_detected_game', { detectedGame });
      
      if (result.success) {
        showNotification?.showSuccess(`Successfully setup ${detectedGame.name} for offline play`);
        
        // Auto-switch to save manager for this game
        setSelectedGame({
          game_name: detectedGame.name,
          app_id: detectedGame.app_id || "480"
        });
        setGameDirectory(detectedGame.path);
        setActiveSection('save-manager');
      } else {
        showNotification?.showError(`Failed to setup ${detectedGame.name}`);
      }
    } catch (error) {
      showNotification?.showError(`Setup failed for ${detectedGame.name}: ${error}`);
    }
  };

  const handleLaunchGame = async (detectedGame) => {
    try {
      showNotification?.showInfo(`Launching ${detectedGame.name}...`);
      
      const result = await invoke('launch_game_directly', {
        gamePath: detectedGame.path,
        executable: detectedGame.executable
      });
      
      showNotification?.showSuccess(result);
    } catch (error) {
      showNotification?.showError(`Failed to launch ${detectedGame.name}: ${error}`);
    }
  };

  const handleDiagnoseGame = async (detectedGame) => {
    try {
      showNotification?.showInfo(`Diagnosing ${detectedGame.name}...`);
      
      const result = await invoke('check_game_launch_requirements', {
        gamePath: detectedGame.path,
        executable: detectedGame.executable
      });
      
      // Show detailed diagnosis in a longer notification
      showNotification?.showInfo(result);
    } catch (error) {
      showNotification?.showError(`Failed to diagnose ${detectedGame.name}: ${error}`);
    }
  };

  const handleDeepDiagnoseGame = async (detectedGame) => {
    try {
      showNotification?.showInfo(`Deep scanning ${detectedGame.name} dependencies...`);
      
      const result = await invoke('check_game_dependencies', {
        gamePath: detectedGame.path,
        executable: detectedGame.executable
      });
      
      // Show detailed dependency analysis
      showNotification?.showInfo(result);
    } catch (error) {
      showNotification?.showError(`Deep diagnosis failed for ${detectedGame.name}: ${error}`);
    }
  };

  const handleFixDependencies = async () => {
    try {
      showNotification?.showInfo(`Getting Visual C++ Redistributable installation info...`);
      
      const result = await invoke('install_vcredist_2013');
      
      // Show installation instructions
      showNotification?.showInfo(result);
    } catch (error) {
      showNotification?.showError(`Failed to get dependency fix info: ${error}`);
    }
  };

  // Auto-detect Goldberg on component mount
  useEffect(() => {
    checkGoldbergDownload();
  }, []);

  return (
    <div className="offline-setup">
      <div className="offline-setup__header">
        <h2 className="offline-setup__title">
          <FaWifi className="offline-setup__title-icon" />
          Offline Game Setup
        </h2>
        <p className="offline-setup__description">
          Setup games to run without Steam client using Goldberg Emulator principles
        </p>
        
        {/* Goldberg Status */}
        <div className="offline-setup__goldberg-status">
          <div className={`offline-setup__status-indicator ${goldbergStatus?.installed ? 'success' : 'warning'}`}>
            {isCheckingGoldberg ? (
              <>
                <div className="offline-setup__spinner"></div>
                <span>Detecting Goldberg Emulator...</span>
              </>
            ) : goldbergStatus?.installed ? (
              <>
                <FaCheck />
                <span>Goldberg Emulator Ready</span>
                <small>{goldbergStatus.location}</small>
              </>
            ) : (
              <>
                <FaExclamationTriangle />
                <span>Goldberg Emulator Not Found</span>
                <small>Basic offline setup will be used</small>
              </>
            )}
          </div>
          <div className="offline-setup__status-actions">
            <button
              type="button"
              className="offline-setup__recheck-button"
              onClick={checkGoldbergDownload}
              disabled={isCheckingGoldberg}
            >
              <FaSync />
              Recheck
            </button>
            <button
              type="button"
              className="offline-setup__fix-button"
              onClick={handleFixDependencies}
              title="Install missing Visual C++ Redistributables"
            >
              <FaWrench />
              Fix Dependencies
            </button>
          </div>
        </div>
      </div>

      <div className="offline-setup__navigation">
        <button 
          className={`offline-setup__nav-button ${activeSection === 'game-select' ? 'active' : ''}`}
          onClick={() => setActiveSection('game-select')}
        >
          <FaGamepad /> Select Game
        </button>
        <button 
          className={`offline-setup__nav-button ${activeSection === 'directory-select' ? 'active' : ''}`}
          onClick={() => setActiveSection('directory-select')}
          disabled={!selectedGame}
        >
          <FaFolder /> Game Directory
        </button>
        <button 
          className={`offline-setup__nav-button ${activeSection === 'setup' ? 'active' : ''}`}
          onClick={() => setActiveSection('setup')}
          disabled={!selectedGame || !gameDirectory}
        >
          <FaCog /> Setup
        </button>
        <button 
          className={`offline-setup__nav-button ${activeSection === 'save-manager' ? 'active' : ''}`}
          onClick={() => setActiveSection('save-manager')}
          disabled={!selectedGame}
        >
            <FaSave /> Save Manager
        </button>
      </div>

      <div className="offline-setup__content">
        {/* Game Selection Section */}
        {activeSection === 'game-select' && (
          <div className="offline-setup__section">
            <h3><FaGamepad /> Select Game for Offline Setup</h3>
            
            <div className="offline-setup__auto-detect">
              <button
                type="button"
                className="offline-setup__auto-detect-button"
                onClick={handleAutoDetectGames}
                disabled={isAutoDetecting}
              >
                {isAutoDetecting ? (
                  <>
                    <div className="offline-setup__spinner"></div>
                    Scanning for games...
                  </>
                ) : (
                  <>
                    <FaSearch />
                    Auto-Detect Installed Games
                  </>
                )}
              </button>
              
              {detectedGames && (
                <div className="offline-setup__detect-summary">
                  Found {detectedGames.total_found} games • 
                  {detectedGames.steam_games.length} Steam • 
                  {detectedGames.other_games.length} Others
                </div>
              )}
            </div>
            
            <div className="offline-setup__search">
              <div className="offline-setup__search-input-container">
                <FaSearch className="offline-setup__search-icon" />
                <input
                  type="text"
                  className="offline-setup__search-input"
                  placeholder="Or search for a specific game..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
              </div>
            </div>

            {selectedGame && (
              <div className="offline-setup__selected-game">
                <h4>Selected Game:</h4>
                <div className="offline-setup__game-card selected">
                  <img 
                    src={selectedGame.icon_url} 
                    alt={selectedGame.game_name}
                    className="offline-setup__game-image"
                  />
                  <div className="offline-setup__game-info">
                    <h5>{selectedGame.game_name}</h5>
                    <p>AppID: {selectedGame.app_id}</p>
                  </div>
                </div>
              </div>
            )}

            {isSearching && (
              <div className="offline-setup__loading">
                <div className="offline-setup__spinner"></div>
                <span>Searching games...</span>
              </div>
            )}

            {showAutoDetectResults && detectedGames && (
              <div className="offline-setup__detected-games">
                <h4>Auto-Detected Games</h4>
                
                {detectedGames.steam_games.length > 0 && (
                  <div className="offline-setup__detected-section">
                    <h5>Steam Games ({detectedGames.steam_games.length})</h5>
                    <div className="offline-setup__detected-grid">
                      {detectedGames.steam_games.map((game, index) => (
                        <div key={index} className="offline-setup__detected-card">
                          <div className="offline-setup__detected-info">
                            <h6>{game.name}</h6>
                            <p className="path">{game.executable}</p>
                            <div className="offline-setup__detected-meta">
                              <span className={`api-status ${game.has_steam_api ? 'has-api' : 'no-api'}`}>
                                {game.has_steam_api ? '🔗 Steam API' : '❌ No API'}
                              </span>
                              <span className="size">{game.size_mb} MB</span>
                              {game.app_id && <span className="app-id">ID: {game.app_id}</span>}
                            </div>
                          </div>
                          <div className="offline-setup__game-actions">
                            <button
                              type="button"
                              className="offline-setup__setup-button"
                              onClick={() => handleAutoSetupGame(game)}
                            >
                              <FaCog />
                              Setup
                            </button>
                            <button
                              type="button"
                              className="offline-setup__launch-button"
                              onClick={() => handleLaunchGame(game)}
                            >
                              <FaPlay />
                              Launch
                            </button>
                            <button
                              type="button"
                              className="offline-setup__diagnose-button"
                              onClick={() => handleDiagnoseGame(game)}
                              title="Check game launch requirements"
                            >
                              <FaStethoscope />
                              Diagnose
                            </button>
                            <button
                              type="button"
                              className="offline-setup__deep-diagnose-button"
                              onClick={() => handleDeepDiagnoseGame(game)}
                              title="Deep scan dependencies and config"
                            >
                              <FaMicroscope />
                              Deep Scan
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {detectedGames.other_games.length > 0 && (
                  <div className="offline-setup__detected-section">
                    <h5>Other Games ({detectedGames.other_games.length})</h5>
                    <div className="offline-setup__detected-grid">
                      {detectedGames.other_games.map((game, index) => (
                        <div key={index} className="offline-setup__detected-card">
                          <div className="offline-setup__detected-info">
                            <h6>{game.name}</h6>
                            <p className="path">{game.executable}</p>
                            <div className="offline-setup__detected-meta">
                              <span className={`api-status ${game.has_steam_api ? 'has-api' : 'no-api'}`}>
                                {game.has_steam_api ? '🔗 Steam API' : '❌ No API'}
                              </span>
                              <span className="size">{game.size_mb} MB</span>
                            </div>
                          </div>
                          <div className="offline-setup__game-actions">
                            <button
                              type="button"
                              className="offline-setup__setup-button"
                              onClick={() => handleAutoSetupGame(game)}
                            >
                              <FaCog />
                              Setup
                            </button>
                            <button
                              type="button"
                              className="offline-setup__launch-button"
                              onClick={() => handleLaunchGame(game)}
                            >
                              <FaPlay />
                              Launch
                            </button>
                            <button
                              type="button"
                              className="offline-setup__diagnose-button"
                              onClick={() => handleDiagnoseGame(game)}
                              title="Check game launch requirements"
                            >
                              <FaStethoscope />
                              Diagnose
                            </button>
                            <button
                              type="button"
                              className="offline-setup__deep-diagnose-button"
                              onClick={() => handleDeepDiagnoseGame(game)}
                              title="Deep scan dependencies and config"
                            >
                              <FaMicroscope />
                              Deep Scan
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="offline-setup__search-results">
              {gameSearchResults.map((game) => (
                <div 
                  key={game.app_id}
                  className="offline-setup__game-card"
                  onClick={() => handleGameSelect(game)}
                >
                  <img 
                    src={game.icon_url} 
                    alt={game.game_name}
                    className="offline-setup__game-image"
                  />
                  <div className="offline-setup__game-info">
                    <h5>{game.game_name}</h5>
                    <p>AppID: {game.app_id}</p>
                    <p className="offline-setup__game-description">
                      {game.short_description?.substring(0, 100)}...
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Directory Selection Section */}
        {activeSection === 'directory-select' && (
          <div className="offline-setup__section">
            <h3><FaFolder /> Select Game Directory</h3>
            
            <div className="offline-setup__directory-selector">
              <input
                type="text"
                className="offline-setup__directory-input"
                value={gameDirectory}
                placeholder="Select game installation directory..."
                readOnly
              />
              <button
                type="button"
                className="offline-setup__directory-button"
                onClick={handleSelectDirectory}
              >
                <FaFolder />
                Browse
              </button>
            </div>
            
            <div className="offline-setup__directory-help">
              <p><strong>Select the main game directory that contains:</strong></p>
              <ul>
                <li>Game executable (.exe file)</li>
                <li>Steam API files (steam_api.dll, steam_api64.dll)</li>
                <li>Game assets and data files</li>
              </ul>
            </div>
          </div>
        )}

        {/* Setup Section */}
        {activeSection === 'setup' && (
          <div className="offline-setup__section">
            <h3><FaCog /> Offline Mode Setup</h3>
            
            {selectedGame && gameDirectory && (
              <div className="offline-setup__setup-info">
                <div className="offline-setup__setup-details">
                  <h4>Setup Configuration:</h4>
                  <p><strong>Game:</strong> {selectedGame.game_name}</p>
                  <p><strong>AppID:</strong> {selectedGame.app_id}</p>
                  <p><strong>Directory:</strong> {gameDirectory}</p>
                </div>

                <button
                  type="button"
                  className={`offline-setup__setup-button ${isSetupInProgress ? 'loading' : ''}`}
                  onClick={handleSetupOfflineMode}
                  disabled={isSetupInProgress}
                >
                  {isSetupInProgress ? (
                    <>
                      <div className="offline-setup__spinner"></div>
                      Setting up...
                    </>
                  ) : (
                    <>
                      <FaCog />
                      Setup Offline Mode
                    </>
                  )}
                </button>
              </div>
            )}

            {setupResult && (
              <div className={`offline-setup__result ${setupResult.success ? 'success' : 'error'}`}>
                <div className="offline-setup__result-header">
                  {setupResult.success ? <FaCheck /> : <FaExclamationTriangle />}
                  <h4>{setupResult.success ? 'Setup Successful!' : 'Setup Failed'}</h4>
                </div>
                
                <p>{setupResult.message}</p>
                
                {setupResult.success && setupResult.files_created && (
                  <div className="offline-setup__files-created">
                    <h5>Files Created:</h5>
                    <ul>
                      {setupResult.files_created.map((file, index) => (
                        <li key={index}>{file}</li>
                      ))}
                    </ul>
                    
                    {setupResult.steam_api_detected && (
                      <div className="offline-setup__api-info">
                        <FaCheck /> Steam API detected - Emulation configured
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="offline-setup__setup-guide">
              <h4>What this setup does:</h4>
              <ul>
                <li>Creates <code>steam_appid.txt</code> with game's AppID</li>
                <li>Generates <code>steam_interfaces.txt</code> if Steam API is detected</li>
                <li>Sets up offline user configuration</li>
                <li>Prepares game for Goldberg Emulator compatibility</li>
              </ul>
            </div>
          </div>
        )}

        {/* Save Manager Section */}
        {activeSection === 'save-manager' && selectedGame && (
          <div className="offline-setup__section">
            <SaveManager 
              appId={selectedGame.app_id}
              gameName={selectedGame.game_name}
              showNotification={showNotification}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default OfflineSetup;
