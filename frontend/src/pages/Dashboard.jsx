import { useEffect, useState } from 'react';
import { Row, Col, Typography, Space, Tag, Spin } from 'antd';
import {
  TeamOutlined, ExperimentOutlined, TrophyOutlined, UserOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { adminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';

const { Title, Text } = Typography;

const StatCard = ({ title, value, icon, color, change }) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
    transition: 'border-color 0.2s, transform 0.2s',
    cursor: 'default',
  }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}50`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
  >
    <div style={{
      position: 'absolute', top: -30, right: -30,
      width: 120, height: 120,
      background: `radial-gradient(circle, ${color}20 0%, transparent 65%)`,
      pointerEvents: 'none',
    }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </Text>
        <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginTop: 8 }}>
          {value}
        </div>
        {change !== undefined && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            {change >= 0
              ? <ArrowUpOutlined style={{ color: 'var(--green)', fontSize: 12 }} />
              : <ArrowDownOutlined style={{ color: 'var(--red)', fontSize: 12 }} />}
            <Text style={{ color: change >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 13, fontWeight: 600 }}>
              {Math.abs(change)}%
            </Text>
          </div>
        )}
      </div>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, color, flexShrink: 0,
      }}>
        {icon}
      </div>
    </div>
  </div>
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--dropdown-bg)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 14,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const { theme } = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role === 'admin') {
      adminAPI.getStats()
        .then(res => setStats(res.data.data))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
      <Spin size="large" />
    </div>
  );

  const chartData = (stats?.monthly_sessions || []).map(d => ({
    month: d.month?.slice(5) || d.month,
    [t('dashboard.sessions')]: parseInt(d.count),
  }));

  const axisColor = theme === 'dark' ? '#475569' : '#94a3b8';
  const tickColor = theme === 'dark' ? '#64748b' : '#94a3b8';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  const actionKey = {
    LOGIN: t('admin.actions.LOGIN'),
    CREATE_USER: t('admin.actions.CREATE_USER'),
    CREATE_ATHLETE: t('admin.actions.CREATE_ATHLETE'),
    CREATE_SESSION: t('admin.actions.CREATE_SESSION'),
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
          {user?.role === 'admin' ? t('dashboard.title') : `${t('dashboard.welcome')}, ${user?.full_name?.split(' ')[0]}!`}
        </Title>
        <Text style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
      </div>

      {user?.role === 'admin' && stats ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} sm={12} xl={6}>
              <StatCard title={t('dashboard.users')} value={stats.stats.users} icon={<UserOutlined />} color="#6366f1" change={12} />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <StatCard title={t('dashboard.athletes')} value={stats.stats.athletes} icon={<TeamOutlined />} color="#22c55e" change={8} />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <StatCard title={t('dashboard.sessions')} value={stats.stats.sessions} icon={<ExperimentOutlined />} color="#f59e0b" change={-3} />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <StatCard title={t('dashboard.sportTypes')} value={stats.stats.sports} icon={<TrophyOutlined />} color="#38bdf8" />
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={15}>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 24,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <Title level={5} style={{ margin: 0 }}>{t('dashboard.monthlyStats')}</Title>
                    <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('dashboard.thisMonth')}</Text>
                  </div>
                  <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px' }}>12 {t('common.page')}</Tag>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" stroke={axisColor} tick={{ fill: tickColor, fontSize: 13 }} />
                    <YAxis stroke={axisColor} tick={{ fill: tickColor, fontSize: 13 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey={t('dashboard.sessions')}
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fill="url(#grad1)"
                      dot={{ fill: '#6366f1', r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: '#8b5cf6' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Col>

            <Col xs={24} lg={9}>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 24,
                height: '100%',
              }}>
                <Title level={5} style={{ margin: '0 0 16px' }}>{t('dashboard.recentActivity')}</Title>
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  {(stats.recent_activity || []).slice(0, 8).map((item, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'var(--bg-card-hover)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: item.action === 'LOGIN' ? 'var(--green)' : '#6366f1',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.full_name || '—'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {actionKey[item.action] || item.action}
                        </div>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                  {!(stats.recent_activity?.length) && (
                    <Text style={{ color: 'var(--text-muted)' }}>{t('dashboard.noActivity')}</Text>
                  )}
                </Space>
              </div>
            </Col>
          </Row>
        </>
      ) : (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '60px 40px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400, height: 400,
            background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            width: 80, height: 80, borderRadius: 22,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 12px 32px rgba(99,102,241,0.45)',
          }}>
            <TrophyOutlined style={{ fontSize: 38, color: '#fff' }} />
          </div>
          <Title level={3} style={{ marginBottom: 12 }}>
            {t('dashboard.welcome')}, {user?.full_name}!
          </Title>
          <Text style={{ color: 'var(--text-muted)', fontSize: 16, display: 'block', marginBottom: 28 }}>
            {t('nav.monitoring')}
          </Text>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: t('nav.athletes'), path: '/athletes', color: '#22c55e' },
              { label: t('nav.sessions'), path: '/sessions', color: '#6366f1' },
              { label: t('nav.analytics'), path: '/analytics', color: '#f59e0b' },
            ].map(({ label, path, color }) => (
              <a key={path} href={path} style={{
                padding: '10px 24px', borderRadius: 10,
                background: `${color}18`,
                border: `1px solid ${color}30`,
                color, fontWeight: 600, fontSize: 15,
                textDecoration: 'none',
              }}>
                {label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
