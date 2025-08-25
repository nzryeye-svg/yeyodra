import React, { useState } from 'react';
import './SystemRequirements.scss';

const SystemRequirements = ({ requirements, compact = false }) => {
  const [activeTab, setActiveTab] = useState('minimum');

  // Parse HTML requirements from Steam API
  const parseRequirements = (htmlString) => {
    if (!htmlString) return null;

    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;

    const requirements = {};
    
    // Look for <strong> tags which contain the requirement labels
    const strongElements = tempDiv.querySelectorAll('strong');
    
    strongElements.forEach((strong) => {
      const text = strong.textContent.toLowerCase();
      const nextSibling = strong.nextSibling;
      
      if (nextSibling && nextSibling.textContent) {
        let value = nextSibling.textContent.trim();
        // Remove leading colons and spaces
        value = value.replace(/^:\s*/, '');
        
        if (text.includes('os') || text.includes('operating system')) {
          requirements.os = value;
        } else if (text.includes('processor') || text.includes('cpu')) {
          requirements.processor = value;
        } else if (text.includes('memory') || text.includes('ram')) {
          requirements.memory = value;
        } else if (text.includes('graphics') || text.includes('video card')) {
          requirements.graphics = value;
        } else if (text.includes('directx')) {
          requirements.directx = value;
        } else if (text.includes('storage') || text.includes('hard disk')) {
          requirements.storage = value;
        } else if (text.includes('sound') || text.includes('audio')) {
          requirements.sound = value;
        } else if (text.includes('network')) {
          requirements.network = value;
        }
      }
    });

    // Fallback parsing for li elements
    if (Object.keys(requirements).length === 0) {
      const liElements = tempDiv.querySelectorAll('li');
      liElements.forEach((li) => {
        const text = li.textContent;
        const parts = text.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim().toLowerCase();
          const value = parts.slice(1).join(':').trim();
          
          if (key.includes('os') || key.includes('operating system')) {
            requirements.os = value;
          } else if (key.includes('processor') || key.includes('cpu')) {
            requirements.processor = value;
          } else if (key.includes('memory') || key.includes('ram')) {
            requirements.memory = value;
          } else if (key.includes('graphics') || key.includes('video card')) {
            requirements.graphics = value;
          } else if (key.includes('directx')) {
            requirements.directx = value;
          } else if (key.includes('storage') || key.includes('hard disk')) {
            requirements.storage = value;
          } else if (key.includes('sound') || key.includes('audio')) {
            requirements.sound = value;
          } else if (key.includes('network')) {
            requirements.network = value;
          }
        }
      });
    }

    return Object.keys(requirements).length > 0 ? requirements : null;
  };

  const minimumReqs = parseRequirements(requirements?.minimum);
  const recommendedReqs = parseRequirements(requirements?.recommended);

  // If no requirements data available
  if (!minimumReqs && !recommendedReqs) {
    return (
      <div className={`system-requirements ${compact ? 'system-requirements--compact' : ''}`}>
        <div className="system-requirements__tabs">
          <div className="tab tab--active">
            <span>System Requirements</span>
          </div>
        </div>
        <div className="system-requirements__content">
          <div className="requirements-unavailable">
            <p>{compact ? 'Not available' : 'System requirements information is not available for this game.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const renderRequirementRow = (label, value) => {
    if (!value) return null;
    
    return (
      <div key={label} className="requirement-row">
        <div className="requirement-label">
          <strong>{label}:</strong>
        </div>
        <div className="requirement-value">
          {value}
        </div>
      </div>
    );
  };

  const renderRequirements = (reqs) => {
    if (!reqs) {
      return (
        <div className="requirements-unavailable">
          <p>Requirements not available</p>
        </div>
      );
    }

    return (
      <div className="requirements-list">
        {renderRequirementRow('OS', reqs.os)}
        {renderRequirementRow('Processor', reqs.processor)}
        {renderRequirementRow('Memory', reqs.memory)}
        {renderRequirementRow('Graphics', reqs.graphics)}
        {renderRequirementRow('DirectX', reqs.directx)}
        {renderRequirementRow('Storage', reqs.storage)}
        {renderRequirementRow('Sound Card', reqs.sound)}
        {renderRequirementRow('Network', reqs.network)}
      </div>
    );
  };

  return (
    <div className={`system-requirements ${compact ? 'system-requirements--compact' : ''}`}>
      <div className="system-requirements__tabs">
        {minimumReqs && (
          <div 
            className={`tab ${activeTab === 'minimum' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('minimum')}
          >
            <span>Minimum</span>
          </div>
        )}
        {recommendedReqs && (
          <div 
            className={`tab ${activeTab === 'recommended' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('recommended')}
          >
            <span>Recommended</span>
          </div>
        )}
      </div>
      
      <div className="system-requirements__content">
        {activeTab === 'minimum' && renderRequirements(minimumReqs)}
        {activeTab === 'recommended' && renderRequirements(recommendedReqs)}
      </div>
    </div>
  );
};

export default SystemRequirements;
