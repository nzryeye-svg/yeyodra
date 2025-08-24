import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { 
  FaSave, 
  FaFolder, 
  FaSync, 
  FaDownload, 
  FaUpload,
  FaCheck,
  FaExclamationTriangle,
  FaSearch,
  FaClock,
  FaHdd,
  FaSpinner
} from 'react-icons/fa';
import './SaveManager.scss';

export function SaveManager({ appId = "unknown", gameName = "Unknown Game", showNotification }) {
  const [saveInfo, setSaveInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [backupResult, setBackupResult] = useState(null);
  const [customBackupPath, setCustomBackupPath] = useState('');

  useEffect(() => {
    if (appId && gameName) {
      detectSaveLocations();
    }
  }, [appId, gameName]);

  const detectSaveLocations = async () => {
    setIsLoading(true);
    try {
      const result = await invoke('detect_save_locations', {
        appId,
        gameName
      });
      setSaveInfo(result);
      
      if (result.save_locations.length === 0) {
        showNotification?.showWarning('No save locations found for this game');
      } else {
        showNotification?.showSuccess(`Found ${result.save_locations.length} save location(s)`);
      }
    } catch (error) {
      showNotification?.showError(`Failed to detect save locations: ${error}`);
      setSaveInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupSaves = async () => {
    if (!saveInfo || saveInfo.save_locations.length === 0) {
      showNotification?.showWarning('No save locations to backup');
      return;
    }

    setIsBackingUp(true);
    setBackupResult(null);

    try {
      const result = await invoke('backup_save_files', {
        appId,
        gameName,
        backupLocation: customBackupPath || undefined
      });

      setBackupResult(result);
      
      if (result.success) {
        showNotification?.showSuccess(`Backup completed: ${result.files_backed_up} files backed up`);
      } else {
        showNotification?.showError(`Backup failed: ${result.message}`);
      }
    } catch (error) {
      showNotification?.showError(`Backup failed: ${error}`);
      setBackupResult({
        success: false,
        message: error.toString()
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleSyncWithSteam = async () => {
    if (!saveInfo) {
      showNotification?.showWarning('Please detect save locations first');
      return;
    }

    setIsSyncing(true);

    try {
      const result = await invoke('sync_saves_with_steam', {
        appId,
        gameName
      });

      if (result.success) {
        showNotification?.showSuccess('Successfully synced saves with Steam');
      } else {
        showNotification?.showError(`Sync failed: ${result.message}`);
      }
    } catch (error) {
      showNotification?.showError(`Sync failed: ${error}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectBackupPath = async () => {
    try {
      const selectedPath = await invoke('select_directory');
      if (selectedPath) {
        setCustomBackupPath(selectedPath);
      }
    } catch (error) {
      showNotification?.showError(`Failed to select backup path: ${error}`);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="save-manager">
      <div className="save-manager__header">
        <h3 className="save-manager__title">
          <FaSave className="save-manager__title-icon" />
          Save Game Management
        </h3>
        <p className="save-manager__description">
          Manage save files for {gameName} (AppID: {appId})
        </p>
      </div>

      <div className="save-manager__actions">
        <button
          className="save-manager__action-button primary"
          onClick={detectSaveLocations}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="save-manager__spinner"></div>
              Detecting...
            </>
          ) : (
            <>
              <FaSearch />
              Detect Save Locations
            </>
          )}
        </button>

        <button
          className="save-manager__action-button"
          onClick={handleBackupSaves}
          disabled={isBackingUp || !saveInfo || saveInfo.save_locations.length === 0}
        >
          {isBackingUp ? (
            <>
              <div className="save-manager__spinner"></div>
              Backing up...
            </>
          ) : (
            <>
              <FaSave />
              Backup Saves
            </>
          )}
        </button>

        <button
          className="save-manager__action-button"
          onClick={handleSyncWithSteam}
          disabled={isSyncing || !saveInfo}
        >
          {isSyncing ? (
            <>
              <div className="save-manager__spinner"></div>
              Syncing...
            </>
          ) : (
            <>
              <FaSync />
              Sync with Steam
            </>
          )}
        </button>
      </div>

      {/* Custom Backup Path */}
      <div className="save-manager__backup-path">
        <label htmlFor="backup-path" className="save-manager__label">
          Custom Backup Location (optional):
        </label>
        <div className="save-manager__backup-path-input">
          <input
            id="backup-path"
            type="text"
            className="save-manager__input"
            value={customBackupPath}
            placeholder="Default: C:\GameBackups\{GameName}"
            readOnly
          />
          <button
            type="button"
            className="save-manager__browse-button"
            onClick={handleSelectBackupPath}
          >
            <FaFolder />
            Browse
          </button>
        </div>
      </div>

      {/* Save Information */}
      {saveInfo && (
        <div className="save-manager__info">
          <h4 className="save-manager__info-title">
            <FaHdd /> Save Locations Found
          </h4>
          
          <div className="save-manager__stats">
            <div className="save-manager__stat">
              <FaFolder />
              <span>{saveInfo.save_locations.length} locations</span>
            </div>
            <div className="save-manager__stat">
              <FaHdd />
              <span>{formatFileSize(saveInfo.total_size)}</span>
            </div>
            <div className="save-manager__stat">
              <FaClock />
              <span>{formatDate(saveInfo.last_modified)}</span>
            </div>
          </div>

          <div className="save-manager__locations">
            {saveInfo.save_locations.map((location, index) => (
              <div key={index} className="save-manager__location">
                <FaFolder className="save-manager__location-icon" />
                <span className="save-manager__location-path">
                  {location}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup Result */}
      {backupResult && (
        <div className={`save-manager__result ${backupResult.success ? 'success' : 'error'}`}>
          <div className="save-manager__result-header">
            {backupResult.success ? <FaCheck /> : <FaExclamationTriangle />}
            <h4>{backupResult.success ? 'Backup Successful!' : 'Backup Failed'}</h4>
          </div>
          
          <p>{backupResult.message}</p>
          
          {backupResult.success && (
            <div className="save-manager__backup-details">
              <p><strong>Backup Location:</strong> {backupResult.backup_path}</p>
              <p><strong>Files Backed Up:</strong> {backupResult.files_backed_up}</p>
              <p><strong>Total Size:</strong> {formatFileSize(backupResult.total_size)}</p>
            </div>
          )}
        </div>
      )}

      <div className="save-manager__guide">
        <h4>Save Management Guide:</h4>
        <div className="save-manager__guide-content">
          <div className="save-manager__guide-section">
            <h5><FaSearch /> Detect Saves</h5>
            <p>Automatically finds save file locations for this game across common directories.</p>
          </div>
          
          <div className="save-manager__guide-section">
            <h5><FaSave /> Backup Saves</h5>
            <p>Creates a timestamped backup of all save files to preserve your progress.</p>
          </div>
          
          <div className="save-manager__guide-section">
            <h5><FaSync /> Sync with Steam</h5>
            <p>Copies save files between offline mode and Steam Cloud locations.</p>
          </div>
        </div>

        <div className="save-manager__note">
          <p><strong>Note:</strong> Always backup your saves before switching between offline and online modes to prevent data loss.</p>
        </div>
      </div>
    </div>
  );
}

export default SaveManager;
