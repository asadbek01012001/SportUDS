import { useEffect, useState } from 'react';
import {
  Table, Button, Input, Space, Tag, Typography, Modal, Form,
  Select, DatePicker, Row, Col, Card, Popconfirm, message, Tooltip,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  EyeOutlined, UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { athletesAPI, analyticsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

const { Title } = Typography;
const { Option } = Select;

const qualificationOptions = [
  'MS (Master of Sport)', 'KMS (Candidate for MS)', '1-razryad', '2-razryad',
  '3-razryad', 'Yuqori razryadsiz',
];

export default function Athletes() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();

  const canEdit = ['admin', 'researcher', 'coach'].includes(user?.role);

  const fetchAthletes = async (p = page, s = search) => {
    setLoading(true);
    try {
      const res = await athletesAPI.getAll({ page: p, limit: 20, search: s });
      setAthletes(res.data.data);
      setTotal(res.data.pagination.total);
    } catch { message.error(t('sessions.loadError')); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchAthletes();
    analyticsAPI.getSports().then((r) => setSports(r.data.data));
    analyticsAPI.getTeams().then((r) => setTeams(r.data.data));
  }, [lang]);

  const openAdd = () => { setEditRecord(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (rec) => {
    setEditRecord(rec);
    form.setFieldsValue({ ...rec, birth_date: rec.birth_date ? dayjs(rec.birth_date) : null });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    const payload = { ...values, birth_date: values.birth_date?.format('YYYY-MM-DD') };
    try {
      if (editRecord) {
        await athletesAPI.update(editRecord.id, payload);
        message.success(t('athletes.edit'));
      } else {
        await athletesAPI.create(payload);
        message.success(t('athletes.add'));
      }
      setModalOpen(false);
      fetchAthletes();
    } catch (err) {
      message.error(err.response?.data?.error || t('sessions.loadError'));
    }
  };

  const handleDelete = async (id) => {
    try {
      await athletesAPI.delete(id);
      message.success(t('common.delete'));
      fetchAthletes();
    } catch { message.error(t('sessions.loadError')); }
  };

  const columns = [
    {
      title: t('athletes.fullName'),
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text, rec) => (
        <Button type="link" icon={<UserOutlined />} onClick={() => navigate(`/athletes/${rec.id}`)}>
          {text}
        </Button>
      ),
    },
    {
      title: t('athletes.gender'),
      dataIndex: 'gender',
      key: 'gender',
      render: (v) => v === 'male' ? t('common.male') : t('common.female'),
    },
    {
      title: t('athletes.sport'),
      dataIndex: 'sport_name',
      key: 'sport_name',
      render: (v) => v ? <Tag color="blue">{v}</Tag> : '-',
    },
    { title: t('athletes.team'), dataIndex: 'team_name', key: 'team_name', render: (v) => v || '-' },
    { title: t('athletes.coach'), dataIndex: 'coach_name', key: 'coach_name', render: (v) => v || '-' },
    { title: t('athletes.qualification'), dataIndex: 'qualification', key: 'qualification' },
    {
      title: t('athletes.sessionsCount'),
      dataIndex: 'sessions_count',
      key: 'sessions_count',
      render: (v) => <Tag color="green">{v || 0}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_, rec) => (
        <Space>
          <Tooltip title={t('common.view')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/athletes/${rec.id}`)} />
          </Tooltip>
          {canEdit && (
            <>
              <Tooltip title={t('common.edit')}>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
              </Tooltip>
              <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDelete(rec.id)} okText={t('common.yes')} cancelText={t('common.no')}>
                <Tooltip title={t('common.delete')}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('athletes.title')}</Title>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            {t('athletes.add')}
          </Button>
        )}
      </div>

      <Card style={{ marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder={t('common.search') + '...'}
          value={search}
          onChange={(e) => { setSearch(e.target.value); fetchAthletes(1, e.target.value); }}
          style={{ maxWidth: 300 }}
          allowClear
        />
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={athletes}
          rowKey="id"
          loading={loading}
          pagination={{ total, pageSize: 20, current: page, onChange: (p) => { setPage(p); fetchAthletes(p); } }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={editRecord ? t('athletes.edit') : t('athletes.add')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="full_name" label={t('athletes.fullName')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="birth_date" label={t('athletes.birthDate')} rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label={t('athletes.gender')} rules={[{ required: true }]}>
                <Select>
                  <Option value="male">{t('common.male')}</Option>
                  <Option value="female">{t('common.female')}</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sport_id" label={t('athletes.sport')} rules={[{ required: true }]}>
                <Select placeholder={t('common.filter')}>
                  {sports.map((s) => <Option key={s.id} value={s.id}>{s.name_localized || s.name_uz || s.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="team_id" label={t('athletes.team')}>
                <Select allowClear placeholder={t('common.filter')}>
                  {teams.map((tm) => <Option key={tm.id} value={tm.id}>{tm.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="qualification" label={t('athletes.qualification')}>
                <Select placeholder={t('common.filter')}>
                  {qualificationOptions.map((q) => <Option key={q} value={q}>{q}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="weight_category" label={t('athletes.weightCategory')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="experience_years" label={t('athletes.experience')}>
                <Input type="number" min={0} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="training_stage" label={t('athletes.stage')}>
                <Select allowClear placeholder={t('common.filter')}>
                  <Option value="boshlang'ich">{t('athletes.stages.beginner')}</Option>
                  <Option value="maxsus_tayyorgarlik">{t('athletes.stages.special')}</Option>
                  <Option value="yuqori_sport_mahorati">{t('athletes.stages.high')}</Option>
                  <Option value="olimp_zaxira">{t('athletes.stages.olympic')}</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
