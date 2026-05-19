import { useEffect, useState } from 'react';
import {
  Table, Button, Card, Typography, Modal, Form, Input,
  message, Space, Popconfirm, Tooltip, Tag, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TrophyOutlined } from '@ant-design/icons';
import { analyticsAPI } from '../../services/api';
import { useLang } from '../../context/LangContext';

const { Title } = Typography;
const { TextArea } = Input;

export default function Sports() {
  const { t, lang } = useLang();
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();

  const fetchSports = async () => {
    setLoading(true);
    try {
      const res = await analyticsAPI.getSports();
      setSports(res.data.data);
    } catch { message.error(t('common.loading')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSports(); }, []);

  const openAdd = () => { setEditRecord(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (rec) => {
    setEditRecord(rec);
    form.setFieldsValue({
      name_uz: rec.name_uz,
      name_ru: rec.name_ru,
      name_en: rec.name_en,
      description_uz: rec.description_uz,
      description_ru: rec.description_ru,
      description_en: rec.description_en,
    });
    setModalOpen(true);
  };

  const getDisplayName = (rec) => {
    return rec.name_localized || rec[`name_${lang}`] || rec.name_uz || rec.name_ru || rec.name_en || rec.name || '—';
  };

  const handleSave = async (values) => {
    try {
      if (editRecord) {
        await analyticsAPI.updateSport(editRecord.id, values);
        message.success(t('sports.title') + ' yangilandi');
      } else {
        await analyticsAPI.createSport(values);
        message.success(t('sports.title') + ' qo\'shildi');
      }
      setModalOpen(false);
      fetchSports();
    } catch (err) {
      message.error(err.response?.data?.error || 'Xato');
    }
  };

  const handleDelete = async (id) => {
    try {
      await analyticsAPI.deleteSport(id);
      message.success(t('common.delete') + 'landi');
      fetchSports();
    } catch (err) {
      message.error(err.response?.data?.error || t('sports.cannotDelete'));
    }
  };

  const columns = [
    {
      title: t('common.name'),
      key: 'name',
      render: (_, rec) => (
        <Space>
          <TrophyOutlined style={{ color: '#6366f1' }} />
          <span style={{ fontWeight: 600 }}>{getDisplayName(rec)}</span>
        </Space>
      ),
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
      title: t('common.description'),
      key: 'description',
      render: (_, rec) => {
        const desc = rec.description_localized || rec[`description_${lang}`] || rec.description_uz || rec.description;
        return desc || <span style={{ opacity: 0.4 }}>—</span>;
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 100,
      render: (_, rec) => (
        <Space>
          <Tooltip title={t('common.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          </Tooltip>
          <Popconfirm
            title={t('common.confirmDelete')}
            onConfirm={() => handleDelete(rec.id)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Tooltip title={t('common.delete')}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>{t('sports.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          {t('sports.add')}
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={sports}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={editRecord ? t('sports.edit') : t('sports.add')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>
            🇺🇿 O'zbek
          </Divider>
          <Form.Item name="name_uz" label={t('sports.nameUz')} rules={[{ required: true, message: 'O\'zbekcha nom kiritilishi shart' }]}>
            <Input placeholder="masalan: Kurash" />
          </Form.Item>
          <Form.Item name="description_uz" label={t('sports.descUz')}>
            <TextArea rows={2} placeholder="Qisqacha tavsif..." />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>
            🇷🇺 Русский
          </Divider>
          <Form.Item name="name_ru" label={t('sports.nameRu')}>
            <Input placeholder="например: Борьба" />
          </Form.Item>
          <Form.Item name="description_ru" label={t('sports.descRu')}>
            <TextArea rows={2} placeholder="Краткое описание..." />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>
            🇬🇧 English
          </Divider>
          <Form.Item name="name_en" label={t('sports.nameEn')}>
            <Input placeholder="e.g. Wrestling" />
          </Form.Item>
          <Form.Item name="description_en" label={t('sports.descEn')}>
            <TextArea rows={2} placeholder="Brief description..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
