import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [customerName, setCustomerName] = useState(null);
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const updateAuthData = (authData) => {
    console.log('🔄 AuthContext: Updating auth data:', authData);
    console.log('🔄 AuthContext: Customer name will be set to:', authData.customerName);
    setCustomerName(authData.customerName);
    setLicenseInfo(authData.licenseInfo);
    setIsAuthenticated(!!authData.customerName);
  };
  
  // Debug log ketika values berubah
  useEffect(() => {
    console.log('🎯 AuthContext: Customer name changed to:', customerName);
  }, [customerName]);

  const value = {
    customerName,
    licenseInfo,
    isAuthenticated,
    updateAuthData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
