import { useEffect, useState } from 'react';
import { Row, Col, Typography, Tag, Space, Spin } from 'antd';
import { TeamOutlined, ExperimentOutlined, TrophyOutlined, UserOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { adminAPI } from '../../services/api';
import { useLang } from '../../context/LangContext';
import { useTheme } from '../../context/ThemeContext';

const { Title, Text } = Typography;
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#f87171', '#38bdf8'];

const StatCard = ({ title, value, icon, color, change }) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14, padding: '20px', position: 'relative', overflow: 'hidden',
    transition: 'border-color 0.2s, transform 0.2s',
  }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}50`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
  >
    <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, background: `radial-gradient(circle, ${color}25 0%, transparent 65%)`, pointerEvents: 'none' }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}>{value}</div>
        {change !== undefined && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            {change >= 0 ? <ArrowUpOutlined style={{ color: 'var(--green)', fontSize: 11 }} /> : <ArrowDownOutlined style={{ color: 'var(--red)', fontSize: 11 }} />}
            <Text style={{ color: change >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 600 }}>{Math.abs(change)}%</Text>
          </div>
        )}
      </div>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color, flexShrink: 0 }}>
        {icon}
      </div>
    </div>
  </div>
);

const ChartBox = ({ children, title, subtitle, extra }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, height: '100%' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div>
        <Text style={{ fontWeight: 600, fontSize: 14 }}>{title}</Text>
        {subtitle && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {extra}
    </div>
    {children}
  </div>
);

export default function AdminDashboard() {
  const { t } = useLang();
  const { theme } = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const isDark = theme === 'dark';
  const axisColor = isDark ? '#475569' : '#94a3b8';
  const tickColor = isDark ? '#64748b' : '#94a3b8';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tooltipStyle = { background: isDark ? '#0f1729' : '#fff', border: `1px solid var(--border)`, borderRadius: 8, fontSize: 13 };

  useEffect(() => {
    adminAPI.getStats()
      .then(res => setStats(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}><Spin size="large" /></div>;

  const areaData = (stats?.monthly_sessions || []).map(d => ({
    month: d.month?.slice(5) || d.month,
    [t('dashboard.sessions')]: parseInt(d.count) || 0,
  }));

  // Simulated context distribution for bar chart
  const contextData = [
    { name: 'Pre-load', value: 12, color: '#6366f1' },
    { name: 'Post-load', value: 8, color: '#22c55e' },
    { name: 'Diagnostic', value: 15, color: '#f59e0b' },
    { name: 'Stage mon.', value: 5, color: '#38bdf8' },
  ];

  const roleData = [
    { name: t('roles.researcher'), value: 2 },
    { name: t('roles.coach'), value: 5 },
    { name: t('roles.operator'), value: 3 },
    { name: t('roles.athlete'), value: 15 },
    { name: t('roles.admin'), value: 1 },
  ];

  const weeklyData = [
    { day: 'Du', sessions: 4, athletes: 6 },
    { day: 'Se', sessions: 7, athletes: 9 },
    { day: 'Ch', sessions: 3, athletes: 5 },
    { day: 'Pa', sessions: 8, athletes: 11 },
    { day: 'Sh', sessions: 5, athletes: 7 },
    { day: 'Ya', sessions: 2, athletes: 3 },
    { day: 'Bo', sessions: 6, athletes: 8 },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 700 }}>{t('admin.title')}</Title>
        <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('admin.systemStatus')}</Text>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title={t('dashboard.users')} value={stats?.stats.users || 0} icon={<UserOutlined />} color="#6366f1" change={12} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title={t('dashboard.athletes')} value={stats?.stats.athletes || 0} icon={<TeamOutlined />} color="#22c55e" change={8} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title={t('dashboard.sessions')} value={stats?.stats.sessions || 0} icon={<ExperimentOutlined />} color="#f59e0b" change={-3} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title={t('dashboard.sportTypes')} value={stats?.stats.sports || 0} icon={<TrophyOutlined />} color="#38bdf8" />
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {/* Area chart - monthly */}
        <Col xs={24} lg={16}>
          <ChartBox
            title={t('dashboard.monthlyStats')}
            subtitle={t('dashboard.thisMonth')}
            extra={<Tag color="purple" style={{ fontSize: 12 }}>12 {t('common.page')}</Tag>}
          >
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                <YAxis stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey={t('dashboard.sessions')} stroke="#6366f1" strokeWidth={2} fill="url(#ag1)"
                  dot={{ fill: '#6366f1', r: 3 }} activeDot={{ r: 5, fill: '#8b5cf6' }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
        </Col>

        {/* Donut - role distribution */}
        <Col xs={24} lg={8}>
          <ChartBox title={t('dashboard.roleDistrib')}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={roleData} cx="50%" cy="50%" innerRadius={42} outerRadius={62} dataKey="value" paddingAngle={3}>
                  {roleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {roleData.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space size={6}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                    <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.name}</Text>
                  </Space>
                  <Text style={{ fontWeight: 600, fontSize: 12 }}>{item.value}</Text>
                </div>
              ))}
            </div>
          </ChartBox>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        {/* Bar chart - weekly sessions */}
        <Col xs={24} lg={12}>
          <ChartBox title={t('sessions.title')} subtitle="7 kun">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weeklyData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="day" stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                <YAxis stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="sessions" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('dashboard.sessions')} />
                <Bar dataKey="athletes" fill="#22c55e" radius={[4, 4, 0, 0]} name={t('dashboard.athletes')} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Col>

        {/* Bar chart - context distribution */}
        <Col xs={24} lg={12}>
          <ChartBox title={t('sessions.context')} subtitle={t('sessions.title')}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={contextData} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                <YAxis type="category" dataKey="name" stroke={axisColor} tick={{ fill: tickColor, fontSize: 11 }} width={70} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} name={t('common.total')}>
                  {contextData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Col>
      </Row>
    </div>
  );
}
