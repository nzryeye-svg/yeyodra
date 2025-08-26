import { useEffect, useState } from 'react';
import React from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import WelcomePopup from './WelcomePopup';
import { useAuth } from '../contexts/AuthContext';
import './HWIDAuth.scss';

const HWIDAuth = ({ children }) => {
  const { updateAuthData } = useAuth();
  const [authStatus, setAuthStatus] = useState('checking'); // checking, authorized, unauthorized
  const [hwid, setHwid] = useState('');
  const [message, setMessage] = useState('');
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(Date.now());
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);

  useEffect(() => {
    checkAuthorization();
  }, []);

  // Force re-render ketika licenseInfo berubah
  useEffect(() => {
    console.log('🔄 License Info changed:', licenseInfo);
  }, [licenseInfo]);

  const checkAuthorization = async (forceRefresh = false) => {
    setAuthStatus('checking');
    setIsRetrying(false);
    setLastCheckTime(Date.now());
    
    try {
      console.log('Checking HWID authorization...');
      const response = await invoke(forceRefresh ? 'refresh_hwid_status' : 'get_hwid_status');
      
      console.log('HWID Response:', response);
      console.log('Full response structure:', JSON.stringify(response, null, 2));
      
      setHwid(response.hwid);
      setMessage(response.message);
      setLicenseInfo(response.license_info);
      
      if (response.is_authorized) {
        setAuthStatus('authorized');
        setShowWelcomePopup(true); // Show welcome popup
        console.log('✅ HWID Authorized:', response.hwid);
        console.log('✅ License Info:', response.license_info);
        console.log('✅ Customer Name:', response.license_info?.customer_name);
        console.log('✅ License Info type:', typeof response.license_info);
        console.log('✅ Customer Name type:', typeof response.license_info?.customer_name);
        
        // Update auth context
        updateAuthData({
          customerName: response.license_info?.customer_name,
          licenseInfo: response.license_info
        });
      } else {
        setAuthStatus('unauthorized');
        console.log('❌ HWID Not Authorized:', response.hwid);
      }
    } catch (error) {
      console.error('❌ HWID Auth Error:', error);
      setAuthStatus('unauthorized');
      setMessage('Connection error. Please check your internet connection.');
    }
  };

  const copyHwid = () => {
    navigator.clipboard.writeText(hwid);
    // Show temporary feedback
    const originalMessage = message;
    setMessage('HWID copied to clipboard!');
    setTimeout(() => setMessage(originalMessage), 2000);
  };

  const retryAuth = async () => {
    setIsRetrying(true);
    await checkAuthorization(true); // Force refresh
  };

  if (authStatus === 'checking') {
    return (
      <div className="hwid-auth-screen">
        <div className="hwid-auth-container">
          <div className="loading-section">
            <div className="loading-spinner"></div>
            <h2>🔐 Verifying License</h2>
            <p>Please wait while we verify your device authorization...</p>
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthorized') {
    return (
      <div className="hwid-auth-screen">
        <div className="hwid-auth-container">
          <div className="unauthorized-section">
            <div className="icon-section">
              <div className="lock-icon">🚫</div>
            </div>
            
            <h2>Access Denied</h2>
            <p className="error-message">{message}</p>
            
            <div className="hwid-section">
              <h3>Your Device ID</h3>
              <div className="hwid-display">
                <code className="hwid-code">{hwid}</code>
                <button onClick={copyHwid} className="copy-btn" title="Copy HWID">
                  📋
                </button>
              </div>
            </div>

            <div className="action-section" style={{marginBottom: '15px'}}>
              <button 
                onClick={retryAuth} 
                className={`refresh-button ${isRetrying ? 'loading' : ''}`}
                disabled={isRetrying}
                style={{
                  background: 'linear-gradient(135deg, #ff6b35, #f7931e)',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: isRetrying ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  maxWidth: '200px',
                  margin: '15px auto',
                  boxShadow: '0 4px 15px rgba(255, 107, 53, 0.3)',
                  transition: 'all 0.3s ease',
                  transform: isRetrying ? 'scale(0.95)' : 'scale(1)',
                  position: 'static'
                }}
              >
                {isRetrying ? (
                  <>
                    <div className="btn-spinner"></div>
                    Checking...
                  </>
                ) : (
                  <>
                    🔄 Check Again
                  </>
                )}
              </button>np
              
              <div className="manual-check-info" style={{
                textAlign: 'center',
                marginTop: '10px',
                color: '#b0b0b0',
                fontSize: '12px'
              }}>
                <div style={{marginBottom: '4px', fontWeight: '500'}}>
                  ⏰ Last check: {new Date(lastCheckTime).toLocaleTimeString()}
                </div>
                <div style={{opacity: '0.8'}}>
                  Click "Check Again" after admin adds your HWID
                </div>
              </div>
            </div>

            <div className="compact-instructions" style={{marginTop: '15px'}}>
              <h3 style={{fontSize: '16px', marginBottom: '10px', color: '#ffffff'}}>🔓 How to get access:</h3>
              <div style={{fontSize: '13px', lineHeight: '1.5', color: '#e0e0e0', textAlign: 'left'}}>
                1. Copy Device ID above<br/>
                2. Contact admin with Device ID<br/>
                3. Complete payment process<br/>
                4. Click "Check Again" after activation
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authorized - show main app with welcome popup
  console.log('📊 HWIDAuth render - licenseInfo:', licenseInfo);
  console.log('📊 HWIDAuth render - customerName:', licenseInfo?.customer_name);
  
  return (
    <div className="hwid-authorized">
      {showWelcomePopup && (
        <WelcomePopup 
          customerName={licenseInfo?.customer_name}
          onClose={() => setShowWelcomePopup(false)}
        />
      )}
      {children}
    </div>
  );
};

export default HWIDAuth;
