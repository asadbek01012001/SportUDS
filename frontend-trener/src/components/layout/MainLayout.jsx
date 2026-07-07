import { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Badge, Tooltip } from 'antd';
import {
  DashboardOutlined, TeamOutlined, ExperimentOutlined, BarChartOutlined,
  SettingOutlined, UserOutlined, LogoutOutlined, SafetyOutlined,
  TrophyOutlined, FileTextOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  BellOutlined, GlobalOutlined, SunOutlined, MoonOutlined, QuestionCircleOutlined,
  EnvironmentOutlined, HistoryOutlined, IdcardOutlined, UsergroupAddOutlined,
  ApiOutlined, CloudServerOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isStaff, isAthlete, isAdmin, isAdminLevel, isSuperAdmin } from '../../constants/roles';
import { useLang } from '../../context/LangContext';
import { useTheme } from '../../context/ThemeContext';
import InfoModal from '../InfoModal';

const { Sider, Content } = Layout;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, changeLang } = useLang();
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === 'dark';

  const L = (uz, ru, en) => (lang === 'ru' ? ru : lang === 'en' ? en : uz);

  // Sportchi (athlete) menyusi
  const athleteMenu = [
    { key: '/me', icon: <IdcardOutlined />, label: L('Mening kabinetim', 'Мой кабинет', 'My cabinet') },
    { key: '/me/history', icon: <HistoryOutlined />, label: L('Natijalarim', 'Мои результаты', 'My results') },
  ];

  // Xodim (Trener) menyusi
  const staffMenu = [
    { key: '/', icon: <DashboardOutlined />, label: t('nav.dashboard') },
    { key: '/teams', icon: <UsergroupAddOutlined />, label: t('nav.teams') },
    { key: '/athletes', icon: <TeamOutlined />, label: t('nav.athletes') },
    { key: '/sessions', icon: <ExperimentOutlined />, label: t('nav.sessions') },
    { key: '/analytics', icon: <BarChartOutlined />, label: t('nav.analytics') },
    { key: '/trinajorlar', icon: <EnvironmentOutlined />, label: 'Trinajorlar' },
    { key: '/reports', icon: <FileTextOutlined />, label: t('nav.reports') },
    // Admin paneli — nested emas, bitta chiziq bilan ajratilgan flat itemlar
    ...(isAdminLevel(user?.role) ? [
      { type: 'divider' },
      { key: '/admin', icon: <SafetyOutlined />, label: t('nav.adminHome') },
      { key: '/admin/users', icon: <UserOutlined />, label: t('nav.users') },
      { key: '/admin/sports', icon: <TrophyOutlined />, label: t('nav.sports') },
      { key: '/admin/devices', icon: <ApiOutlined />, label: L('Qurilmalar', 'Устройства', 'Devices') },
      { key: '/admin/firmwares', icon: <CloudServerOutlined />, label: L('Proshivkalar', 'Прошивки', 'Firmwares') },
      { key: '/admin/protocols', icon: <SettingOutlined />, label: t('nav.protocols') },
      // Audit jurnali — faqat Super Admin
      ...(isSuperAdmin(user?.role) ? [{ key: '/admin/audit', icon: <FileTextOutlined />, label: t('nav.audit') }] : []),
    ] : []),
  ];

  const menuItems = isAthlete(user?.role) ? athleteMenu : staffMenu;

  // More specific routes first to avoid '/admin' matching '/admin/users'
  const selectedKey = (() => {
    const p = location.pathname;
    if (isAthlete(user?.role)) {
      return p.startsWith('/me/history') ? '/me/history' : '/me';
    }
    if (p === '/') return '/';
    const keys = [
      '/admin/users', '/admin/sports', '/admin/devices', '/admin/firmwares', '/admin/protocols', '/admin/audit',
      '/teams', '/athletes', '/sessions', '/analytics', '/trinajorlar', '/reports', '/admin',
    ];
    return keys.find(k => p === k || p.startsWith(k + '/')) || '/';
  })();

  const roleLabel = isSuperAdmin(user?.role)
    ? L('Super Admin', 'Супер админ', 'Super Admin')
    : isAdmin(user?.role)
      ? L('Admin', 'Админ', 'Admin')
      : isAthlete(user?.role)
        ? L('Sportchi', 'Спортсмен', 'Athlete')
        : isStaff(user?.role)
          ? L('Trener', 'Тренер', 'Coach')
          : '';

  const langItems = {
    selectedKeys: [lang],
    items: [
      { key: 'uz', label: "O'zbek" },
      { key: 'ru', label: 'Русский' },
      { key: 'en', label: 'English' },
    ],
    onClick: ({ key }) => changeLang(key),
  };

  const userMenu = {
    items: [
      {
        key: 'info',
        label: (
          <div style={{ padding: '4px 0', pointerEvents: 'none' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.full_name}</div>
            <div style={{ fontSize: 12, opacity: 0.4 }}>{user?.email}</div>
            {roleLabel && (
              <div style={{ fontSize: 11, marginTop: 4, color: '#6366f1', fontWeight: 600 }}>{roleLabel}</div>
            )}
          </div>
        ),
      },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: t('auth.logout'), danger: true },
    ],
    onClick: ({ key }) => { if (key === 'logout') logout(); },
  };

  const siderBorder = isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0';
  const headerBg = isDark ? 'rgba(6,12,26,0.88)' : 'rgba(255,255,255,0.92)';

  const iconBtn = {
    width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: isDark ? '#94a3b8' : '#64748b',
    transition: 'all 0.2s', flexShrink: 0,
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={230}
        collapsedWidth={60}
        theme={isDark ? 'dark' : 'light'}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0,
          zIndex: 100, overflow: 'auto',
          borderRight: `1px solid ${siderBorder}`,
          boxShadow: isDark ? 'none' : '2px 0 12px rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo */}
        <div style={{
          height: 56,
          display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 14px' : '0 16px',
          gap: 10,
          borderBottom: `1px solid ${siderBorder}`,
          cursor: 'pointer',
        }} onClick={() => navigate('/')}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 10px rgba(99,102,241,0.4)',
          }}>
            <TrophyOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>SportUDS</div>
              <div style={{ fontSize: 10, opacity: 0.4 }}>v2.0</div>
            </div>
          )}
        </div>

        {/* Menu */}
        <div style={{ padding: '8px 6px' }}>
          <Menu
            theme={isDark ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ border: 'none', background: 'transparent', fontSize: 14 }}
          />
        </div>
      </Sider>

      <Layout style={{
        marginLeft: collapsed ? 60 : 230,
        transition: 'margin-left 0.2s',
        background: 'transparent',
        minHeight: '100vh',
      }}>
        {/* Header */}
        <div style={{
          height: 56,
          position: 'sticky', top: 0, zIndex: 99,
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: headerBg,
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${siderBorder}`,
        }}>
          <div
            style={{ cursor: 'pointer', padding: '4px', borderRadius: 6, fontSize: 16, opacity: 0.5, transition: 'opacity 0.2s' }}
            onClick={() => setCollapsed(!collapsed)}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>

          <Space size={6}>
            {/* Info button */}
            <Tooltip title={lang === 'ru' ? 'Справка' : lang === 'en' ? 'Help' : 'Qo\'llanma'}>
              <div style={iconBtn} onClick={() => setInfoOpen(true)}>
                <QuestionCircleOutlined />
              </div>
            </Tooltip>

            {/* Language selector */}
            <Dropdown menu={langItems} placement="bottomRight" trigger={['click']}>
              <div style={{ ...iconBtn, width: 'auto', padding: '0 8px', gap: 4, fontSize: 12, fontWeight: 600 }}>
                <GlobalOutlined style={{ fontSize: 13 }} />
                <span style={{ marginLeft: 2 }}>{lang.toUpperCase()}</span>
              </div>
            </Dropdown>

            {/* Theme toggle */}
            <Tooltip title={isDark ? t('theme.light') : t('theme.dark')}>
              <div style={iconBtn} onClick={toggleTheme}>
                {isDark ? <SunOutlined /> : <MoonOutlined />}
              </div>
            </Tooltip>

            {/* User dropdown */}
            <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '4px 8px 4px 4px', borderRadius: 8,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${siderBorder}`,
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}
              >
                <Badge dot color="#22c55e" offset={[-2, 2]}>
                  <Avatar size={26} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: 12 }}>
                    {user?.full_name?.[0]}
                  </Avatar>
                </Badge>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{user?.full_name?.split(' ')[0]}</span>
              </div>
            </Dropdown>
          </Space>
        </div>

        <Content style={{ padding: 20, minHeight: 'calc(100vh - 56px)' }}>
          <Outlet />
        </Content>
      </Layout>

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </Layout>
  );
}
