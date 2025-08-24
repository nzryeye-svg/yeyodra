import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import './Settings.scss';

export function Settings({ showNotification }) {
  const [settings, setSettings] = useState({
    keep_temporary_files: false,
    bypass_download_directory: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await invoke('get_settings');
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      if (showNotification) {
        showNotification.showError('Failed to load settings');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await invoke('save_settings', { settings });
      if (showNotification) {
        showNotification.showSuccess('Settings saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      if (showNotification) {
        showNotification.showError('Failed to save settings');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const selectDirectory = async (type) => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select Download Directory'
      });
      
      if (selectedPath && typeof selectedPath === 'string') {
        setSettings(prev => ({
          ...prev,
          [type]: selectedPath
        }));
        if (showNotification) {
          showNotification.showSuccess('Directory selected successfully!');
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
      if (showNotification) {
        showNotification.showError(`Failed to select directory: ${error}`);
      }
    }
  };

  const openDirectory = async (path) => {
    try {
      await invoke('open_download_directory', { path });
    } catch (error) {
      console.error('Failed to open directory:', error);
      if (showNotification) {
        showNotification.showError('Failed to open directory');
      }
    }
  };



  const handleToggle = (key) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (isLoading) {
    return (
      <div className="settings">
        <div className="settings__loading">
          <div className="settings__loading-spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <h2 className="settings__title">⚙️ Settings</h2>
        <p className="settings__description">
          Configure download directories and file management options
        </p>
      </div>

      <div className="settings__content">
        {/* Download Directories Section */}
        <section className="settings__section">
          <h3 className="settings__section-title">📁 Bypass Directory</h3>
          
          <div className="settings__item">
            <div className="settings__item-header">
              <label className="settings__label">Bypass Downloads Directory</label>
              <p className="settings__description">Where bypass ZIP files are temporarily downloaded</p>
            </div>
            <div className="settings__item-content">
              <div className="settings__directory-input">
                <input
                  type="text"
                  value={settings.bypass_download_directory}
                  readOnly
                  className="settings__directory-path"
                  placeholder="Select bypass directory..."
                />
                <button
                  className="settings__btn settings__btn--browse"
                  onClick={() => selectDirectory('bypass_download_directory')}
                >
                  📁 Browse
                </button>
                <button
                  className="settings__btn settings__btn--open"
                  onClick={() => openDirectory(settings.bypass_download_directory)}
                  disabled={!settings.bypass_download_directory}
                >
                  🔗 Open
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* File Management Section */}
        <section className="settings__section">
          <h3 className="settings__section-title">🗂️ File Management</h3>
          
          <div className="settings__item">
            <div className="settings__item-header">
              <label className="settings__label">Keep Temporary Files</label>
              <p className="settings__description">
                Keep ZIP files and extracted folders after bypass application. If disabled, temporary files will be automatically deleted after bypass is applied.
              </p>
            </div>
            <div className="settings__item-content">
              <label className="settings__toggle">
                <input
                  type="checkbox"
                  checked={settings.keep_temporary_files}
                  onChange={() => handleToggle('keep_temporary_files')}
                />
                <span className="settings__toggle-slider"></span>
              </label>
            </div>
          </div>
        </section>
      </div>

      {/* Save Button */}
      <div className="settings__actions">
        <button
          className="settings__btn settings__btn--primary"
          onClick={saveSettings}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <span className="settings__spinner"></span>
              Saving...
            </>
          ) : (
            '💾 Save Settings'
          )}
        </button>
      </div>
    </div>
  );
}
