import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const results = await invoke('search_games', { 
        query: searchQuery.trim(), 
        page: 1, 
        perPage: 10 
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
      const result = await invoke('download_game', {
        appId: game.app_id,
        gameName: game.game_name,
        outputDir: null
      });
      
      if (result) {
        alert(`Download completed for ${game.game_name}`);
      } else {
        alert(`No data found for ${game.game_name}`);
      }
    } catch (err) {
      setError(`Download failed: ${err}`);
    }
  };

  return (
    <div className="container">
      <h1 style={{ marginBottom: '20px', fontSize: '24px' }}>Yeyodra - Steam Game Manager</h1>
      
      {/* Simple Tab Navigation */}
      <div className="flex gap-2 mb-4">
        <button 
          onClick={() => setActiveTab('search')}
          style={{ backgroundColor: activeTab === 'search' ? '#0066cc' : '#666' }}
        >
          Search Games
        </button>
        <button 
          onClick={() => setActiveTab('library')}
          style={{ backgroundColor: activeTab === 'library' ? '#0066cc' : '#666' }}
        >
          My Library
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          style={{ backgroundColor: activeTab === 'settings' ? '#0066cc' : '#666' }}
        >
          Settings
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ 
          backgroundColor: '#d32f2f', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '16px' 
        }}>
          {error}
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div>
          <h2 style={{ marginBottom: '16px' }}>Search Steam Games</h2>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter game name or AppID..."
              style={{ flex: 1 }}
            />
            <button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? <span className="loading"></span> : 'Search'}
            </button>
          </div>

          {/* Search Results */}
          <div>
            {searchResults.length > 0 && (
              <div>
                <h3 style={{ marginBottom: '12px' }}>Search Results:</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {searchResults.map((game) => (
                    <div key={game.app_id} className="bg-dark p-4 rounded border">
                      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ marginBottom: '4px' }}>{game.game_name}</h4>
                          <p style={{ color: '#aaa', fontSize: '12px' }}>AppID: {game.app_id}</p>
                        </div>
                        <button onClick={() => handleDownload(game)}>
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Library Tab */}
      {activeTab === 'library' && (
        <div>
          <h2 style={{ marginBottom: '16px' }}>My Library</h2>
          <p style={{ color: '#aaa' }}>Library functionality will be implemented here.</p>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div>
          <h2 style={{ marginBottom: '16px' }}>Settings</h2>
          <p style={{ color: '#aaa' }}>Settings functionality will be implemented here.</p>
        </div>
      )}
    </div>
  );
}

export default App;
