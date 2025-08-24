import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { GameCard } from './components/GameCard';
import GameDetails from './components/GameDetails';
import { Featured } from './components/Featured';
import { CategoryButtons } from './components/CategoryButtons';
import { Footer } from './components/Footer';
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
        // Show success notification (you can implement toast later)
        console.log(`Download completed for ${game.game_name}`);
      } else {
        console.log(`No data found for ${game.game_name}`);
      }
    } catch (err) {
      setError(`Download failed: ${err}`);
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
      case 'downloads':
        return 'My Library';
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
                <h2 className="page-title">Featured</h2>
                <Featured />
                <CategoryButtons 
                  activeCategory={activeCategory} 
                  onCategoryChange={setActiveCategory} 
                />

                <div className="game-section">
                  <h2 className="section-title">🔥 Hot now</h2>
                  <div className="game-grid">
                    {/* Placeholder cards */}
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="game-card-placeholder">
                        Sample Game {i}
                      </div>
                    ))}
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

            {/* My Library Tab */}
            {activeTab === 'downloads' && (
              <div className="placeholder-container">
                <div className="placeholder-icon">📚</div>
                <h3>My Library</h3>
                <p>Select a game from the sidebar to view details</p>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="placeholder-container">
                <div className="placeholder-icon">⚙️</div>
                <h3>Settings</h3>
                <p>Settings panel will be implemented soon</p>
              </div>
            )}

            {/* PEAK Tab - Library Game Details */}
            {activeTab === 'peak' && (
              selectedLibraryGame ? (
                <GameDetails 
                  game={selectedLibraryGame}
                  onBack={handleBackFromLibraryDetails}
                  isLibraryMode={true}
                  showNotification={showLibraryNotification}
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
      
      <Footer 
        downloadStatus="No downloads in progress" 
        version='v0.1.0 "Yeyodra"' 
      />
      
      {/* Notification System */}
      <NotificationSystem
        notifications={notifications}
        removeNotification={removeNotification}
      />
    </div>
  );
}

export default App;
