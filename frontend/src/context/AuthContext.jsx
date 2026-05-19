import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [module, setModuleState] = useState('trener');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    const storedModule = localStorage.getItem('module') || 'trener';
    if (token && stored) {
      setUser(JSON.parse(stored));
    }
    setModuleState(storedModule);
    setLoading(false);
  }, []);

  const setModule = (mod) => {
    setModuleState(mod);
    localStorage.setItem('module', mod);
  };

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user: userData } = res.data.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('module');
    setUser(null);
    setModuleState('trener');
  };

  return (
    <AuthContext.Provider value={{ user, module, setModule, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
