import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Dropdown, Tooltip } from 'antd';
import { UserOutlined, LockOutlined, TrophyOutlined, GlobalOutlined, SunOutlined, MoonOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';
import InfoModal from '../components/InfoModal';

const { Title, Text } = Typography;

const MODULE_CONFIG = {
  trener: {
    icon: '🏃',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    glow: 'rgba(99,102,241,0.35)',
    titleUz: 'Trener moduli',
    titleRu: 'Модуль тренера',
    titleEn: 'Coach module',
    descUz: 'Sportchilar, test sessiyalari va analitika',
    descRu: 'Спортсмены, сессии и аналитика',
    descEn: 'Athletes, test sessions and analytics',
  },
  nazoratchi: {
    icon: '👁️',
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
    glow: 'rgba(14,165,233,0.35)',
    titleUz: 'Nazoratchi moduli',
    titleRu: 'Модуль контролёра',
    titleEn: 'Supervisor module',
    descUz: 'Tizim monitoringi va jihozlar nazorati',
    descRu: 'Мониторинг системы и контроль оборудования',
    descEn: 'System monitoring and equipment control',
  },
};

export default function Login() {
  const [step, setStep] = useState('select'); // 'select' | 'login'
  const [selectedModule, setSelectedModule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const { login, setModule } = useAuth();
  const navigate = useNavigate();
  const { t, lang, changeLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const onSelectModule = (mod) => {
    setSelectedModule(mod);
    setStep('login');
  };

  const onFinish = async ({ email, password }) => {
    setLoading(true);
    setError('');
    try {
      setModule(selectedModule);
      await login(email, password);
      navigate(selectedModule === 'nazoratchi' ? '/nazoratchi' : '/');
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

  const cfg = selectedModule ? MODULE_CONFIG[selectedModule] : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      {/* Glow orbs */}
      <div style={{ position: 'absolute', top: '-15%', right: '-5%', width: 500, height: 500, background: `radial-gradient(circle, rgba(99,102,241,${isDark ? '0.22' : '0.1'}) 0%, transparent 65%)`, borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: 600, height: 600, background: `radial-gradient(circle, rgba(14,165,233,${isDark ? '0.14' : '0.07'}) 0%, transparent 65%)`, borderRadius: '50%', pointerEvents: 'none' }} />

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

      {/* MODULE SELECTION STEP */}
      {step === 'select' && (
        <div style={{ width: 520, position: 'relative' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              width: 58, height: 58, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 14, boxShadow: '0 8px 24px rgba(99,102,241,0.45)',
            }}>
              <TrophyOutlined style={{ fontSize: 26, color: '#fff' }} />
            </div>
            <Title level={3} style={{ margin: 0, fontWeight: 700 }}>SportUDS</Title>
            <Text style={{ opacity: 0.45, fontSize: 14 }}>
              {lang === 'ru' ? 'Выберите модуль для входа'
                : lang === 'en' ? 'Select a module to sign in'
                  : 'Kirish uchun modulni tanlang'}
            </Text>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {Object.entries(MODULE_CONFIG).map(([key, cfg]) => (
              <div
                key={key}
                onClick={() => onSelectModule(key)}
                style={{
                  backdropFilter: 'blur(24px)', borderRadius: 18, padding: '28px 24px',
                  cursor: 'pointer', transition: 'all 0.25s',
                  ...cardBg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                  position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = `0 24px 60px ${cfg.glow}`;
                  e.currentTarget.style.borderColor = cfg.color + '60';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = isDark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 16px 48px rgba(99,102,241,0.12)';
                  e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
                }}
              >
                {/* Top glow accent */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: cfg.gradient, borderRadius: '18px 18px 0 0',
                }} />

                <div style={{
                  width: 64, height: 64, borderRadius: 18,
                  background: isDark ? `${cfg.color}20` : `${cfg.color}12`,
                  border: `1.5px solid ${cfg.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28,
                }}>
                  {cfg.icon}
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: cfg.color }}>
                    {lang === 'ru' ? cfg.titleRu : lang === 'en' ? cfg.titleEn : cfg.titleUz}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.5, lineHeight: 1.5 }}>
                    {lang === 'ru' ? cfg.descRu : lang === 'en' ? cfg.descEn : cfg.descUz}
                  </div>
                </div>

                <div style={{
                  width: '100%', padding: '8px 0', borderRadius: 10, textAlign: 'center',
                  background: cfg.gradient, color: '#fff', fontSize: 13, fontWeight: 600,
                  boxShadow: `0 4px 14px ${cfg.glow}`,
                }}>
                  {lang === 'ru' ? 'Выбрать' : lang === 'en' ? 'Select' : 'Tanlash'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Text style={{ opacity: 0.25, fontSize: 12 }}>© 2025 SportUDS · UDS & AI</Text>
          </div>
        </div>
      )}

      {/* LOGIN FORM STEP */}
      {step === 'login' && cfg && (
        <div style={{ width: 420, backdropFilter: 'blur(24px)', borderRadius: 18, padding: '40px 36px', position: 'relative', ...cardBg }}>
          {/* Top accent */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: cfg.gradient, borderRadius: '18px 18px 0 0',
          }} />

          {/* Back button */}
          <button
            onClick={() => { setStep('select'); setError(''); }}
            style={{
              position: 'absolute', top: 16, left: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              color: isDark ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
            }}
          >
            <ArrowLeftOutlined /> {lang === 'ru' ? 'Назад' : lang === 'en' ? 'Back' : 'Orqaga'}
          </button>

          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 58, height: 58, background: cfg.gradient,
              borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 14, boxShadow: `0 8px 24px ${cfg.glow}`, fontSize: 26,
            }}>
              {cfg.icon}
            </div>
            <Title level={3} style={{ margin: 0, fontWeight: 700 }}>SportUDS</Title>
            <div style={{ marginTop: 6 }}>
              <span style={{
                display: 'inline-block', padding: '3px 12px', borderRadius: 20,
                background: isDark ? `${cfg.color}20` : `${cfg.color}12`,
                border: `1px solid ${cfg.color}40`,
                color: cfg.color, fontSize: 12, fontWeight: 600,
              }}>
                {lang === 'ru' ? cfg.titleRu : lang === 'en' ? cfg.titleEn : cfg.titleUz}
              </span>
            </div>
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
                style={{ height: 42, borderRadius: 10, fontWeight: 600, background: cfg.gradient, border: 'none', boxShadow: `0 4px 14px ${cfg.glow}` }}
              >
                {t('auth.signIn')}
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Text style={{ opacity: 0.25, fontSize: 12 }}>© 2025 SportUDS · UDS & AI</Text>
          </div>
        </div>
      )}

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
