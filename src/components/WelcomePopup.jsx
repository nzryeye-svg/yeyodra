import { useState, useEffect } from 'react';
import './WelcomePopup.scss';

const WelcomePopup = ({ customerName, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Auto close after 3 seconds
    const timer = setTimeout(() => {
      handleClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div className={`welcome-popup-overlay ${isAnimating ? 'closing' : ''}`}>
      <div className={`welcome-popup ${isAnimating ? 'closing' : ''}`}>
        <div className="welcome-content">
          <div className="welcome-icon">👋</div>
          <h2 className="welcome-message">
            HAI {customerName || 'User'}!
          </h2>
          <p className="welcome-subtitle">Selamat datang di Zenith</p>
        </div>
        <button className="close-btn" onClick={handleClose}>
          ✕
        </button>
      </div>
    </div>
  );
};

export default WelcomePopup;
