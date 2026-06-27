import { useEffect, useState } from 'react';
import {
  Table, Button, Card, Typography, Space, Tag, Modal, Form, Input,
  Select, message, Popconfirm, Tooltip, Drawer, List, Avatar, Empty, Descriptions,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  UsergroupAddOutlined, TeamOutlined, EnvironmentOutlined, UserOutlined,
} from '@ant-design/icons';
import { teamsAPI, athletesAPI, analyticsAPI } from '../services/api';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { isAdminLevel } from '../constants/roles';

const { Title } = Typography;

export default function Teams() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = (uz, ru, en) => (lang === 'ru' ? ru : lang === 'en' ? en : uz);
  const canDelete = isAdminLevel(user?.role);

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);

  // dropdownlar
  const [sports, setSports] = useState([]);
  const [halls, setHalls] = useState([]);
  const [coaches, setCoaches] = useState([]);

  // create/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();

  // detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [freeAthletes, setFreeAthletes] = useState([]);
  const [addingId, setAddingId] = useState(null);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const res = await teamsAPI.getAll();
      setTeams(res.data.data || []);
    } catch { message.error(L('Yuklashda xato', 'Ошибка загрузки', 'Load error')); }
    finally { setLoading(false); }
  };

  const fetchMeta = async () => {
    try {
      const [s, h, c] = await Promise.all([
        analyticsAPI.getSports(),
        api.get('/halls'),
        teamsAPI.getCoaches(),
      ]);
      setSports(s.data.data || []);
      setHalls(h.data.data || []);
      setCoaches(c.data.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchTeams(); fetchMeta(); }, []);

  const openAdd = () => { setEditRecord(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (rec) => {
    setEditRecord(rec);
    form.setFieldsValue({
      name: rec.name,
      sport_id: rec.sport_id || undefined,
      hall_id: rec.hall_id || undefined,
      description: rec.description || '',
      coach_ids: (rec.coaches || []).map(c => c.id),
    });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    try {
      if (editRecord) {
        await teamsAPI.update(editRecord.id, values);
        message.success(L('Saqlandi', 'Сохранено', 'Saved'));
      } else {
        await teamsAPI.create(values);
        message.success(L('Jamoa yaratildi', 'Команда создана', 'Team created'));
      }
      setModalOpen(false);
      fetchTeams();
    } catch (err) {
      message.error(err.response?.data?.error || L('Xato', 'Ошибка', 'Error'));
    }
  };

  const handleDelete = async (id) => {
    try {
      await teamsAPI.delete(id);
      message.success(L('O\'chirildi', 'Удалено', 'Deleted'));
      fetchTeams();
    } catch { message.error(L('Xato', 'Ошибка', 'Error')); }
  };

  // ── Detail drawer ───────────────────────────────────────────
  const openDetail = async (rec) => {
    setDetailOpen(true);
    setDetail(null);
    try {
      const res = await teamsAPI.getById(rec.id);
      setDetail(res.data.data);
      // jamoaga biriktirilmagan atletlar (qo'shish uchun)
      const all = await athletesAPI.getAll({ limit: 200 });
      const memberIds = new Set((res.data.data.athletes || []).map(a => a.id));
      setFreeAthletes((all.data.data || []).filter(a => !memberIds.has(a.id)));
    } catch { message.error(L('Yuklashda xato', 'Ошибка загрузки', 'Load error')); }
  };

  const reloadDetail = async () => {
    if (detail?.id) await openDetail({ id: detail.id });
    fetchTeams();
  };

  const addAthlete = async (athleteId) => {
    setAddingId(athleteId);
    try {
      await teamsAPI.addAthlete(detail.id, athleteId);
      message.success(L('Qo\'shildi', 'Добавлен', 'Added'));
      await reloadDetail();
    } catch { message.error(L('Xato', 'Ошибка', 'Error')); }
    finally { setAddingId(null); }
  };

  const removeAthlete = async (athleteId) => {
    try {
      await teamsAPI.removeAthlete(detail.id, athleteId);
      message.success(L('Chiqarildi', 'Удалён', 'Removed'));
      await reloadDetail();
    } catch { message.error(L('Xato', 'Ошибка', 'Error')); }
  };

  const columns = [
    {
      title: L('Jamoa', 'Команда', 'Team'),
      dataIndex: 'name',
      render: (text, rec) => (
        <Space>
          <Avatar style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} icon={<TeamOutlined />} />
          <a onClick={() => openDetail(rec)}>{text}</a>
        </Space>
      ),
    },
    {
      title: L('Sport turi', 'Вид спорта', 'Sport'),
      dataIndex: 'sport_name',
      render: (v) => v ? <Tag color="blue">{v}</Tag> : <span style={{ opacity: 0.4 }}>—</span>,
    },
    {
      title: L('Filial', 'Филиал', 'Branch'),
      dataIndex: 'hall_name',
      render: (v) => v ? <span><EnvironmentOutlined /> {v}</span> : <span style={{ opacity: 0.4 }}>—</span>,
    },
    {
      title: L('Trenerlar', 'Тренеры', 'Coaches'),
      dataIndex: 'coaches',
      render: (coaches) => (coaches && coaches.length)
        ? <Space wrap size={4}>{coaches.map(c => <Tag key={c.id} color="purple">{c.full_name}</Tag>)}</Space>
        : <span style={{ opacity: 0.4 }}>—</span>,
    },
    {
      title: L('Sportchilar', 'Спортсмены', 'Athletes'),
      dataIndex: 'athlete_count',
      width: 110,
      render: (v) => <Tag color="green">{v || 0}</Tag>,
    },
    {
      title: L('Amallar', 'Действия', 'Actions'),
      key: 'actions',
      width: 150,
      render: (_, rec) => (
        <Space>
          <Tooltip title={L('Ko\'rish', 'Просмотр', 'View')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(rec)} />
          </Tooltip>
          <Tooltip title={L('Tahrirlash', 'Изменить', 'Edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          </Tooltip>
          {canDelete && (
            <Popconfirm
              title={L('Jamoa o\'chirilsinmi?', 'Удалить команду?', 'Delete team?')}
              onConfirm={() => handleDelete(rec.id)}
              okText={L('Ha', 'Да', 'Yes')} cancelText={L('Yo\'q', 'Нет', 'No')}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <UsergroupAddOutlined /> {L('Jamoalar', 'Команды', 'Teams')}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          {L('Jamoa qo\'shish', 'Добавить команду', 'Add team')}
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={teams}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 800 }}
          locale={{ emptyText: <Empty description={L('Jamoa yo\'q', 'Нет команд', 'No teams')} /> }}
        />
      </Card>

      {/* Create / Edit modal */}
      <Modal
        title={editRecord ? L('Jamoani tahrirlash', 'Изменить команду', 'Edit team') : L('Yangi jamoa', 'Новая команда', 'New team')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={L('Saqlash', 'Сохранить', 'Save')}
        cancelText={L('Bekor qilish', 'Отмена', 'Cancel')}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={L('Jamoa nomi', 'Название команды', 'Team name')} rules={[{ required: true }]}>
            <Input placeholder={L('Masalan: Og\'ir atletika terma jamoasi', 'Например: Сборная', 'e.g. National team')} />
          </Form.Item>
          <Form.Item name="sport_id" label={L('Sport turi', 'Вид спорта', 'Sport')}>
            <Select allowClear showSearch optionFilterProp="children"
              placeholder={L('Tanlang', 'Выберите', 'Select')}>
              {sports.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="hall_id" label={L('Filial (zal)', 'Филиал (зал)', 'Branch (hall)')}>
            <Select allowClear showSearch optionFilterProp="children"
              placeholder={L('Ixtiyoriy', 'Необязательно', 'Optional')}>
              {halls.map(h => <Select.Option key={h.id} value={h.id}>{h.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="coach_ids" label={L('Trenerlar (bir nechta)', 'Тренеры (несколько)', 'Coaches (multiple)')}>
            <Select mode="multiple" allowClear showSearch optionFilterProp="children"
              placeholder={L('Trenerlarni tanlang', 'Выберите тренеров', 'Select coaches')}>
              {coaches.map(c => <Select.Option key={c.id} value={c.id}>{c.full_name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="description" label={L('Tavsif', 'Описание', 'Description')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        title={detail?.name || L('Jamoa', 'Команда', 'Team')}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={460}
      >
        {!detail ? <Empty /> : (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label={L('Sport turi', 'Вид спорта', 'Sport')}>{detail.sport_name || '—'}</Descriptions.Item>
              <Descriptions.Item label={L('Filial', 'Филиал', 'Branch')}>{detail.hall_name || '—'}</Descriptions.Item>
              <Descriptions.Item label={L('Tavsif', 'Описание', 'Description')}>{detail.description || '—'}</Descriptions.Item>
            </Descriptions>

            <Title level={5}>{L('Trenerlar', 'Тренеры', 'Coaches')}</Title>
            {(detail.coaches || []).length
              ? <Space wrap style={{ marginBottom: 16 }}>{detail.coaches.map(c => <Tag key={c.id} color="purple" icon={<UserOutlined />}>{c.full_name}</Tag>)}</Space>
              : <div style={{ opacity: 0.4, marginBottom: 16 }}>{L('Trener biriktirilmagan', 'Тренеры не назначены', 'No coaches')}</div>}

            <Title level={5}>{L('Sportchilar', 'Спортсмены', 'Athletes')} ({(detail.athletes || []).length})</Title>
            <List
              size="small"
              dataSource={detail.athletes || []}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={L('Sportchi yo\'q', 'Нет спортсменов', 'No athletes')} /> }}
              renderItem={(a) => (
                <List.Item actions={[
                  <Popconfirm key="r"
                    title={L('Jamoadan chiqarilsinmi?', 'Убрать из команды?', 'Remove from team?')}
                    onConfirm={() => removeAthlete(a.id)}
                    okText={L('Ha', 'Да', 'Yes')} cancelText={L('Yo\'q', 'Нет', 'No')}
                  >
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}>
                  <List.Item.Meta
                    avatar={<Avatar style={{ background: '#1e40af' }}>{a.full_name?.[0]}</Avatar>}
                    title={a.full_name}
                    description={`${a.sport_name || ''}${a.sessions_count ? ` · ${a.sessions_count} ${L('sessiya', 'сессий', 'sessions')}` : ''}`}
                  />
                </List.Item>
              )}
            />

            <div style={{ marginTop: 16 }}>
              <Title level={5}>{L('Sportchi qo\'shish', 'Добавить спортсмена', 'Add athlete')}</Title>
              <Select
                showSearch optionFilterProp="children"
                style={{ width: '100%' }}
                placeholder={L('Sportchini tanlang', 'Выберите спортсмена', 'Select athlete')}
                value={addingId || undefined}
                onSelect={addAthlete}
                notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
              >
                {freeAthletes.map(a => (
                  <Select.Option key={a.id} value={a.id}>
                    {a.full_name}{a.team_name ? ` (${a.team_name})` : ''}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
