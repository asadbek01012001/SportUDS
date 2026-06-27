import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Avatar, Spin, Empty, Tag, Descriptions, List, Space } from 'antd';
import {
  UserOutlined, ThunderboltOutlined, ColumnHeightOutlined,
  HistoryOutlined, TrophyOutlined, TeamOutlined, EnvironmentOutlined,
} from '@ant-design/icons';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { athleteSelfAPI } from '../../services/api';
import { useLang } from '../../context/LangContext';

export default function MyCabinet() {
  const { lang } = useLang();
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  const L = (uz, ru, en) => (lang === 'ru' ? ru : lang === 'en' ? en : uz);

  useEffect(() => {
    (async () => {
      try {
        const [p, h, tm] = await Promise.all([
          athleteSelfAPI.verify(),
          athleteSelfAPI.history(),
          athleteSelfAPI.team(),
        ]);
        setProfile(p.data.data);
        setHistory(h.data.data || []);
        setTeam(tm.data.data || null);
      } catch {
        // 401 bo'lsa api interceptor login'ga yo'naltiradi
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const totalSessions = history.length;
  const bestWeight = history.reduce((m, r) => Math.max(m, Number(r.max_weight_kg) || 0), 0);
  const bestBar = history.reduce((m, r) => Math.max(m, Number(r.max_bar_cm) || 0), 0);

  // Dinamika grafigi uchun (eskidan yangiga)
  const chartData = [...history].reverse().map((r, i) => ({
    name: r.started_at ? new Date(r.started_at).toLocaleDateString() : `#${i + 1}`,
    weight: Number(r.max_weight_kg) || 0,
    bar: Number(r.max_bar_cm) || 0,
  }));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Profil kartasi */}
      <Card style={{ marginBottom: 20, borderRadius: 14 }}>
        <Row align="middle" gutter={[20, 20]}>
          <Col>
            <Avatar size={72} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: 28 }}>
              {profile?.full_name?.[0] || <UserOutlined />}
            </Avatar>
          </Col>
          <Col flex="auto">
            <div style={{ fontSize: 22, fontWeight: 700 }}>{profile?.full_name}</div>
            <div style={{ opacity: 0.55, fontSize: 14 }}>{profile?.email}</div>
            <div style={{ marginTop: 8 }}>
              <Tag color="purple">{L('Sportchi', 'Спортсмен', 'Athlete')}</Tag>
              {profile?.sport_name && <Tag color="blue">{profile.sport_name}</Tag>}
              {profile?.region && <Tag>{profile.region}</Tag>}
            </div>
          </Col>
        </Row>

        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 20 }} size="small">
          <Descriptions.Item label={L('Tug\'ilgan sana', 'Дата рождения', 'Birth date')}>
            {profile?.birth_date ? new Date(profile.birth_date).toLocaleDateString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={L('Vazn', 'Вес', 'Weight')}>
            {profile?.body_weight ? `${profile.body_weight} kg` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={L('Bo\'y', 'Рост', 'Height')}>
            {profile?.height_cm ? `${profile.height_cm} cm` : '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Statistika */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 14 }}>
            <Statistic title={L('Mashg\'ulotlar', 'Тренировки', 'Sessions')} value={totalSessions}
              prefix={<HistoryOutlined style={{ color: '#6366f1' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 14 }}>
            <Statistic title={L('Eng yuqori vazn', 'Макс. вес', 'Max weight')} value={bestWeight} suffix="kg"
              prefix={<ThunderboltOutlined style={{ color: '#f59e0b' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 14 }}>
            <Statistic title={L('Eng yuqori daraja', 'Макс. уровень', 'Max bar')} value={bestBar} suffix="cm"
              prefix={<ColumnHeightOutlined style={{ color: '#22c55e' }} />} />
          </Card>
        </Col>
      </Row>

      {/* Mening jamoam */}
      <Card
        title={<span><TeamOutlined /> {L('Mening jamoam', 'Моя команда', 'My team')}</span>}
        style={{ borderRadius: 14, marginBottom: 20 }}
      >
        {!team ? (
          <Empty description={L('Siz hali jamoaga biriktirilmagansiz', 'Вы пока не в команде', 'You are not in a team yet')} />
        ) : (
          <Row gutter={[20, 20]}>
            <Col xs={24} md={10}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{team.team?.name}</div>
              <Space wrap style={{ marginTop: 8 }}>
                {team.team?.sport_name && <Tag color="blue">{team.team.sport_name}</Tag>}
                {team.team?.hall_name && <Tag icon={<EnvironmentOutlined />}>{team.team.hall_name}</Tag>}
              </Space>
              <div style={{ marginTop: 14 }}>
                <div style={{ opacity: 0.55, fontSize: 13, marginBottom: 6 }}>{L('Trenerlar', 'Тренеры', 'Coaches')}</div>
                {(team.coaches || []).length
                  ? <Space wrap>{team.coaches.map((c, i) => <Tag key={i} color="purple" icon={<UserOutlined />}>{c.full_name}</Tag>)}</Space>
                  : <span style={{ opacity: 0.4 }}>—</span>}
              </div>
            </Col>
            <Col xs={24} md={14}>
              <div style={{ opacity: 0.55, fontSize: 13, marginBottom: 6 }}>
                {L('Jamoadoshlar', 'Партнёры по команде', 'Teammates')} ({(team.members || []).length})
              </div>
              <List
                size="small"
                grid={{ gutter: 8, column: 1 }}
                dataSource={team.members || []}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="—" /> }}
                renderItem={(m) => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <Space>
                      <Avatar size={28} style={{ background: '#1e40af', fontSize: 13 }}>{m.full_name?.[0]}</Avatar>
                      <span style={{ fontWeight: m.id === profile?.athlete_id ? 700 : 400 }}>
                        {m.full_name}{m.id === profile?.athlete_id ? ` (${L('siz', 'вы', 'you')})` : ''}
                      </span>
                    </Space>
                  </List.Item>
                )}
              />
            </Col>
          </Row>
        )}
      </Card>

      {/* Dinamika grafigi */}
      <Card
        title={<span><TrophyOutlined /> {L('Dinamika', 'Динамика', 'Progress')}</span>}
        style={{ borderRadius: 14 }}
      >
        {chartData.length === 0 ? (
          <Empty description={L('Hali mashg\'ulot yo\'q', 'Пока нет тренировок', 'No sessions yet')} />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="weight" name={L('Vazn (kg)', 'Вес (кг)', 'Weight (kg)')} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="bar" name={L('Daraja (cm)', 'Уровень (см)', 'Bar (cm)')} stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
