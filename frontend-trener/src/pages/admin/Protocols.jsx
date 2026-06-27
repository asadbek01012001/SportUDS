import { useEffect, useState } from 'react';
import {
  Table, Button, Card, Typography, Modal, Form, Input, Select,
  InputNumber, message, Space, Tag, Divider,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { analyticsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const testTypes = [
  'Hip extensors', 'Ankle extensors', 'Deadlift', 'Bench press',
  'Squat', 'Leg press', 'Pull', 'Other',
];

export default function Protocols() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const canCreate = ['admin', 'researcher'].includes(user?.role);

  const getDisplayName = (rec) => {
    return rec.name_localized || rec[`name_${lang}`] || rec.name_uz || rec.name_ru || rec.name_en || rec.name || '—';
  };

  const fetchProtocols = async () => {
    setLoading(true);
    try {
      const res = await analyticsAPI.getProtocols();
      setProtocols(res.data.data);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProtocols(); }, []);

  const handleCreate = async (values) => {
    try {
      await analyticsAPI.createProtocol(values);
      message.success(t('protocols.title') + ' yaratildi');
      setModalOpen(false);
      fetchProtocols();
    } catch (err) {
      message.error(err.response?.data?.error || 'Xato');
    }
  };

  const columns = [
    {
      title: t('common.name'),
      key: 'name',
      render: (_, rec) => <span style={{ fontWeight: 600 }}>{getDisplayName(rec)}</span>,
    },
    {
      title: t('protocols.testType'),
      dataIndex: 'test_type',
      key: 'type',
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'UZ / RU / EN',
      key: 'langs',
      render: (_, rec) => (
        <Space size={4}>
          {rec.name_uz && <Tag color="blue">UZ</Tag>}
          {rec.name_ru && <Tag color="purple">RU</Tag>}
          {rec.name_en && <Tag color="green">EN</Tag>}
        </Space>
      ),
    },
    {
      title: t('protocols.initialPosition'),
      dataIndex: 'initial_position',
      key: 'pos',
      render: (v) => v || '-',
    },
    {
      title: t('protocols.jointAngle'),
      dataIndex: 'joint_angle',
      key: 'angle',
      render: (v) => v ? `${v}°` : '-',
    },
    {
      title: t('protocols.attemptsCount'),
      dataIndex: 'attempts_count',
      key: 'attempts',
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: t('protocols.createdBy'),
      dataIndex: 'created_by_name',
      key: 'creator',
      render: (v) => v || '-',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('protocols.title')}</Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
            {t('protocols.add')}
          </Button>
        )}
      </div>

      <Card>
        <Table columns={columns} dataSource={protocols} rowKey="id" loading={loading} />
      </Card>

      <Modal
        title={t('protocols.add')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Divider orientation="left" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            🇺🇿 O'zbek
          </Divider>
          <Form.Item name="name_uz" label={t('protocols.nameUz')} rules={[{ required: true, message: 'O\'zbekcha nom kiritilishi shart' }]}>
            <Input placeholder="masalan: Biqin bukmasi (izometrik)" />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            🇷🇺 Русский
          </Divider>
          <Form.Item name="name_ru" label={t('protocols.nameRu')}>
            <Input placeholder="например: Сгибание бедра (изометрический)" />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            🇬🇧 English
          </Divider>
          <Form.Item name="name_en" label={t('protocols.nameEn')}>
            <Input placeholder="e.g. Hip flexion (isometric)" />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />

          <Form.Item name="test_type" label={t('protocols.testType')} rules={[{ required: true }]}>
            <Select placeholder={t('common.filter')}>
              {testTypes.map((tp) => <Option key={tp} value={tp}>{tp}</Option>)}
            </Select>
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="initial_position" label={t('protocols.initialPosition')} style={{ flex: 1 }}>
              <Input placeholder="masalan: Yotgan holat, 90°" />
            </Form.Item>
            <Form.Item name="joint_angle" label={`${t('protocols.jointAngle')} (°)`}>
              <InputNumber min={0} max={360} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Form.Item name="execution_mode" label={t('protocols.executionMode')}>
            <Select placeholder={t('common.filter')} allowClear>
              <Option value="isometric">{t('protocols.modes.isometric')}</Option>
              <Option value="explosive">{t('protocols.modes.explosive')}</Option>
              <Option value="dynamic">{t('protocols.modes.dynamic')}</Option>
            </Select>
          </Form.Item>

          <Form.Item name="attempts_count" label={t('protocols.attemptsCount')} initialValue={3}>
            <InputNumber min={1} max={10} />
          </Form.Item>

          <Form.Item name="description_uz" label={t('common.description')}>
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
