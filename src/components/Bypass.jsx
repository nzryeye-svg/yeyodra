import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { LaunchGameModal } from './LaunchGameModal';
import { ConfirmationModal } from './ConfirmationModal';
import { BypassProgressBar } from './BypassProgressBar';
import { PremiumNotice } from './PremiumNotice';
import './Bypass.scss';

export function Bypass({ showNotification, licenseInfo }) {
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
      appId: '2622380', // Elden ring nightreign
      bypassUrl: 'https://drive.google.com/file/d/1ZN1yfI5wmuvPWP9vv1HJ3NghJ-7vEhH3/view'
    },
    {
      appId: '3240220', // Grand Theft Auto V Enhanced
      bypassUrl: 'https://cdn.discordapp.com/attachments/1389990820903387257/1397450870303490191/GTA_V_Enhanced_Fix.7z?ex=68ac9dca&is=68ab4c4a&hm=af5e559917dc5117fdc5879f744d265c3d1ab670a44743217db1e2ac6ca4118b&'
    },
    {
      appId: '1547000', // Grand Theft Auto San Andreas Definitive
      bypassUrl: 'https://drive.google.com/file/d/1X-pF6ZcICKEQct_mguOCKRrX8ic31CmE/view'
    },
    {
      appId: '1546970', // Grand Theft Auto III - The Definitive Edition
      bypassUrl: 'https://drive.google.com/file/d/1XKZ4oCYdBKQ9_g6KnKoSaBqBoEA50xmg/view'
    },
    {
      appId: '1546990', // Grand Theft Auto Vice City Definitive
      bypassUrl: 'https://drive.google.com/file/d/1X7Lty9v7ubJ8zUXgrXosIR2hNRWkLJeu/view'
    },
    {
      appId: '582160', // Assassins Creed Origins
      bypassUrl: 'https://cdn.discordapp.com/attachments/1390024381463531540/1404222172892758016/Assassins_Creed_-_Origins_FIX.zip?ex=68ac338f&is=68aae20f&hm=773b95fd1f1ae0fc434b239f2fe23574d7b8481ed43798e7220e307a843ca754&'
    },
    {
      appId: '2208920', // Assassins Creed Valhalla
      bypassUrl: 'https://cdn.discordapp.com/attachments/1390024010758361240/1404019856348807260/Assassins_Creed_Valhalla_fix.zip?ex=68ac1fe3&is=68aace63&hm=a2b14cd239bf36af558c0799b5942ae46607faaca316c1b2a0e2df39c4e51d05&'
    },
    {
      appId: '3035570', // Assassins Creed Mirage
      bypassUrl: 'https://drive.google.com/file/d/1lI3UrrHXqwqwLkeByN2BukbNHl_sNmaQ/view'
    },
    {
      appId: '812140', // Assassins Creed Odyssey
      bypassUrl: 'https://drive.google.com/file/d/1hjza_zWJMGQ5MFFslwNd4j_26Lq_d7KX/view?usp=drive_link'
    },
    {
      appId: '311560', // Assassin's Creed Rogue
      bypassUrl: 'https://cdn.discordapp.com/attachments/1390020111745945792/1390020112676819045/AC_Rouge.zip?ex=68ac9c1c&is=68ab4a9c&hm=1c32b1d5cfaa9f9e22d357b9324b985e8dc6862a51cec43404770709dc17e2d0&'
    },
    {
      appId: '2239550', // Watch Dogs: Legion
      bypassUrl: 'https://drive.google.com/file/d/1BU-DS2j0Uo3TG9xOmJyEqqXly1dACIrc/view?pli=1'
    },
    {
      appId: '447040', // Watch Dogs 2
      bypassUrl: 'https://cdn.discordapp.com/attachments/1389476637506015364/1404643658468163644/Watch_Dogs_2_FIX.zip?ex=68ad1359&is=68abc1d9&hm=1af08fa0ae015efc9808b6e7ccbe0db2ccb40d08107eeef4568a0343bf2e71f3&'
    },
    {
      appId: '243470', // Watch Dogs
      bypassUrl: 'https://cdn.discordapp.com/attachments/1389475358436495480/1389475358943875222/Watch_Dogs_FIX.zip?ex=68ac9b04&is=68ab4984&hm=0d6f15d7f681a9a9fbeb9f585c289c042a193dc7081024e8a0cfa90ea6ad2128&'
    },
    {
      appId: '637650', // FINAL FANTASY XV WINDOWS EDITION
      bypassUrl: 'https://cdn.discordapp.com/attachments/1401413616120627251/1401413621250265108/Final_Fantasy_xv_Windows_Edition_episode_ardyn_fix_codex.rar?ex=68ac87e4&is=68ab3664&hm=6ac5d1cc5e41f883377c87a0a0d3302df84c469294cd85037ee71fe3b28ca310&'
    },
    {
      appId: '2050650', // Resident Evil 4
      bypassUrl: 'https://drive.google.com/file/d/1qKe_NRFRz8RbQ3y3w2V5-D5HQyHO6q2A/edit'
    },
    {
      appId: '1235140', // Yakuza: Like a Dragon
      bypassUrl: 'https://cdn.discordapp.com/attachments/1399054772224393237/1399054777027133573/Yakuza_Like_A_Dragon_Fix_Empress.rar?ex=68ad2d8c&is=68abdc0c&hm=a6e172e4fc705b735ec9a9e551e887a880af768aadd698441f0d5d87b729df9f&'
    },
    {
      appId: '208650', // Batman™: Arkham Knight
      bypassUrl: 'https://cdn.discordapp.com/attachments/1399549307014746244/1399549308952379456/BatmanTM_Arkham_Knight_Fix_cpy.zip?ex=68acffdd&is=68abae5d&hm=7740e302ba8dddcfefb6dc7c89406f02e08dc9ae74e8cd1aee0bc162deb79c3a&'
    },
    {
      appId: '2668510', // Red Dead Redemption
      bypassUrl: 'https://cdn.discordapp.com/attachments/1389990240042881055/1399392110687289455/Red_Dead_Redemption_Fix_Razor.zip?ex=68ad1636&is=68abc4b6&hm=67bfef3e4f2cc42434ffd30facdc5eaf0efeb4ed357913946e2ecbb3b657cf69&'
    },
    {
      appId: '438490', // God Eater 2 Rage Burst
      bypassUrl: 'https://cdn.discordapp.com/attachments/1399013410963984487/1399013413627236372/God_Eater_2_Rage_Burst_Steamworks_Fix_Revolt.zip?ex=68ad0706&is=68abb586&hm=4bbee9d1d3380d62f5512dd69b94d04d21fc8c64b0e3673e5523f1f32d72990d&'
    },
    {
      appId: '1222690', // Dragon Age™ Inquisition
      bypassUrl: 'https://drive.google.com/file/d/1rudSLo8OdtjhWNWt9puZzmc00iP4hjYn/view'
    },
    {
      appId: '1259970', // eFootball PES 2021
      bypassUrl: 'https://drive.google.com/file/d/1wUaBi1mVgtT1F7H6j2u6Llh6q0zInWj3/view'
    },
    {
      appId: '1496790', // Gotham Knight
      bypassUrl: 'https://drive.google.com/file/d/1_Pmfq424dEDPLGwL4yWX3S6jqnsP1C5j/view'
    },
    {
      appId: '1774580', // Star Wars™ Battlefront™
      bypassUrl: 'https://drive.google.com/file/d/1XVh84SbL4Ec_neIeP_auT3QnOnHsN-4U/view'
    },
    {
      appId: '371660', // Far Cry Primal
      bypassUrl: 'https://cdn.discordapp.com/attachments/1389052005149970512/1389052005665738853/Farcry_primal.zip?ex=68ad0afd&is=68abb97d&hm=2cc33796f88281bc25aa78945a21eaab793888e1615919e499b2a8b042dad306&'
    },
    {
      appId: '626690', // Sword Art Online Fatal Bullet 
      bypassUrl: 'https://cdn.discordapp.com/attachments/1398355529922777309/1398355531076341830/Sword_art_online_fatal_bullet_dissonance_of_the_nexus_Fix_codex.zip?ex=68ac9c92&is=68ab4b12&hm=5b107ca6c506fb47ae4c9b0361792bb2fd35f4ccbab83222d80aa3da4b86124c&'
    },
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
      // Extract all app IDs for batch processing
      const appIds = gameBypassData.map(data => data.appId);
      
      console.log(`Fetching ${appIds.length} bypass games using batch API...`);
      
      // Use batch API for better rate limiting
      const gameDetailsArray = await invoke('get_batch_game_details', { appIds });
      
      // Map the results back to games with bypass URLs
      const gamesData = [];
      for (let i = 0; i < gameBypassData.length; i++) {
        const gameData = gameBypassData[i];
        const gameDetails = gameDetailsArray.find(details => 
          details && details.steam_appid && details.steam_appid.toString() === gameData.appId
        );
        
        if (gameDetails) {
          const game = {
            app_id: gameData.appId,
            name: gameDetails.name,
            header_image: gameDetails.header_image,
            short_description: gameDetails.short_description,
            bypass_url: gameData.bypassUrl,
            hasBypass: true
          };
          gamesData.push(game);
        } else {
          console.warn(`No details found for game ${gameData.appId}`);
          // Add placeholder for failed games
          const game = {
            app_id: gameData.appId,
            name: `Game ${gameData.appId}`,
            header_image: null,
            short_description: 'Game details unavailable',
            bypass_url: gameData.bypassUrl,
            hasBypass: true
          };
          gamesData.push(game);
        }
      }
      
      console.log(`Successfully loaded ${gamesData.length} bypass games`);
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

  // Check if user has premium access
  const isPremium = licenseInfo?.license_type === 'premium';
  
  // If not premium, show premium notice
  if (!isPremium) {
    return (
      <div className="bypass">
        <PremiumNotice featureName="Bypass Tools" />
      </div>
    );
  }

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
