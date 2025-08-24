import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { 
  FaSignInAlt, FaHome, FaThLarge, FaDownload, FaCog, FaGamepad, FaFilter 
} from 'react-icons/fa';
import { IoReloadCircleOutline } from 'react-icons/io5';
import './Sidebar.scss';

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_INITIAL_WIDTH = 250;
const SIDEBAR_MAX_WIDTH = 450;

const initialSidebarWidth = localStorage.getItem('sidebarWidth');

export function Sidebar({ activeTab, selectedLibraryGame, onTabChange }) {
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [libraryGames, setLibraryGames] = useState([]);
  const [filteredLibraryGames, setFilteredLibraryGames] = useState([]);
  const [libraryFilter, setLibraryFilter] = useState('');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const navigationItems = [
    { key: 'home', label: 'Home', icon: <FaHome /> },
    { key: 'catalogue', label: 'Catalogue', icon: <FaThLarge /> },
    { key: 'downloads', label: 'My Library', icon: <FaDownload /> },
    { key: 'settings', label: 'Settings', icon: <FaCog /> },
  ];

  // Load library games on component mount
  useEffect(() => {
    loadLibraryGames();
  }, []);

  // Filter library games when filter changes
  useEffect(() => {
    if (!libraryFilter.trim()) {
      setFilteredLibraryGames(libraryGames);
    } else {
      const filtered = libraryGames.filter(game =>
        game.name.toLowerCase().includes(libraryFilter.toLowerCase()) ||
        game.app_id.includes(libraryFilter)
      );
      setFilteredLibraryGames(filtered);
    }
  }, [libraryGames, libraryFilter]);

  const loadLibraryGames = async () => {
    setIsLoadingLibrary(true);
    try {
      const games = await invoke('get_library_games', {
        luaDir: 'C:\\Program Files (x86)\\Steam\\config\\stplug-in',
        manifestDir: 'C:\\Program Files (x86)\\Steam\\config\\depotcache'
      });
      setLibraryGames(games);
      setFilteredLibraryGames(games);
    } catch (err) {
      console.error('Failed to load library games:', err);
      setLibraryGames([]);
      setFilteredLibraryGames([]);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleLibraryFilterChange = (e) => {
    setLibraryFilter(e.target.value);
  };

  const handleRefreshLibrary = () => {
    loadLibraryGames();
  };

  const handleLibraryGameClick = (game) => {
    // Set the active tab to show game details and pass game info
    onTabChange('peak', game);
  };

  const handleMouseDown = (event) => {
    setIsResizing(true);
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e) => {
      const newWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(startWidth + (e.clientX - startX), SIDEBAR_MAX_WIDTH)
      );
      setSidebarWidth(newWidth);
      localStorage.setItem('sidebarWidth', String(newWidth));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <aside 
      className={`sidebar ${isResizing ? 'sidebar--resizing' : ''}`}
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        maxWidth: sidebarWidth,
      }}
    >
      <div className="sidebar__container">
        {/* Auth Section */}
        <div className="sidebar__auth">
          <button className="sidebar__auth-button">
            <span className="sidebar__auth-icon"><FaSignInAlt /></span>
            <span>Sign in</span>
          </button>
        </div>

        {/* Navigation Menu */}
        <div className="sidebar__content">
          <section className="sidebar__section">
            <ul className="sidebar__menu">
              {navigationItems.map((item) => (
                <li
                  key={item.key}
                  className={`sidebar__menu-item ${
                    activeTab === item.key ? 'sidebar__menu-item--active' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="sidebar__menu-item-button"
                    onClick={() => onTabChange(item.key)}
                  >
                    <span className="sidebar__menu-item-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* My Library Section */}
          <section className="sidebar__section">
            <div className="sidebar__section-header">
              <small className="sidebar__section-title">MY LIBRARY</small>
              <button 
                className="sidebar__refresh-button"
                onClick={handleRefreshLibrary}
                disabled={isLoadingLibrary}
              >
                <IoReloadCircleOutline size={18} />
              </button>
            </div>
            
            <div className="sidebar__filter-container">
              <FaFilter className="sidebar__filter-icon" />
              <input 
                type="text" 
                placeholder="Filter library" 
                className="sidebar__filter-input"
                value={libraryFilter}
                onChange={handleLibraryFilterChange}
              />
            </div>

            <ul className="sidebar__menu sidebar__library-menu">
              {isLoadingLibrary ? (
                <li className="sidebar__loading">
                  <div className="sidebar__loading-spinner"></div>
                  <span>Loading...</span>
                </li>
              ) : filteredLibraryGames.length > 0 ? (
                filteredLibraryGames.map((game) => (
                  <li
                    key={game.app_id}
                    className={`sidebar__menu-item sidebar__library-item ${
                      selectedLibraryGame && selectedLibraryGame.app_id === game.app_id 
                        ? 'sidebar__menu-item--active' 
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="sidebar__menu-item-button sidebar__library-game-button"
                      onClick={() => handleLibraryGameClick(game)}
                      title={`${game.name} (AppID: ${game.app_id})`}
                    >
                      <div className="sidebar__game-image">
                        {game.capsule_image ? (
                          <img 
                            src={game.capsule_image} 
                            alt={game.name}
                            className="sidebar__game-capsule"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextElementSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className="sidebar__game-fallback-icon" style={{display: game.capsule_image ? 'none' : 'flex'}}>
                          <FaGamepad />
                        </div>
                      </div>
                      <div className="sidebar__game-info">
                        <span className="sidebar__game-name">
                          {game.name.length > 20 ? `${game.name.substring(0, 20)}...` : game.name}
                        </span>

                      </div>
                    </button>
                  </li>
                ))
              ) : (
                <li className="sidebar__empty-library">
                  <span>No games found</span>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      {/* Resize Handle */}
      <button
        type="button"
        className="sidebar__handle"
        onMouseDown={handleMouseDown}
      />
    </aside>
  );
}
