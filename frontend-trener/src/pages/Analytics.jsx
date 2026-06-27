import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Select, Typography, Table, Tag, Spin, Empty, Button, Space,
} from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis,
} from 'recharts';
import { analyticsAPI, athletesAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';

const { Title } = Typography;
const { Option } = Select;

export default function Analytics() {
  const { t, lang } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [athletes, setAthletes] = useState([]);
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [dynamics, setDynamics] = useState([]);
  const [groupData, setGroupData] = useState([]);
  const [loading, setLoading] = useState(false);

  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#475569' : '#94a3b8';
  const tickColor = isDark ? '#64748b' : '#94a3b8';
  const tooltipStyle = { background: isDark ? '#0f1729' : '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 };

  useEffect(() => {
    athletesAPI.getAll({ limit: 200 }).then((r) => setAthletes(r.data.data));
    analyticsAPI.getSports().then((r) => setSports(r.data.data));
    analyticsAPI.getTeams().then((r) => setTeams(r.data.data));
  }, [lang]);

  const loadDynamics = async (athleteId) => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const res = await analyticsAPI.getDynamics(athleteId);
      setDynamics(res.data.data);
    } catch { }
    finally { setLoading(false); }
  };

  const loadGroupComparison = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedSport) params.sport_id = selectedSport;
      if (selectedTeam) params.team_id = selectedTeam;
      const res = await analyticsAPI.getGroupComparison(params);
      setGroupData(res.data.data);
    } catch { }
    finally { setLoading(false); }
  };

  const chartData = dynamics.map((d) => ({
    date: new Date(d.session_date).toLocaleDateString(),
    Fmax: d.f_max ? parseFloat(d.f_max) : null,
    J: d.j_speed_strength_index ? parseFloat(d.j_speed_strength_index) : null,
    Nmax: d.n_max ? parseFloat(d.n_max) : null,
    Q: d.q_start_force ? parseFloat(d.q_start_force) : null,
  }));

  const groupColumns = [
    { title: '#', key: 'idx', render: (_, __, i) => i + 1, width: 50 },
    { title: t('athletes.fullName'), dataIndex: 'full_name', key: 'name' },
    { title: t('athletes.gender'), dataIndex: 'gender', key: 'gender', render: (v) => v === 'male' ? t('common.male') : t('common.female') },
    { title: t('athletes.qualification'), dataIndex: 'qualification', key: 'q' },
    { title: 'Avg Fmax (N)', dataIndex: 'avg_f_max', key: 'fmax', render: (v) => v ? parseFloat(v).toFixed(2) : '-' },
    { title: 'Avg J', dataIndex: 'avg_j', key: 'j', render: (v) => v ? parseFloat(v).toFixed(4) : '-' },
    { title: 'Avg Nmax (W)', dataIndex: 'avg_n_max', key: 'nmax', render: (v) => v ? parseFloat(v).toFixed(2) : '-' },
    { title: t('athletes.sessionsCount'), dataIndex: 'sessions_count', key: 'cnt', render: (v) => <Tag color="blue">{v}</Tag> },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>{t('analytics.title')}</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card title={t('analytics.dynamics')}>
            <Space style={{ marginBottom: 16 }} wrap>
              <Select
                showSearch
                placeholder={t('analytics.selectAthlete')}
                style={{ width: 280 }}
                optionFilterProp="children"
                onChange={(v) => { setSelectedAthlete(v); loadDynamics(v); }}
                allowClear
              >
                {athletes.map((a) => <Option key={a.id} value={a.id}>{a.full_name}</Option>)}
              </Select>
            </Space>

            {loading && <Spin />}

            {!loading && chartData.length > 0 && (
              <Row gutter={16}>
                <Col xs={24} lg={14}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="date" stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                      <YAxis yAxisId="left" stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="Fmax" stroke="#6366f1" name="Fmax (N)" dot />
                      <Line yAxisId="right" type="monotone" dataKey="J" stroke="#22c55e" name="J" dot />
                      <Line yAxisId="left" type="monotone" dataKey="Nmax" stroke="#f59e0b" name="Nmax (W)" dot />
                      <Line yAxisId="right" type="monotone" dataKey="Q" stroke="#f87171" name="Q" dot />
                    </LineChart>
                  </ResponsiveContainer>
                </Col>
                <Col xs={24} lg={10}>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={[
                      { indicator: 'Fmax', value: chartData[chartData.length - 1]?.Fmax || 0 },
                      { indicator: 'J', value: (chartData[chartData.length - 1]?.J || 0) * 100 },
                      { indicator: 'Nmax', value: chartData[chartData.length - 1]?.Nmax || 0 },
                      { indicator: 'Q', value: (chartData[chartData.length - 1]?.Q || 0) * 100 },
                    ]}>
                      <PolarGrid stroke={gridColor} />
                      <PolarAngleAxis dataKey="indicator" tick={{ fill: tickColor, fontSize: 12 }} />
                      <Radar name={t('indicators.bestResult')} dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </Col>
              </Row>
            )}

            {!loading && selectedAthlete && chartData.length === 0 && (
              <Empty description={t('common.noData')} />
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card title={t('analytics.groupComparison')}>
            <Space style={{ marginBottom: 16 }} wrap>
              <Select
                placeholder={t('athletes.sport')}
                style={{ width: 200 }}
                allowClear
                onChange={(v) => setSelectedSport(v)}
              >
                {sports.map((s) => <Option key={s.id} value={s.id}>{s.name_localized || s.name_uz || s.name}</Option>)}
              </Select>
              <Select
                placeholder={t('analytics.selectTeam')}
                style={{ width: 200 }}
                allowClear
                onChange={(v) => setSelectedTeam(v)}
              >
                {teams.map((tm) => <Option key={tm.id} value={tm.id}>{tm.name}</Option>)}
              </Select>
              <Button type="primary" onClick={loadGroupComparison} loading={loading}>
                {t('analytics.compare')}
              </Button>
            </Space>

            {groupData.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={260} style={{ marginBottom: 24 }}>
                  <BarChart data={groupData.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="full_name" tick={{ fill: tickColor, fontSize: 11 }} stroke={axisColor} />
                    <YAxis stroke={axisColor} tick={{ fill: tickColor, fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="avg_f_max" name="Avg Fmax (N)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="avg_n_max" name="Avg Nmax (W)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <Table
                  columns={groupColumns}
                  dataSource={groupData}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 10 }}
                />
              </>
            )}

            {groupData.length === 0 && !loading && (
              <Empty description={t('common.noData')} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
