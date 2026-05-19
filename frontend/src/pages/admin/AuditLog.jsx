import { useEffect, useState } from 'react';
import { Table, Card, Typography, Tag } from 'antd';
import { adminAPI } from '../../services/api';
import { useLang } from '../../context/LangContext';

const { Title } = Typography;

const actionColors = {
  LOGIN: 'blue', CREATE_USER: 'green', CREATE_ATHLETE: 'purple',
  CREATE_SESSION: 'cyan', UPDATE_USER: 'orange', DELETE_USER: 'red',
};

export default function AuditLog() {
  const { t } = useLang();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const res = await adminAPI.getAuditLog({ page: p, limit: 50 });
      setLogs(res.data.data);
      setTotal(res.data.pagination.total);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, []);

  const columns = [
    {
      title: t('common.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v) => new Date(v).toLocaleString(),
      width: 160,
    },
    {
      title: t('nav.users'),
      dataIndex: 'full_name',
      key: 'user',
      render: (v, rec) => v || rec.email || '-',
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (v) => <Tag color={actionColors[v] || 'default'}>{t(`admin.actions.${v}`) || v}</Tag>,
    },
    { title: 'Entity', dataIndex: 'entity_type', key: 'entity_type', render: (v) => v || '-' },
    { title: 'IP', dataIndex: 'ip_address', key: 'ip', render: (v) => v || '-' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>{t('admin.auditLog')}</Title>
      <Card>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{ total, pageSize: 50, current: page, onChange: (p) => { setPage(p); fetchLogs(p); } }}
          scroll={{ x: 700 }}
          size="small"
        />
      </Card>
    </div>
  );
}
