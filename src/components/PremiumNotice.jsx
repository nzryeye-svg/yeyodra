import './PremiumNotice.scss';

export function PremiumNotice({ featureName = "This feature" }) {
  return (
    <div className="premium-notice">
      <div className="premium-notice__container">
        <div className="premium-notice__icon">
          <span className="premium-notice__crown">👑</span>
        </div>
        
        <div className="premium-notice__content">
          <h2 className="premium-notice__title">
            Premium Feature
          </h2>
          
          <p className="premium-notice__description">
            {featureName} is only available for <strong>Premium</strong> users.
          </p>
          
          <div className="premium-notice__features">
            <h3>Premium Benefits:</h3>
            <ul>
              <li>🛡️ Access to Bypass Tools</li>
              <li>⚡ Faster Download Speeds</li>
              <li>🎯 Priority Support</li>
              <li>🔄 Automatic Updates</li>
              <li>💎 Exclusive Game Access</li>
            </ul>
          </div>
          
          <div className="premium-notice__actions">
            <button 
              className="premium-notice__upgrade-btn"
              onClick={() => {
                // This would typically open a upgrade modal or redirect to payment page
                alert('Upgrade functionality would be implemented here!');
              }}
            >
              ⬆️ Upgrade to Premium
            </button>
            
            <p className="premium-notice__contact">
              Contact support for more information about upgrading your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
