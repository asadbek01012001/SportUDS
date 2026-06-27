import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Dropdown, Tooltip } from 'antd';
import { UserOutlined, LockOutlined, TrophyOutlined, GlobalOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';
import { homePathForRole } from '../constants/roles';
import InfoModal from '../components/InfoModal';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t, lang, changeLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const onFinish = async ({ email, password }) => {
    setLoading(true);
    setError('');
    try {
      const userData = await login(email, password);
      // Rolni tizimning o'zi aniqlaydi va mos sahifaga yo'naltiradi
      navigate(homePathForRole(userData.role));
    } catch (err) {
      setError(err.response?.data?.error || t('auth.wrongCredentials'));
    } finally {
      setLoading(false);
    }
  };

  const langMenu = {
    selectedKeys: [lang],
    items: [
      { key: 'uz', label: "O'zbek" },
      { key: 'ru', label: 'Русский' },
      { key: 'en', label: 'English' },
    ],
    onClick: ({ key }) => changeLang(key),
  };

  const cardBg = isDark
    ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
    : { background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 16px 48px rgba(99,102,241,0.12)' };

  const ctrlStyle = {
    width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
    background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: isDark ? '#94a3b8' : '#64748b',
  };

  const gradient = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
  const glow = 'rgba(99,102,241,0.35)';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      {/* Glow orbs */}
      <div style={{ position: 'absolute', top: '-15%', right: '-5%', width: 500, height: 500, background: `radial-gradient(circle, rgba(99,102,241,${isDark ? '0.22' : '0.1'}) 0%, transparent 65%)`, borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: 600, height: 600, background: `radial-gradient(circle, rgba(139,92,246,${isDark ? '0.14' : '0.07'}) 0%, transparent 65%)`, borderRadius: '50%', pointerEvents: 'none' }} />

      {/* Top-right controls */}
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
        <Tooltip title={lang === 'ru' ? 'Справка' : lang === 'en' ? 'Help' : 'Qo\'llanma'}>
          <div style={ctrlStyle} onClick={() => setInfoOpen(true)}>?</div>
        </Tooltip>
        <Dropdown menu={langMenu} placement="bottomRight" trigger={['click']}>
          <div style={{ ...ctrlStyle, width: 'auto', padding: '0 8px', gap: 4, fontSize: 12, fontWeight: 600 }}>
            <GlobalOutlined style={{ fontSize: 12 }} />
            <span style={{ marginLeft: 2 }}>{lang.toUpperCase()}</span>
          </div>
        </Dropdown>
        <Tooltip title={isDark ? t('theme.light') : t('theme.dark')}>
          <div style={ctrlStyle} onClick={toggleTheme}>
            {isDark ? <SunOutlined /> : <MoonOutlined />}
          </div>
        </Tooltip>
      </div>

      {/* LOGIN FORM */}
      <div style={{ width: 420, backdropFilter: 'blur(24px)', borderRadius: 18, padding: '40px 36px', position: 'relative', ...cardBg }}>
        {/* Top accent */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: gradient, borderRadius: '18px 18px 0 0',
        }} />

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 58, height: 58, background: gradient,
            borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14, boxShadow: `0 8px 24px ${glow}`,
          }}>
            <TrophyOutlined style={{ fontSize: 26, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0, fontWeight: 700 }}>SportUDS</Title>
          <Text style={{ opacity: 0.45, fontSize: 14 }}>
            {lang === 'ru' ? 'Войдите в систему'
              : lang === 'en' ? 'Sign in to your account'
                : 'Tizimga kiring'}
          </Text>
        </div>

        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 18, borderRadius: 8, fontSize: 13 }} />
        )}

        <Form name="login" onFinish={onFinish} layout="vertical">
          <Form.Item name="email" label={t('auth.email')} rules={[{ required: true }, { type: 'email' }]}>
            <Input prefix={<UserOutlined style={{ opacity: 0.35 }} />} placeholder="email@example.com" style={{ borderRadius: 8, height: 42 }} />
          </Form.Item>
          <Form.Item name="password" label={t('auth.password')} rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined style={{ opacity: 0.35 }} />} placeholder="••••••••" style={{ borderRadius: 8, height: 42 }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 6 }}>
            <Button
              type="primary"
              htmlType="submit"
              block loading={loading}
              style={{ height: 42, borderRadius: 10, fontWeight: 600, background: gradient, border: 'none', boxShadow: `0 4px 14px ${glow}` }}
            >
              {t('auth.signIn')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Text style={{ opacity: 0.25, fontSize: 12 }}>© 2025 SportUDS · UDS & AI</Text>
        </div>
      </div>

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
