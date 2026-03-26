import { createContext, useCallback, useContext, useState } from 'react';
import * as api from '../lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState(null);
  const [profileImage, setProfileImage] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const logout = useCallback(async () => {
    if (!demoMode) await api.apiLogout();
    setDemoMode(false);
    setLoggedIn(false);
    setMe(null);
  }, [demoMode]);

  const value = {
    loggedIn, setLoggedIn,
    me, setMe,
    profileImage, setProfileImage,
    needsSetup, setNeedsSetup,
    demoMode, setDemoMode,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
