import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { LaunchGameModal } from './LaunchGameModal';
import { ConfirmationModal } from './ConfirmationModal';
import { BypassProgressBar } from './BypassProgressBar';
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
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    gameInfo: null
  });
  const [progressData, setProgressData] = useState({
    isVisible: false,
    currentStep: 'download',
    progress: 0,
    gameName: '',
    downloadProgress: null,
    isGoogleDrive: false
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
    },
    {
      appId: '2239550', // Watch Dogs: Legion
      bypassUrl: 'https://drive.google.com/file/d/1BU-DS2j0Uo3TG9xOmJyEqqXly1dACIrc/view?pli=1'
    }
    // Add more games and their bypass URLs here
    // Supports: Discord CDN, Google Drive, GitHub Releases, MediaFire, MEGA
  ];

  useEffect(() => {
    fetchGames();
    
    // Set up event listener for bypass progress
    const unlistenProgress = listen('bypass-progress', (event) => {
      const progressInfo = event.payload;
      console.log('Progress update:', progressInfo);
      
      setProgressData(prev => ({
        ...prev,
        currentStep: progressInfo.step,
        progress: progressInfo.progress,
        downloadProgress: progressInfo.download_info,
      }));
    });

    return () => {
      unlistenProgress.then(unlisten => unlisten());
    };
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

  const showConfirmationModal = (game) => {
    if (!game.bypass_url) {
      if (showNotification) {
        showNotification.showWarning('Bypass URL not available for this game');
      }
      return;
    }

    setConfirmationModal({
      isOpen: true,
      gameInfo: game
    });
  };

  const handleConfirmBypass = async () => {
    const game = confirmationModal.gameInfo;
    
    // Close confirmation modal
    setConfirmationModal({
      isOpen: false,
      gameInfo: null
    });

    // Show progress bar instead of loading spinner
    setProgressData({
      isVisible: true,
      currentStep: 'download',
      progress: 0,
      gameName: game.name,
      downloadProgress: null,
      isGoogleDrive: game.bypass_url.includes('drive.google.com')
    });

    setIsLoading(true);
    try {
      if (showNotification) {
        // Enhanced notifications for different file types
        if (game.bypass_url.includes('drive.google.com')) {
          showNotification.showInfo(`🔍 Starting Google Drive download for ${game.name}...`);
          showNotification.showWarning('📁 Large file detected from Google Drive. This may take 10-30 minutes depending on file size and internet speed.');
        } else if (game.bypass_url.includes('cdn.discordapp.com')) {
          showNotification.showInfo(`⚡ Starting fast download for ${game.name}...`);
        } else {
          showNotification.showInfo(`🔄 Starting bypass process for ${game.name}...`);
        }
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
        // Enhanced error messages for different scenarios
        const errorStr = error.toString().toLowerCase();
        
        if (errorStr.includes('google drive') && errorStr.includes('confirmation')) {
          showNotification.showError('❌ Google Drive requires manual confirmation for large files. Please try downloading the file manually first, or use an alternative download link.');
        } else if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
          showNotification.showError('⏱️ Download timed out. Large files may require multiple attempts. Please check your internet connection and try again.');
        } else if (errorStr.includes('virus scan') || errorStr.includes('cannot scan')) {
          showNotification.showError('🦠 Google Drive cannot scan large files for viruses. File download was blocked for safety. Try using an alternative download source.');
        } else if (errorStr.includes('failed to download')) {
          showNotification.showError('📡 Download failed. Please check your internet connection and verify the download URL is still valid.');
        } else {
          showNotification.showError(`❌ Failed to apply bypass: ${error}`);
        }
      }
    } finally {
      setIsLoading(false);
      // Hide progress bar
      setProgressData(prev => ({ ...prev, isVisible: false }));
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

  const closeConfirmationModal = () => {
    setConfirmationModal({
      isOpen: false,
      gameInfo: null
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
                    onClick={() => showConfirmationModal(game)}
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

      <BypassProgressBar
        isVisible={progressData.isVisible}
        currentStep={progressData.currentStep}
        progress={progressData.progress}
        gameName={progressData.gameName}
        downloadProgress={progressData.downloadProgress}
        isGoogleDrive={progressData.isGoogleDrive}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onConfirm={handleConfirmBypass}
        onCancel={closeConfirmationModal}
        title="Confirm Bypass Application"
        message="Are you sure you want to apply bypass for this game? This will download and install bypass files to your game directory."
        confirmText="Apply Bypass"
        cancelText="Cancel"
        isGoogleDrive={confirmationModal.gameInfo?.bypass_url?.includes('drive.google.com')}
        gameInfo={confirmationModal.gameInfo}
      />

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
