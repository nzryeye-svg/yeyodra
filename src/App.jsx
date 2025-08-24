import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { GameCard } from './components/GameCard';
import GameDetails from './components/GameDetails';
import { Featured } from './components/Featured';
import { CategoryButtons } from './components/CategoryButtons';
import { OfflineSetup } from './components/OfflineSetup';
import { Bypass } from './components/Bypass';
import { Settings } from './components/Settings';

import NotificationSystem from './components/NotificationSystem';
import useNotification from './hooks/useNotification';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingGames, setDownloadingGames] = useState(new Set());

  const [activeCategory, setActiveCategory] = useState('hot');
  const [selectedGame, setSelectedGame] = useState(null);
  const [showingDetails, setShowingDetails] = useState(false);
  const [selectedLibraryGame, setSelectedLibraryGame] = useState(null);
  const [featuredGames, setFeaturedGames] = useState([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  
  // Notification system
  const {
    notifications,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  } = useNotification();

  const handleSearch = async (query) => {
    if (!query?.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const results = await invoke('search_games', { 
        query: query.trim(), 
        page: 1, 
        perPage: 12 
      });
      setSearchResults(results.games || []);
    } catch (err) {
      setError(`Search failed: ${err}`);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch featured games for home page
  const fetchFeaturedGames = async () => {
    setIsLoadingFeatured(true);
    setError('');
    try {
      // Featured AppIDs with Demon Slayer as main featured game
      const featuredAppIds = ['2928600', '2322010', '1888930', '2651280', '1593500', '1817070', '2622380'];
      const gamesData = [];
      
      for (const appId of featuredAppIds) {
        try {
          const gameDetails = await invoke('get_game_details', { appId });
          // Convert to GameCard format
          const gameCardData = {
            app_id: appId,
            game_name: gameDetails.name,
            icon_url: gameDetails.header_image,
            short_description: gameDetails.short_description,
          };
          gamesData.push(gameCardData);
        } catch (err) {
          console.error(`Failed to fetch game ${appId}:`, err);
        }
      }
      
      setFeaturedGames(gamesData);
    } catch (err) {
      setError(`Failed to load featured games: ${err}`);
    } finally {
      setIsLoadingFeatured(false);
    }
  };

  // Load featured games on component mount
  useEffect(() => {
    fetchFeaturedGames();
  }, []);

  const handleDownload = async (game) => {
    try {
      setError('');
      setDownloadingGames(prev => new Set([...prev, game.app_id]));
      
      const result = await invoke('download_game', {
        appId: game.app_id,
        gameName: game.game_name,
        outputDir: null
      });
      
      if (result) {
        return result; // Success
      } else {
        throw new Error(`No data found for ${game.game_name}`);
      }
    } catch (err) {
      setError(`Download failed: ${err}`);
      throw err; // Re-throw for notification handling
    } finally {
      setDownloadingGames(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.app_id);
        return newSet;
      });
    }
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    // Clear results when search is cleared
    if (!value.trim()) {
      setSearchResults([]);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      handleSearch(searchQuery);
    }
  };

  const handleShowDetails = (game) => {
    setSelectedGame(game);
    setShowingDetails(true);
  };

  const handleBackFromDetails = () => {
    setShowingDetails(false);
    setSelectedGame(null);
  };

  // Handler for featured game cards
  const handleFeaturedGameClick = (game) => {
    setActiveTab('catalogue'); // Switch to catalogue tab
    handleShowDetails(game);
  };

  const handleBackFromLibraryDetails = () => {
    setSelectedLibraryGame(null);
  };

  const showLibraryNotification = (message, type = 'info') => {
    switch (type) {
      case 'success':
        showSuccess(message);
        break;
      case 'error':
        showError(message);
        break;
      case 'warning':
        showWarning(message);
        break;
      default:
        showInfo(message);
        break;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'home':
        return 'Home';
      case 'catalogue':
        // Show game name when viewing game details, otherwise show "Catalogue"
        return selectedGame ? selectedGame.game_name : 'Catalogue';

      case 'bypass':
        return 'Bypass Tools';
      case 'offline':
        return 'Offline Setup';
      case 'settings':
        return 'Settings';
      case 'peak':
        // Show game name instead of "PEAK" when a library game is selected
        return selectedLibraryGame ? selectedLibraryGame.name : 'My Library';
      default:
        return 'Yeyodra';
    }
  };

  return (
    <div className="root-container">
      <main className="main-content">
        <Sidebar 
          activeTab={activeTab} 
          selectedLibraryGame={selectedLibraryGame}
          onTabChange={(tab, gameData) => {
            setActiveTab(tab);
            if (gameData) {
              setSelectedLibraryGame(gameData);
            }
          }}
          showNotification={{ showSuccess, showError, showWarning, showInfo }}
        />
        
        <div className="app-container">
                  <Header 
          title={getTabTitle()} 
          searchValue={searchQuery}
          onSearch={handleSearchChange}
          onSearchSubmit={handleSearchSubmit}
          showBackButton={activeTab === 'catalogue' && selectedGame}
          onBack={() => setSelectedGame(null)}
        />
          
          <section className="app-container__content">
            {/* Error Display */}
            {error && (
              <div className="error-banner">
                {error}
              </div>
            )}

            {/* Home Tab */}
            {activeTab === 'home' && (
              <div className="home-container">
                <Featured 
                  featuredGame={featuredGames.length > 0 ? featuredGames[0] : null}
                  isLoading={isLoadingFeatured}
                  onGameClick={handleFeaturedGameClick}
                />
                <CategoryButtons 
                  activeCategory={activeCategory} 
                  onCategoryChange={setActiveCategory} 
                />

                <div className="game-section">
                  <h2 className="section-title">🔥 Hot now</h2>
                  <div className="game-grid">
                    {isLoadingFeatured && (
                      <div className="loading-container">
                        <span className="loading-spinner"></span>
                        <p>Loading featured games...</p>
                      </div>
                    )}
                    
                    {!isLoadingFeatured && featuredGames.length > 0 && (
                      featuredGames.slice(1).map((game) => (
                        <GameCard
                          key={game.app_id}
                          game={game}
                          onShowDetails={handleFeaturedGameClick}
                        />
                      ))
                    )}

                    {!isLoadingFeatured && featuredGames.length === 0 && (
                      <div className="placeholder-container">
                        <p>No featured games available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Catalogue Tab */}
            {activeTab === 'catalogue' && (
              <div className="catalogue-container">
                {showingDetails && selectedGame ? (
                  <GameDetails 
                    game={selectedGame}
                    onBack={handleBackFromDetails}
                    onDownload={handleDownload}
                    isDownloading={downloadingGames.has(selectedGame.app_id)}
                    showNotification={{ showSuccess, showError, showWarning, showInfo }}
                  />
                ) : (
                  <>
                    {isLoading && (
                      <div className="loading-container">
                        <span className="loading-spinner"></span>
                      </div>
                    )}
                    
                    {!isLoading && searchResults.length > 0 && (
                      <div className="game-grid">
                        {searchResults.map((game) => (
                          <GameCard
                            key={game.app_id}
                            game={game}
                            onDownload={handleDownload}
                            onShowDetails={handleShowDetails}
                            isDownloading={downloadingGames.has(game.app_id)}
                          />
                        ))}
                      </div>
                    )}

                    {!isLoading && !searchQuery && searchResults.length === 0 && (
                      <div className="placeholder-container">
                        <div className="placeholder-icon">🔍</div>
                        <h3>Search for Steam Games</h3>
                        <p>Enter a game name or AppID in the search box above</p>
                      </div>
                    )}

                    {!isLoading && searchQuery && searchResults.length === 0 && (
                      <div className="placeholder-container">
                        <div className="placeholder-icon">😕</div>
                        <h3>No games found</h3>
                        <p>Try searching with different keywords</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}



            {/* Bypass Tab */}
            {activeTab === 'bypass' && (
              <Bypass 
                showNotification={{ showSuccess, showError, showWarning, showInfo }}
              />
            )}

            {/* Offline Setup Tab */}
            {activeTab === 'offline' && (
              <OfflineSetup 
                showNotification={{ showSuccess, showError, showWarning, showInfo }}
              />
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <Settings 
                showNotification={{ showSuccess, showError, showWarning, showInfo }}
              />
            )}

            {/* PEAK Tab - Library Game Details */}
            {activeTab === 'peak' && (
              selectedLibraryGame ? (
                <GameDetails 
                  game={selectedLibraryGame}
                  onBack={handleBackFromLibraryDetails}
                  isLibraryMode={true}
                  showNotification={{ showSuccess, showError, showWarning, showInfo }}
                />
              ) : (
                <div className="placeholder-container">
                  <div className="placeholder-icon">🎮</div>
                  <h3>Select a Game</h3>
                  <p>Choose a game from your library to view details</p>
                </div>
              )
            )}
          </section>
        </div>
      </main>
      
      {/* Notification System */}
      <NotificationSystem
        notifications={notifications}
        removeNotification={removeNotification}
      />
    </div>
  );
}

export default App;
