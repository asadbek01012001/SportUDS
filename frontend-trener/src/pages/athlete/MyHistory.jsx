import { useEffect, useState } from 'react';
import { Card, Table, Tag, Spin, Empty } from 'antd';
import { athleteSelfAPI } from '../../services/api';
import { useLang } from '../../context/LangContext';

export default function MyHistory() {
  const { lang } = useLang();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const L = (uz, ru, en) => (lang === 'ru' ? ru : lang === 'en' ? en : uz);

  useEffect(() => {
    (async () => {
      try {
        const res = await athleteSelfAPI.history();
        setHistory(res.data.data || []);
      } catch {
        // interceptor handles 401
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const columns = [
    {
      title: L('Sana', 'Дата', 'Date'),
      dataIndex: 'started_at',
      render: (v) => (v ? new Date(v).toLocaleString() : '—'),
    },
    { title: L('Mashina', 'Тренажёр', 'Machine'), dataIndex: 'machine_name' },
    { title: L('Zal', 'Зал', 'Hall'), dataIndex: 'hall_name' },
    {
      title: L('Maks. vazn', 'Макс. вес', 'Max weight'),
      dataIndex: 'max_weight_kg',
      render: (v) => (v != null ? `${v} kg` : '—'),
    },
    {
      title: L('Maks. daraja', 'Макс. уровень', 'Max bar'),
      dataIndex: 'max_bar_cm',
      render: (v) => (v != null ? `${v} cm` : '—'),
    },
    { title: L('O\'lchovlar', 'Замеры', 'Readings'), dataIndex: 'measurement_count' },
    {
      title: L('Holat', 'Статус', 'Status'),
      dataIndex: 'status',
      render: (v) => <Tag color={v === 'completed' ? 'green' : 'orange'}>{v}</Tag>,
    },
  ];

  return (
    <Card title={L('Mashg\'ulot tarixim', 'Моя история', 'My history')} style={{ borderRadius: 14 }}>
      {history.length === 0 ? (
        <Empty description={L('Hali mashg\'ulot yo\'q', 'Пока нет тренировок', 'No sessions yet')} />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={history}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 700 }}
        />
      )}
    </Card>
  );
}
