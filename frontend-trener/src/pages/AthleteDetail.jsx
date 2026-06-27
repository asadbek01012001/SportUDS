import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Descriptions, Typography, Tag, Button, Table,
  Space, Spin, Alert, Tabs, Divider,
} from 'antd';
import {
  ArrowLeftOutlined, ExperimentOutlined, BarChartOutlined, RobotOutlined,
} from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { athletesAPI, analyticsAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';

const { Title, Text } = Typography;

const statusColors = {
  pending: 'default', in_progress: 'processing', completed: 'success', validated: 'blue',
};

export default function AthleteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [athlete, setAthlete] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [dynamics, setDynamics] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(false);

  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#475569' : '#94a3b8';
  const tickColor = isDark ? '#64748b' : '#94a3b8';
  const tooltipStyle = { background: isDark ? '#0f1729' : '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 };

  useEffect(() => {
    Promise.all([
      athletesAPI.getById(id),
      athletesAPI.getSessions(id),
      analyticsAPI.getDynamics(id),
    ]).then(([a, s, d]) => {
      setAthlete(a.data.data);
      setSessions(s.data.data);
      setDynamics(d.data.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const getRecommendation = async () => {
    setRecLoading(true);
    try {
      const res = await analyticsAPI.getRecommendation(id);
      setRecommendation(res.data.data);
    } catch { }
    finally { setRecLoading(false); }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!athlete) return <Alert type="error" message={t('athletes.notFound')} />;

  const statusLabel = (v) => ({
    pending: t('sessions.pending'),
    in_progress: t('sessions.inProgress'),
    completed: t('sessions.completed'),
    validated: t('sessions.validated'),
  }[v] || v);

  const contextLabel = (v) => t(`sessions.contexts.${v}`) || v;

  const sessionColumns = [
    {
      title: t('sessions.date'), dataIndex: 'session_date', key: 'session_date',
      render: (v) => new Date(v).toLocaleString(),
    },
    { title: t('sessions.protocol'), dataIndex: 'protocol_name', key: 'protocol_name' },
    { title: t('sessions.testType'), dataIndex: 'test_type', key: 'test_type' },
    {
      title: t('sessions.context'), dataIndex: 'training_context', key: 'training_context',
      render: (v) => contextLabel(v),
    },
    {
      title: 'Fmax', dataIndex: 'f_max', key: 'f_max',
      render: (v) => v ? `${parseFloat(v).toFixed(2)} N` : '-',
    },
    {
      title: t('indicators.j'), dataIndex: 'j_speed_strength_index', key: 'j',
      render: (v) => v ? parseFloat(v).toFixed(3) : '-',
    },
    {
      title: t('common.status'), dataIndex: 'status', key: 'status',
      render: (v) => <Tag color={statusColors[v]}>{statusLabel(v)}</Tag>,
    },
    {
      title: '', key: 'action',
      render: (_, rec) => (
        <Button size="small" onClick={() => navigate(`/sessions/${rec.id}`)}>{t('common.view')}</Button>
      ),
    },
  ];

  const chartData = dynamics.map((d) => ({
    date: new Date(d.session_date).toLocaleDateString(),
    Fmax: d.f_max ? parseFloat(d.f_max) : null,
    J: d.j_speed_strength_index ? parseFloat(d.j_speed_strength_index) : null,
    Nmax: d.n_max ? parseFloat(d.n_max) : null,
  }));

  const trendLabel = (trend) => ({
    positive: t('analytics.positive'),
    negative: t('analytics.negative'),
    insufficient_data: t('analytics.insufficientData'),
  }[trend] || t('analytics.stable'));

  const trendColor = (trend) => ({
    positive: 'success', negative: 'error', insufficient_data: 'default',
  }[trend] || 'warning');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/athletes')}>{t('common.back')}</Button>
        <Title level={4} style={{ margin: 0 }}>{athlete.full_name}</Title>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={t('athletes.title')}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('athletes.birthDate')}>
                {new Date(athlete.birth_date).toLocaleDateString()}
              </Descriptions.Item>
              <Descriptions.Item label={t('athletes.gender')}>
                {athlete.gender === 'male' ? t('common.male') : t('common.female')}
              </Descriptions.Item>
              <Descriptions.Item label={t('athletes.sport')}>
                <Tag color="blue">{athlete.sport_name || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('athletes.team')}>{athlete.team_name || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('athletes.coach')}>{athlete.coach_name || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('athletes.qualification')}>{athlete.qualification || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('athletes.weightCategory')}>{athlete.weight_category || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('athletes.experience')}>
                {athlete.experience_years ? `${athlete.experience_years}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('athletes.stage')}>{athlete.training_stage || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Tabs
            items={[
              {
                key: 'sessions',
                label: <><ExperimentOutlined /> {t('sessions.title')} ({sessions.length})</>,
                children: (
                  <Card>
                    <div style={{ marginBottom: 12 }}>
                      <Button
                        type="primary"
                        icon={<ExperimentOutlined />}
                        onClick={() => navigate(`/sessions/new?athlete_id=${id}`)}
                      >
                        {t('sessions.add')}
                      </Button>
                    </div>
                    <Table
                      columns={sessionColumns}
                      dataSource={sessions}
                      rowKey="id"
                      size="small"
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 800 }}
                    />
                  </Card>
                ),
              },
              {
                key: 'dynamics',
                label: <><BarChartOutlined /> {t('analytics.dynamics')}</>,
                children: (
                  <Card title={t('indicators.title')}>
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={320}>
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
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <Alert type="info" message={t('common.noData')} />
                    )}
                  </Card>
                ),
              },
              {
                key: 'ai',
                label: <><RobotOutlined /> {t('analytics.aiRecommendation')}</>,
                children: (
                  <Card>
                    <Button
                      type="primary"
                      icon={<RobotOutlined />}
                      onClick={getRecommendation}
                      loading={recLoading}
                      style={{ marginBottom: 16 }}
                    >
                      {t('analytics.getRecommendation')}
                    </Button>

                    {recommendation && (
                      <div>
                        <Divider />
                        <Tag
                          color={trendColor(recommendation.trend)}
                          style={{ marginBottom: 12, fontSize: 13 }}
                        >
                          {trendLabel(recommendation.trend)}
                        </Tag>
                        <Card style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb', border: '1px solid var(--border)' }}>
                          <Text style={{ fontSize: 15 }}>{recommendation.recommendation}</Text>
                        </Card>
                        {recommendation.indicators?.length > 0 && (
                          <>
                            <Divider orientation="left">{t('analytics.changedIndicators')}</Divider>
                            <Space wrap>
                              {recommendation.indicators.map((ind, i) => (
                                <Tag key={i} color="blue">{ind}</Tag>
                              ))}
                            </Space>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                ),
              },
            ]}
          />
        </Col>
      </Row>
    </div>
  );
}
