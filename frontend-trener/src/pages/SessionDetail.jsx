import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Descriptions, Typography, Tag, Button, Table,
  Spin, Alert, Statistic, Space, Divider, message, Progress,
} from 'antd';
import { ArrowLeftOutlined, CheckOutlined, SafetyOutlined } from '@ant-design/icons';
import { sessionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

const { Title, Text } = Typography;

const statusColors = {
  pending: 'default', in_progress: 'processing', completed: 'success', validated: 'blue',
};

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await sessionsAPI.getById(id);
      setData(res.data.data);
    } catch { message.error(t('sessions.loadError')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleComplete = async () => {
    try {
      await sessionsAPI.complete(id);
      message.success(t('sessions.completed'));
      fetchData();
    } catch { message.error(t('sessions.loadError')); }
  };

  const handleValidate = async () => {
    try {
      await sessionsAPI.validate(id);
      message.success(t('sessions.validated'));
      fetchData();
    } catch { message.error(t('sessions.loadError')); }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!data) return <Alert type="error" message={t('sessions.notFound')} />;

  const { session, indicators, raw_data } = data;
  const bestAttempt = indicators.find((i) => i.is_best_attempt);

  const statusLabel = (v) => ({
    pending: t('sessions.pending'),
    in_progress: t('sessions.inProgress'),
    completed: t('sessions.completed'),
    validated: t('sessions.validated'),
  }[v] || v);

  const indicatorColumns = [
    { title: t('sessions.attempt'), dataIndex: 'attempt_number', key: 'attempt', width: 70 },
    { title: 'Fmax (N)', dataIndex: 'f_max', key: 'f_max', render: (v) => v ? parseFloat(v).toFixed(2) : '-' },
    { title: 'tmax (ms)', dataIndex: 't_max', key: 't_max', render: (v) => v ? parseFloat(v).toFixed(2) : '-' },
    { title: 'J = Fmax/tmax', dataIndex: 'j_speed_strength_index', key: 'j', render: (v) => v ? parseFloat(v).toFixed(4) : '-' },
    { title: t('indicators.q'), dataIndex: 'q_start_force', key: 'q', render: (v) => v ? parseFloat(v).toFixed(4) : '-' },
    { title: t('indicators.g'), dataIndex: 'g_accelerating_force', key: 'g', render: (v) => v ? parseFloat(v).toFixed(4) : '-' },
    { title: 'Vmax (m/s)', dataIndex: 'v_max', key: 'v_max', render: (v) => v ? parseFloat(v).toFixed(4) : '-' },
    { title: 'Nmax (W)', dataIndex: 'n_max', key: 'n_max', render: (v) => v ? parseFloat(v).toFixed(2) : '-' },
    {
      title: t('sessions.bestAttempt'), dataIndex: 'is_best_attempt', key: 'best',
      render: (v) => v ? <Tag color="gold">{t('indicators.bestResult')}</Tag> : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sessions')}>{t('common.back')}</Button>
        <Title level={4} style={{ margin: 0 }}>
          {t('sessions.session')} — {new Date(session.session_date).toLocaleDateString()}
        </Title>
        <Tag color={statusColors[session.status]} style={{ fontSize: 14 }}>
          {statusLabel(session.status)}
        </Tag>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={t('sessions.session')}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('athletes.title')}>{session.athlete_name}</Descriptions.Item>
              <Descriptions.Item label={t('sessions.protocol')}>{session.protocol_name}</Descriptions.Item>
              <Descriptions.Item label={t('sessions.testType')}>{session.test_type}</Descriptions.Item>
              <Descriptions.Item label={t('sessions.operator')}>{session.operator_name}</Descriptions.Item>
              <Descriptions.Item label={t('sessions.bodyWeight')}>
                {session.body_weight ? `${session.body_weight} kg` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('sessions.heartRate')}>
                {session.heart_rate ? `${session.heart_rate} bpm` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('sessions.subjectiveState')}>
                {session.subjective_state ? (
                  <Space>
                    <Progress percent={session.subjective_state * 10} size="small" style={{ width: 100 }} />
                    <Text>{session.subjective_state}/10</Text>
                  </Space>
                ) : '-'}
              </Descriptions.Item>
              {session.notes && <Descriptions.Item label={t('sessions.notes')}>{session.notes}</Descriptions.Item>}
            </Descriptions>

            <Divider />
            <Space direction="vertical" style={{ width: '100%' }}>
              {session.status === 'in_progress' && ['admin', 'researcher', 'operator'].includes(user?.role) && (
                <Button type="primary" icon={<CheckOutlined />} block onClick={handleComplete}>
                  {t('sessions.complete')}
                </Button>
              )}
              {session.status === 'completed' && ['admin', 'researcher', 'coach'].includes(user?.role) && (
                <Button type="primary" icon={<SafetyOutlined />} block onClick={handleValidate}>
                  {t('sessions.validate')}
                </Button>
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {bestAttempt && (
            <Card title={t('sessions.bestAttemptResults')} style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                {[
                  { title: t('indicators.p0'), value: bestAttempt.p0_max_isometric, suffix: 'N' },
                  { title: 'Fmax', value: bestAttempt.f_max, suffix: 'N' },
                  { title: 'tmax', value: bestAttempt.t_max, suffix: 'ms' },
                  { title: 'J', value: bestAttempt.j_speed_strength_index, suffix: '' },
                  { title: 'Q', value: bestAttempt.q_start_force, suffix: '' },
                  { title: 'G', value: bestAttempt.g_accelerating_force, suffix: '' },
                  { title: 'Vmax', value: bestAttempt.v_max, suffix: 'm/s' },
                  { title: 'Nmax', value: bestAttempt.n_max, suffix: 'W' },
                ].map(({ title, value, suffix }) => (
                  <Col xs={12} sm={6} key={title}>
                    <Statistic
                      title={title}
                      value={value ? parseFloat(value).toFixed(3) : '—'}
                      suffix={suffix}
                    />
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          <Card title={`${t('sessions.allAttempts')} (${indicators.length})`}>
            <Table
              columns={indicatorColumns}
              dataSource={indicators}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 800 }}
              rowClassName={(r) => r.is_best_attempt ? 'ant-table-row-selected' : ''}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
