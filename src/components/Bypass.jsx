import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { LaunchGameModal } from './LaunchGameModal';
import './Bypass.scss';

export function Bypass({ showNotification }) {
  const [isLoading, setIsLoading] = useState(false);
  const [games, setGames] = useState([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [launchModal, setLaunchModal] = useState({
    isOpen: false,
    gameName: '',
    gameDirectory: '',
    executables: []
  });

  // Game AppIDs with their bypass URLs
  const gameBypassData = [
    {
      appId: '582160',
      bypassUrl: 'https://cdn.discordapp.com/attachments/1390024381463531540/1404222172892758016/Assassins_Creed_-_Origins_FIX.zip?ex=68ac338f&is=68aae20f&hm=773b95fd1f1ae0fc434b239f2fe23574d7b8481ed43798e7220e307a843ca754&'
    },
    {
      appId: '2208920',
      bypassUrl: 'https://cdn.discordapp.com/attachments/1390024010758361240/1404019856348807260/Assassins_Creed_Valhalla_fix.zip?ex=68ac1fe3&is=68aace63&hm=a2b14cd239bf36af558c0799b5942ae46607faaca316c1b2a0e2df39c4e51d05&'
    }
    // Add more games and their bypass URLs here
  ];

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setIsLoadingGames(true);
    try {
      const gamesData = [];
      
      for (const gameData of gameBypassData) {
        try {
          const gameDetails = await invoke('get_game_details', { appId: gameData.appId });
          const game = {
            app_id: gameData.appId,
            name: gameDetails.name,
            header_image: gameDetails.header_image,
            short_description: gameDetails.short_description,
            bypass_url: gameData.bypassUrl,
            hasBypass: true
          };
          gamesData.push(game);
        } catch (err) {
          console.error(`Failed to fetch game ${gameData.appId}:`, err);
        }
      }
      
      setGames(gamesData);
    } catch (error) {
      console.error('Error fetching games:', error);
      if (showNotification) {
        showNotification.showError(`Failed to load games: ${error}`);
      }
    } finally {
      setIsLoadingGames(false);
    }
  };

  const handleBypassGame = async (game) => {
    if (!game.bypass_url) {
      if (showNotification) {
        showNotification.showWarning('Bypass URL not available for this game');
      }
      return;
    }

    setIsLoading(true);
    try {
      if (showNotification) {
        showNotification.showInfo(`Starting bypass process for ${game.name}...`);
      }

      // Use the automatic bypass function
      const result = await invoke('apply_bypass_automatically', {
        appId: game.app_id,
        bypassUrl: game.bypass_url
      });
      
      if (showNotification) {
        showNotification.showSuccess(`✅ Bypass successfully applied to ${game.name}!`);
      }

      console.log('Bypass result:', result);

      // Show launch modal with detected executables
      if (result.success && result.executables && result.executables.length > 0) {
        setLaunchModal({
          isOpen: true,
          gameName: game.name,
          gameDirectory: result.game_directory || '',
          executables: result.executables
        });
      } else {
        if (showNotification) {
          showNotification.showWarning('No executable files detected. You can manually launch the game from the game folder.');
        }
      }

      // Show additional info about temporary files
      setTimeout(() => {
        if (showNotification) {
          showNotification.showInfo('💡 Check Settings to configure temporary file cleanup behavior');
        }
      }, 3000);
    } catch (error) {
      console.error('Error applying bypass:', error);
      if (showNotification) {
        showNotification.showError(`❌ Failed to apply bypass: ${error}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const closeLaunchModal = () => {
    setLaunchModal({
      isOpen: false,
      gameName: '',
      gameDirectory: '',
      executables: []
    });
  };

  return (
    <div className="bypass">
      {isLoadingGames && (
        <div className="bypass__loading">
          <div className="bypass__loading-spinner"></div>
          <p>Loading games...</p>
        </div>
      )}

      {!isLoadingGames && (
        <div className="bypass__game-grid">
          {games.map((game) => (
            <div key={game.app_id} className="bypass__game-card">
              <div className="bypass__game-image">
                <img 
                  src={game.header_image} 
                  alt={game.name}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/460x215/1e2328/ffffff?text=No+Image';
                  }}
                />
                <div className="bypass__game-overlay">
                  <button 
                    className="bypass__game-button"
                    onClick={() => handleBypassGame(game)}
                    disabled={isLoading}
                  >
                    🛡️ Apply Bypass
                  </button>
                </div>
                <div className="bypass__game-info">
                  <h3 className="bypass__game-title">{game.name}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="bypass__loading-overlay">
          <div className="bypass__loading-spinner"></div>
          <p>Applying bypass...</p>
        </div>
      )}

      <LaunchGameModal
        isOpen={launchModal.isOpen}
        onClose={closeLaunchModal}
        gameName={launchModal.gameName}
        gameDirectory={launchModal.gameDirectory}
        executables={launchModal.executables}
        showNotification={showNotification}
      />
    </div>
  );
}
