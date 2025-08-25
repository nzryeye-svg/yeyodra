import React from 'react';
import './BypassProgressBar.scss';

export function BypassProgressBar({ 
  isVisible, 
  currentStep, 
  progress, 
  gameName,
  steps = [
    { id: 'download', label: 'Downloading bypass files', icon: '📥' },
    { id: 'extract', label: 'Extracting files', icon: '📂' },
    { id: 'locate', label: 'Locating game directory', icon: '🔍' },
    { id: 'copy', label: 'Copying bypass files', icon: '📋' },
    { id: 'detect', label: 'Detecting executables', icon: '🎮' },
    { id: 'cleanup', label: 'Cleaning up', icon: '🧹' }
  ],
  downloadProgress = null,
  isGoogleDrive = false
}) {
  if (!isVisible) return null;

  const getStepStatus = (stepId) => {
    const stepIndex = steps.findIndex(step => step.id === stepId);
    const currentIndex = steps.findIndex(step => step.id === currentStep);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const getOverallProgress = () => {
    const currentIndex = steps.findIndex(step => step.id === currentStep);
    if (currentIndex === -1) return 0;
    
    const baseProgress = (currentIndex / steps.length) * 100;
    const stepProgress = (progress / 100) * (100 / steps.length);
    
    return Math.min(baseProgress + stepProgress, 100);
  };

  const formatDownloadProgress = () => {
    if (!downloadProgress) return null;
    
    const { downloaded, total, speed } = downloadProgress;
    
    if (total > 0) {
      const percentage = ((downloaded / total) * 100).toFixed(1);
      const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
      const totalMB = (total / (1024 * 1024)).toFixed(1);
      const speedMB = speed ? (speed / (1024 * 1024)).toFixed(1) : 0;
      
      return {
        percentage,
        text: `${downloadedMB} MB / ${totalMB} MB`,
        speed: speedMB > 0 ? `${speedMB} MB/s` : null
      };
    }
    
    return {
      percentage: 0,
      text: `${(downloaded / (1024 * 1024)).toFixed(1)} MB downloaded`,
      speed: null
    };
  };

  const downloadInfo = formatDownloadProgress();

  return (
    <div className="bypass-progress-overlay">
      <div className="bypass-progress">
        <div className="bypass-progress__header">
          <h3 className="bypass-progress__title">Applying Bypass</h3>
          <p className="bypass-progress__game">{gameName}</p>
          {isGoogleDrive && (
            <div className="bypass-progress__gdrive-indicator">
              <span>📁 Google Drive - Large file download in progress</span>
            </div>
          )}
        </div>

        <div className="bypass-progress__overall">
          <div className="bypass-progress__overall-bar">
            <div 
              className="bypass-progress__overall-fill"
              style={{ width: `${getOverallProgress()}%` }}
            />
          </div>
          <div className="bypass-progress__overall-text">
            {getOverallProgress().toFixed(0)}% Complete
          </div>
        </div>

        {/* Download specific progress for active download step */}
        {currentStep === 'download' && downloadInfo && (
          <div className="bypass-progress__download">
            <div className="bypass-progress__download-bar">
              <div 
                className="bypass-progress__download-fill"
                style={{ width: `${downloadInfo.percentage}%` }}
              />
            </div>
            <div className="bypass-progress__download-info">
              <span className="bypass-progress__download-text">{downloadInfo.text}</span>
              {downloadInfo.speed && (
                <span className="bypass-progress__download-speed">{downloadInfo.speed}</span>
              )}
            </div>
          </div>
        )}

        <div className="bypass-progress__steps">
          {steps.map((step, index) => {
            const status = getStepStatus(step.id);
            const isCurrentStep = step.id === currentStep;
            
            return (
              <div 
                key={step.id}
                className={`bypass-progress__step bypass-progress__step--${status}`}
              >
                <div className="bypass-progress__step-indicator">
                  <span className="bypass-progress__step-icon">
                    {status === 'completed' ? '✅' : 
                     status === 'active' ? '⏳' : step.icon}
                  </span>
                  <span className="bypass-progress__step-number">{index + 1}</span>
                </div>
                
                <div className="bypass-progress__step-content">
                  <span className="bypass-progress__step-label">{step.label}</span>
                  {isCurrentStep && (
                    <div className="bypass-progress__step-progress">
                      <div className="bypass-progress__step-bar">
                        <div 
                          className="bypass-progress__step-fill"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="bypass-progress__step-percent">{progress.toFixed(0)}%</span>
                    </div>
                  )}
                  {status === 'completed' && (
                    <span className="bypass-progress__step-status">Completed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isGoogleDrive && currentStep === 'download' && (
          <div className="bypass-progress__tips">
            <div className="bypass-progress__tips-header">💡 Tips while waiting:</div>
            <ul className="bypass-progress__tips-list">
              <li>Large files from Google Drive may take 10-30 minutes</li>
              <li>Keep your internet connection stable</li>
              <li>Don't close the application during download</li>
              <li>You can minimize the window safely</li>
            </ul>
          </div>
        )}

        <div className="bypass-progress__footer">
          <div className="bypass-progress__note">
            ⚠️ Please don't close the application during this process
          </div>
        </div>
      </div>
    </div>
  );
}
