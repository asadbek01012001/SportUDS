import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin, theme } from 'antd';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import MainLayout from './components/layout/MainLayout';
import NazoratchiLayout from './components/layout/NazoratchiLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Athletes from './pages/Athletes';
import AthleteDetail from './pages/AthleteDetail';
import Sessions from './pages/Sessions';
import SessionDetail from './pages/SessionDetail';
import NewSession from './pages/NewSession';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import AuditLog from './pages/admin/AuditLog';
import Protocols from './pages/admin/Protocols';
import Sports from './pages/admin/Sports';
import NazoratchiDashboard from './pages/nazoratchi/NazoratchiDashboard';
import Trinajorlar from './pages/trener/Trinajorlar';

const PrivateRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const NazoratchiRoute = ({ children }) => {
  const { user, module, loading } = useAuth();
  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!user) return <Navigate to="/login" replace />;
  if (module !== 'nazoratchi') return <Navigate to="/" replace />;
  return children;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />

    {/* Nazoratchi module routes */}
    <Route path="/nazoratchi" element={<NazoratchiRoute><NazoratchiLayout /></NazoratchiRoute>}>
      <Route index element={<NazoratchiDashboard />} />
      <Route path="monitoring" element={<NazoratchiDashboard />} />
    </Route>

    {/* Trener module routes */}
    <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
      <Route index element={<Dashboard />} />
      <Route path="athletes" element={<Athletes />} />
      <Route path="athletes/:id" element={<AthleteDetail />} />
      <Route path="sessions" element={<Sessions />} />
      <Route path="sessions/new" element={<NewSession />} />
      <Route path="sessions/:id" element={<SessionDetail />} />
      <Route path="analytics" element={<Analytics />} />
      <Route path="trinajorlar" element={<Trinajorlar />} />
      <Route path="reports" element={<Reports />} />
      <Route path="admin" element={<PrivateRoute roles={['admin']}><AdminDashboard /></PrivateRoute>} />
      <Route path="admin/users" element={<PrivateRoute roles={['admin']}><UserManagement /></PrivateRoute>} />
      <Route path="admin/sports" element={<PrivateRoute roles={['admin']}><Sports /></PrivateRoute>} />
      <Route path="admin/audit" element={<PrivateRoute roles={['admin']}><AuditLog /></PrivateRoute>} />
      <Route path="admin/protocols" element={<PrivateRoute roles={['admin', 'researcher']}><Protocols /></PrivateRoute>} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

function ThemedApp() {
  const { theme: appTheme } = useTheme();
  const isDark = appTheme === 'dark';

  const baseTokens = {
    fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    colorPrimary: '#6366f1',
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    fontSize: 14,
    fontSizeSM: 13,
    fontSizeLG: 16,
    controlHeight: 34,
    controlHeightLG: 40,
    controlHeightSM: 26,
  };

  const darkTokens = {
    ...baseTokens,
    colorBgContainer: '#0d1424',
    colorBgLayout: '#060c1a',
    colorBgElevated: '#0f1729',
    colorBgSpotlight: '#0f1729',
    colorBorder: 'rgba(255,255,255,0.08)',
    colorBorderSecondary: 'rgba(255,255,255,0.05)',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorTextTertiary: '#64748b',
    colorSuccess: '#22c55e',
    colorWarning: '#facc15',
    colorError: '#f87171',
    colorInfo: '#38bdf8',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  };

  const lightTokens = {
    ...baseTokens,
    colorBgLayout: '#f0f4f8',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: '#e2e8f0',
    colorText: '#1e293b',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#94a3b8',
    colorSuccess: '#16a34a',
    colorWarning: '#ca8a04',
    colorError: '#dc2626',
    colorInfo: '#0284c7',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  };

  const darkComponents = {
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(99,102,241,0.2)',
      itemBorderRadius: 10,
      itemMarginInline: 8,
    },
    Card: {
      colorBgContainer: 'rgba(255,255,255,0.04)',
      headerBg: 'transparent',
    },
    Table: {
      colorBgContainer: '#0d1424',
      headerBg: 'rgba(255,255,255,0.05)',
      rowHoverBg: 'rgba(255,255,255,0.03)',
      borderColor: 'rgba(255,255,255,0.06)',
      headerSortActiveBg: 'rgba(255,255,255,0.06)',
    },
    Modal: {
      contentBg: '#0f1729',
      headerBg: '#0f1729',
    },
    Drawer: {
      colorBgElevated: '#0f1729',
    },
    Button: {
      defaultBg: 'rgba(255,255,255,0.06)',
      defaultBorderColor: 'rgba(255,255,255,0.1)',
    },
    Input: {
      colorBgContainer: 'rgba(255,255,255,0.05)',
    },
    Select: {
      colorBgContainer: 'rgba(255,255,255,0.05)',
      colorBgElevated: '#0f1729',
    },
    DatePicker: {
      colorBgContainer: 'rgba(255,255,255,0.05)',
      colorBgElevated: '#0f1729',
    },
    InputNumber: {
      colorBgContainer: 'rgba(255,255,255,0.05)',
    },
  };

  const lightComponents = {
    Menu: {
      itemBorderRadius: 10,
      itemMarginInline: 8,
      itemSelectedBg: 'rgba(99,102,241,0.08)',
      itemSelectedColor: '#6366f1',
      itemHoverBg: 'rgba(99,102,241,0.05)',
    },
    Card: { headerBg: 'transparent' },
    Table: {},
    Button: {},
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: isDark ? darkTokens : lightTokens,
        components: isDark ? darkComponents : lightComponents,
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <LangProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </LangProvider>
  );
}
