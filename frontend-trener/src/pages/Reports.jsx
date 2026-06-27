import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Table, Button, Select, Typography,
  Tag, Space, Statistic, Empty, message,
} from 'antd';
import {
  FileExcelOutlined, FilePdfOutlined,
  BarChartOutlined, TeamOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { sessionsAPI, athletesAPI, analyticsAPI } from '../services/api';
import { useLang } from '../context/LangContext';

const { Title, Text } = Typography;
const { Option } = Select;

const statusColors = {
  pending: 'default', in_progress: 'processing', completed: 'success', validated: 'blue',
};

export default function Reports() {
  const { t, lang } = useLang();
  const [sessions, setSessions] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [stats, setStats] = useState({ total: 0, validated: 0, completed: 0 });

  const statusLabel = (v) => ({
    pending: t('sessions.pending'),
    in_progress: t('sessions.inProgress'),
    completed: t('sessions.completed'),
    validated: t('sessions.validated'),
  }[v] || v);

  const contextLabel = (v) => t(`sessions.contexts.${v}`) || v;

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (selectedAthlete) params.athlete_id = selectedAthlete;
      if (selectedStatus) params.status = selectedStatus;
      const res = await sessionsAPI.getAll(params);
      const rows = res.data.data;
      setSessions(rows);
      setStats({
        total: rows.length,
        validated: rows.filter(r => r.status === 'validated').length,
        completed: rows.filter(r => r.status === 'completed').length,
      });
    } catch { message.error(t('sessions.loadError')); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSessions();
    athletesAPI.getAll({ limit: 200 }).then(r => setAthletes(r.data.data));
  }, [lang]);

  useEffect(() => { fetchSessions(); }, [selectedAthlete, selectedStatus]);

  const exportCSV = () => {
    const headers = [
      t('sessions.date'), t('athletes.title'), t('sessions.protocol'),
      t('sessions.testType'), t('sessions.context'), t('sessions.operator'), t('common.status'),
    ];
    const rows = sessions.map(s => [
      new Date(s.session_date).toLocaleString(),
      s.athlete_name, s.protocol_name, s.test_type,
      contextLabel(s.training_context), s.operator_name, statusLabel(s.status),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sportuds_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('reports.downloaded'));
  };

  const columns = [
    {
      title: t('sessions.date'), dataIndex: 'session_date', key: 'date',
      render: v => new Date(v).toLocaleString(), width: 160,
    },
    { title: t('athletes.title'), dataIndex: 'athlete_name', key: 'athlete' },
    { title: t('sessions.protocol'), dataIndex: 'protocol_name', key: 'protocol' },
    {
      title: t('sessions.context'), dataIndex: 'training_context', key: 'ctx',
      render: v => contextLabel(v),
    },
    { title: t('sessions.operator'), dataIndex: 'operator_name', key: 'op' },
    {
      title: t('common.status'), dataIndex: 'status', key: 'status',
      render: v => <Tag color={statusColors[v]}>{statusLabel(v)}</Tag>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>{t('reports.title')}</Title>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={exportCSV} style={{ borderColor: '#22c55e', color: '#22c55e' }}>
            {t('reports.exportCSV')}
          </Button>
          <Button icon={<FilePdfOutlined />} disabled style={{ opacity: 0.5 }}>
            {t('reports.exportPDF')}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title={t('reports.totalSessions')}
              value={stats.total}
              prefix={<ExperimentOutlined style={{ color: '#6366f1' }} />}
              valueStyle={{ color: '#6366f1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title={t('reports.completed')}
              value={stats.completed}
              prefix={<BarChartOutlined style={{ color: '#22c55e' }} />}
              valueStyle={{ color: '#22c55e' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title={t('reports.validated')}
              value={stats.validated}
              prefix={<TeamOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            placeholder={t('reports.filterByAthlete')}
            allowClear
            style={{ width: 220 }}
            showSearch
            optionFilterProp="children"
            onChange={setSelectedAthlete}
          >
            {athletes.map(a => <Option key={a.id} value={a.id}>{a.full_name}</Option>)}
          </Select>
          <Select
            placeholder={t('reports.filterByStatus')}
            allowClear
            style={{ width: 180 }}
            onChange={setSelectedStatus}
          >
            <Option value="completed">{t('sessions.completed')}</Option>
            <Option value="validated">{t('sessions.validated')}</Option>
            <Option value="in_progress">{t('sessions.inProgress')}</Option>
            <Option value="pending">{t('sessions.pending')}</Option>
          </Select>
          <Button type="primary" onClick={fetchSessions} loading={loading}>
            {t('common.filter')}
          </Button>
        </Space>
      </Card>

      <Card>
        {sessions.length === 0 && !loading ? (
          <Empty description={t('common.noData')} />
        ) : (
          <Table
            columns={columns}
            dataSource={sessions}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 800 }}
            footer={() => (
              <Text type="secondary">
                {t('common.total')} {sessions.length} {t('reports.records')}
              </Text>
            )}
          />
        )}
      </Card>
    </div>
  );
}
