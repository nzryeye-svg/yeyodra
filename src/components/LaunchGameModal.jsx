import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/shell';
import './LaunchGameModal.scss';

export function LaunchGameModal({ 
  isOpen, 
  onClose, 
  gameName, 
  gameDirectory, 
  executables, 
  showNotification 
}) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [selectedExecutable, setSelectedExecutable] = useState(executables?.[0] || '');

  if (!isOpen) return null;

  const getExecutableName = (fullPath) => {
    const parts = fullPath.split('\\');
    return parts[parts.length - 1];
  };

  const getExecutableSize = (fullPath) => {
    // This is a placeholder - in a real implementation, you might want to get actual file sizes
    return 'Main executable';
  };

  const handleLaunch = async () => {
    if (!selectedExecutable) {
      if (showNotification) {
        showNotification.showWarning('Please select an executable to launch');
      }
      return;
    }

    setIsLaunching(true);
    try {
      await invoke('launch_game_executable', { 
        exePath: selectedExecutable 
      });
      
      if (showNotification) {
        showNotification.showSuccess(`🚀 ${gameName} launched successfully!`);
      }
      
      onClose();
    } catch (error) {
      console.error('Error launching game:', error);
      if (showNotification) {
        showNotification.showError(`Failed to launch game: ${error}`);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await open(gameDirectory);
    } catch (error) {
      console.error('Error opening folder:', error);
      if (showNotification) {
        showNotification.showError('Failed to open game folder');
      }
    }
  };

  return (
    <div className="launch-modal-overlay" onClick={onClose}>
      <div className="launch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="launch-modal__header">
          <h2 className="launch-modal__title">🎮 Launch Game</h2>
          <button 
            className="launch-modal__close"
            onClick={onClose}
            disabled={isLaunching}
          >
            ×
          </button>
        </div>

        <div className="launch-modal__content">
          <div className="launch-modal__game-info">
            <h3 className="launch-modal__game-name">{gameName}</h3>
            <p className="launch-modal__game-path">{gameDirectory}</p>
          </div>

          <div className="launch-modal__success-message">
            <div className="launch-modal__success-icon">✅</div>
            <p>Bypass successfully applied! Choose how to launch the game:</p>
          </div>

          {executables && executables.length > 0 && (
            <div className="launch-modal__executables">
              <h4 className="launch-modal__section-title">Select executable to launch:</h4>
              
              <div className="launch-modal__exe-list">
                {executables.map((exe, index) => (
                  <label key={exe} className="launch-modal__exe-option">
                    <input
                      type="radio"
                      name="executable"
                      value={exe}
                      checked={selectedExecutable === exe}
                      onChange={(e) => setSelectedExecutable(e.target.value)}
                      disabled={isLaunching}
                    />
                    <div className="launch-modal__exe-info">
                      <span className="launch-modal__exe-name">
                        {getExecutableName(exe)}
                      </span>
                      <span className="launch-modal__exe-detail">
                        {index === 0 ? '🎯 Recommended' : getExecutableSize(exe)}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="launch-modal__instructions">
            <h4 className="launch-modal__section-title">Instructions:</h4>
            <ol className="launch-modal__instruction-list">
              <li>Launch the game using the executable above first</li>
              <li>Then you can launch it through Steam normally</li>
              <li>The bypass files have been copied to the game directory</li>
            </ol>
          </div>
        </div>

        <div className="launch-modal__actions">
          <button
            className="launch-modal__btn launch-modal__btn--secondary"
            onClick={handleOpenFolder}
            disabled={isLaunching}
          >
            📁 Open Game Folder
          </button>
          
          <button
            className="launch-modal__btn launch-modal__btn--primary"
            onClick={handleLaunch}
            disabled={isLaunching || !selectedExecutable}
          >
            {isLaunching ? (
              <>
                <span className="launch-modal__spinner"></span>
                Launching...
              </>
            ) : (
              '🚀 Launch Game'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
