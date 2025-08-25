import React from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import './DrmNotice.scss';

const DrmNotice = ({ drmNotice, className = '' }) => {
  if (!drmNotice) return null;

  // Map common DRM types to user-friendly names and severity levels
  const getDrmInfo = (drm) => {
    const drmLower = drm.toLowerCase();
    
    if (drmLower.includes('denuvo')) {
      return {
        name: 'Denuvo Anti-Tamper',
        severity: 'high',
        description: 'Performance impact possible'
      };
    } else if (drmLower.includes('steam')) {
      return {
        name: 'Steam DRM',
        severity: 'low',
        description: 'Requires Steam to run'
      };
    } else if (drmLower.includes('eac') || drmLower.includes('easy')) {
      return {
        name: 'EasyAntiCheat',
        severity: 'medium',
        description: 'Anti-cheat system'
      };
    } else if (drmLower.includes('battleye')) {
      return {
        name: 'BattlEye',
        severity: 'medium',
        description: 'Anti-cheat system'
      };
    } else {
      return {
        name: drm,
        severity: 'medium',
        description: 'DRM protection active'
      };
    }
  };

  const drmInfo = getDrmInfo(drmNotice);

  return (
    <div className={`drm-notice drm-notice--${drmInfo.severity} ${className}`}>
      <FaExclamationTriangle className="drm-notice__icon" />
      <div className="drm-notice__content">
        <span className="drm-notice__name">DRM: {drmInfo.name}</span>
        <span className="drm-notice__description">{drmInfo.description}</span>
      </div>
    </div>
  );
};

export default DrmNotice;
