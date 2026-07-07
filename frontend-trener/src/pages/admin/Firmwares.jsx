import { useEffect, useState } from 'react';
import {
  Table, Button, Card, Typography, Modal, Form, Select, Input, InputNumber,
  message, Space, Popconfirm, Tooltip, Tag, Alert, Upload,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, InboxOutlined, EditOutlined, CloudDownloadOutlined,
} from '@ant-design/icons';
import { firmwaresAPI } from '../../services/api';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const STATUS_META = {
  draft: { color: 'default', label: 'Qoralama' },
  beta: { color: 'orange', label: 'Beta' },
  stable: { color: 'green', label: 'Barqaror' },
};

const PAIR_META = {
  ok: { color: 'green', label: 'A/B mos' },
  failed: { color: 'red', label: 'A/B xato' },
  pending: { color: 'orange', label: 'A/B kutilmoqda' },
};

// fileToBase64 — tanlangan .bin faylni base64 stringga o'qiydi (data URL prefiksisiz).
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fmtSize = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const fmtCrc = (n) => (n == null ? '—' : `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`);

export default function Firmwares() {
  const [firmwares, setFirmwares] = useState([]);
  const [loading, setLoading] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm] = Form.useForm();
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [editRec, setEditRec] = useState(null);
  const [editForm] = Form.useForm();

  const fetchFirmwares = async () => {
    setLoading(true);
    try {
      const res = await firmwaresAPI.getAll();
      setFirmwares(res.data.data || []);
    } catch { message.error('Proshivkalarni yuklashda xato'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFirmwares(); }, []);

  const openUpload = () => {
    uploadForm.resetFields();
    setFileA(null); setFileB(null);
    setUploadOpen(true);
  };

  const handleUpload = async (values) => {
    if (!fileA) { message.error('image_A (.bin) tanlang'); return; }
    setUploading(true);
    try {
      const file_a = await fileToBase64(fileA);
      const file_b = fileB ? await fileToBase64(fileB) : undefined;
      await firmwaresAPI.upload({
        ver_major: values.ver_major,
        ver_minor: values.ver_minor,
        ver_patch: values.ver_patch ?? 0,
        target: values.target,
        channel: values.channel || 'stable',
        status: values.status || 'draft',
        release_notes: values.release_notes || undefined,
        file_a,
        file_b,
      });
      message.success('Proshivka yuklandi');
      setUploadOpen(false);
      fetchFirmwares();
    } catch (err) {
      message.error(err.response?.data?.error || 'Yuklashda xato');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = async (values) => {
    try {
      await firmwaresAPI.patch(editRec.id, values);
      message.success('Yangilandi');
      setEditRec(null);
      fetchFirmwares();
    } catch (err) {
      message.error(err.response?.data?.error || 'Xato');
    }
  };

  const handleDelete = async (id) => {
    try {
      await firmwaresAPI.delete(id);
      message.success("Proshivka o'chirildi");
      fetchFirmwares();
    } catch (err) {
      message.error(err.response?.data?.error || 'Xato');
    }
  };

  // Dragger'ni "faqat tanlash" rejimida ishlatamiz (avtomatik upload emas).
  const draggerProps = (setter) => ({
    accept: '.bin',
    multiple: false,
    maxCount: 1,
    beforeUpload: (file) => { setter(file); return false; },
    onRemove: () => setter(null),
  });

  const columns = [
    { title: 'Versiya', dataIndex: 'version', key: 'version', render: (v) => <Text strong>{v}</Text> },
    { title: 'Target', dataIndex: 'target', key: 'target', render: (v) => v || <span style={{ opacity: 0.4 }}>—</span> },
    {
      title: 'Image A', key: 'a',
      render: (_, r) => <span><Text>{fmtSize(r.fw_size)}</Text> <Text type="secondary" style={{ fontSize: 11 }}>{fmtCrc(r.fw_crc32)}</Text></span>,
    },
    {
      title: 'Image B / A-B sverka', key: 'b',
      render: (_, r) => {
        if (r.fw_size_b == null) return <span style={{ opacity: 0.4 }}>single-image</span>;
        const m = PAIR_META[r.pair_check] || { color: 'default', label: r.pair_check };
        return (
          <Tooltip title={r.pair_check_detail}>
            <Space size={4}><Text>{fmtSize(r.fw_size_b)}</Text><Tag color={m.color}>{m.label}</Tag></Space>
          </Tooltip>
        );
      },
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s) => { const m = STATUS_META[s] || { color: 'default', label: s }; return <Tag color={m.color}>{m.label}</Tag>; },
    },
    { title: 'Kanal', dataIndex: 'channel', key: 'channel' },
    { title: "Yuklagan", dataIndex: 'uploaded_by_name', key: 'uploaded_by_name', render: (v) => v || <span style={{ opacity: 0.4 }}>—</span> },
    {
      title: 'Amallar', key: 'actions', width: 150,
      render: (_, rec) => (
        <Space>
          <Tooltip title="Yuklab olish (.bin)">
            <Button size="small" icon={<CloudDownloadOutlined />} href={firmwaresAPI.downloadUrl(rec.id)} target="_blank" />
          </Tooltip>
          <Tooltip title="Tahrirlash">
            <Button size="small" icon={<EditOutlined />} onClick={() => {
              setEditRec(rec);
              editForm.setFieldsValue({ status: rec.status, channel: rec.channel, release_notes: rec.release_notes });
            }} />
          </Tooltip>
          <Popconfirm
            title="Proshivka o'chirilsinmi?"
            description="Aktiv OTA yangilanishida bo'lsa o'chmaydi."
            onConfirm={() => handleDelete(rec.id)}
            okText="Ha" cancelText="Yo'q"
          >
            <Tooltip title="O'chirish"><Button size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <InboxOutlined style={{ marginRight: 8, color: '#6366f1' }} />
          Proshivkalar (OTA repozitoriysi)
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openUpload}>Proshivka yuklash</Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={firmwares} rowKey="id" loading={loading} pagination={false} />
      </Card>

      {/* ── Yuklash ── */}
      <Modal
        title="Proshivka yuklash"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onOk={() => uploadForm.submit()}
        confirmLoading={uploading}
        okText="Yuklash" cancelText="Bekor" width={560}
      >
        <Alert
          type="info"
          message="Server .bin ni qabul qilib o'lcham + CRC-32/ISO-HDLC ni o'zi hisoblaydi (slot ≤ 64KB). image_B (ixtiyoriy) yuklansa A/B juftlik sverkasi bajariladi."
          style={{ marginBottom: 16 }}
        />
        <Form form={uploadForm} layout="vertical" onFinish={handleUpload}>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="ver_major" label="Major" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="ver_minor" label="Minor" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="ver_patch" label="Patch" style={{ flex: 1 }}>
              <InputNumber min={0} defaultValue={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="target" label="Target (qurilma turi)" rules={[{ required: true, message: 'Target talab qilinadi' }]}>
            <Input placeholder="masalan: sportuds-trenajor-v1" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="channel" label="Kanal" initialValue="stable" style={{ flex: 1 }}>
              <Select options={[{ value: 'stable', label: 'stable' }, { value: 'beta', label: 'beta' }]} />
            </Form.Item>
            <Form.Item name="status" label="Status" initialValue="draft" style={{ flex: 1 }}>
              <Select options={Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))} />
            </Form.Item>
          </Space>
          <Form.Item label="image_A (.bin, majburiy)" required>
            <Dragger {...draggerProps(setFileA)}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{fileA ? fileA.name : "image_A .bin ni bu yerga tashlang"}</p>
            </Dragger>
          </Form.Item>
          <Form.Item label="image_B (.bin, ixtiyoriy — A/B juftlik)">
            <Dragger {...draggerProps(setFileB)}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{fileB ? fileB.name : "image_B .bin (ixtiyoriy)"}</p>
            </Dragger>
          </Form.Item>
          <Form.Item name="release_notes" label="Release notes (ixtiyoriy)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Tahrir (status/kanal/notes) ── */}
      <Modal
        title="Proshivkani tahrirlash"
        open={!!editRec}
        onCancel={() => setEditRec(null)}
        onOk={() => editForm.submit()}
        okText="Saqlash" cancelText="Bekor" width={480}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="status" label="Status">
            <Select options={Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))} />
          </Form.Item>
          <Form.Item name="channel" label="Kanal">
            <Select options={[{ value: 'stable', label: 'stable' }, { value: 'beta', label: 'beta' }]} />
          </Form.Item>
          <Form.Item name="release_notes" label="Release notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
