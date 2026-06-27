import { useEffect, useState } from 'react';
import { Table, Button, Card, Tag, Space, Typography, Select, message } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sessionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

const { Title } = Typography;
const { Option } = Select;

const statusColors = {
  pending: 'default', in_progress: 'processing', completed: 'success', validated: 'blue',
};

export default function Sessions() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const canCreate = ['admin', 'researcher', 'operator', 'coach'].includes(user?.role);

  const fetchSessions = async (p = page, status = statusFilter) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (status) params.status = status;
      if (searchParams.get('athlete_id')) params.athlete_id = searchParams.get('athlete_id');
      const res = await sessionsAPI.getAll(params);
      setSessions(res.data.data);
      setTotal(res.data.pagination.total);
    } catch { message.error(t('sessions.loadError')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); }, []);

  const statusLabel = (v) => ({
    pending: t('sessions.pending'),
    in_progress: t('sessions.inProgress'),
    completed: t('sessions.completed'),
    validated: t('sessions.validated'),
  }[v] || v);

  const contextLabel = (v) => t(`sessions.contexts.${v}`) || v;

  const columns = [
    {
      title: t('sessions.date'),
      dataIndex: 'session_date',
      key: 'session_date',
      render: (v) => new Date(v).toLocaleString(),
    },
    { title: t('athletes.title'), dataIndex: 'athlete_name', key: 'athlete_name' },
    { title: t('sessions.protocol'), dataIndex: 'protocol_name', key: 'protocol_name' },
    { title: t('sessions.testType'), dataIndex: 'test_type', key: 'test_type' },
    {
      title: t('sessions.context'),
      dataIndex: 'training_context',
      key: 'training_context',
      render: (v) => contextLabel(v),
    },
    { title: t('sessions.operator'), dataIndex: 'operator_name', key: 'operator_name' },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (v) => <Tag color={statusColors[v]}>{statusLabel(v)}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_, rec) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/sessions/${rec.id}`)}>
          {t('common.view')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('sessions.title')}</Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/sessions/new')}>
            {t('sessions.add')}
          </Button>
        )}
      </div>

      <Card style={{ marginBottom: 12 }}>
        <Space>
          <Select
            placeholder={t('sessions.filterByStatus')}
            allowClear
            style={{ width: 220 }}
            onChange={(v) => { setStatusFilter(v || ''); fetchSessions(1, v || ''); }}
          >
            <Option value="pending">{t('sessions.pending')}</Option>
            <Option value="in_progress">{t('sessions.inProgress')}</Option>
            <Option value="completed">{t('sessions.completed')}</Option>
            <Option value="validated">{t('sessions.validated')}</Option>
          </Select>
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          loading={loading}
          pagination={{ total, pageSize: 20, current: page, onChange: (p) => { setPage(p); fetchSessions(p); } }}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}
