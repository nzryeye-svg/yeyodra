import React, { useEffect } from 'react';
import './ConfirmationModal.scss';

export function ConfirmationModal({ 
  isOpen, 
  onConfirm, 
  onCancel, 
  title, 
  message, 
  confirmText = "Continue", 
  cancelText = "Cancel",
  isGoogleDrive = false,
  gameInfo = null 
}) {
  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        onConfirm();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="confirmation-modal-overlay">
      <div className="confirmation-modal">
        <div className="confirmation-modal__header">
          <h3 className="confirmation-modal__title">{title}</h3>
        </div>
        
        <div className="confirmation-modal__content">
          {gameInfo && (
            <div className="confirmation-modal__game-info">
              <img 
                src={gameInfo.header_image} 
                alt={gameInfo.name}
                className="confirmation-modal__game-image"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/460x215/1e2328/ffffff?text=No+Image';
                }}
              />
              <div className="confirmation-modal__game-details">
                <h4>{gameInfo.name}</h4>
                <p className="confirmation-modal__app-id">Steam AppID: {gameInfo.app_id}</p>
              </div>
            </div>
          )}
          
          <div className="confirmation-modal__message">
            <p>{message}</p>
          </div>
          
          {isGoogleDrive && (
            <div className="confirmation-modal__warning">
              <div className="confirmation-modal__warning-icon">⚠️</div>
              <div className="confirmation-modal__warning-content">
                <h5>Google Drive Large File Detected</h5>
                <ul>
                  <li>🕐 Download may take 10-30 minutes</li>
                  <li>📁 File size likely 500MB+ from Google Drive</li>
                  <li>🌐 Requires stable internet connection</li>
                  <li>💾 Ensure sufficient disk space available</li>
                </ul>
              </div>
            </div>
          )}
          
          <div className="confirmation-modal__info">
            <div className="confirmation-modal__info-icon">ℹ️</div>
            <div className="confirmation-modal__info-content">
              <p><strong>This process will:</strong></p>
              <ul>
                <li>📥 Download bypass files to your system</li>
                <li>📂 Extract and copy files to game directory</li>
                <li>🔍 Automatically detect game executables</li>
                <li>🚀 Allow you to launch the game afterwards</li>
                <li>🧹 Clean up temporary files (configurable in settings)</li>
              </ul>
              <p style={{marginTop: '12px', fontSize: '0.85rem', color: '#8b949e'}}>
                <strong>Note:</strong> Make sure the game is not currently running before proceeding.
              </p>
            </div>
          </div>
        </div>
        
        <div className="confirmation-modal__actions">
          <div className="confirmation-modal__shortcuts">
            <span>Press <kbd>Esc</kbd> to cancel or <kbd>Ctrl+Enter</kbd> to confirm</span>
          </div>
          <div className="confirmation-modal__buttons">
            <button 
              className="confirmation-modal__btn confirmation-modal__btn--cancel"
              onClick={onCancel}
            >
              {cancelText}
            </button>
            <button 
              className="confirmation-modal__btn confirmation-modal__btn--confirm"
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
