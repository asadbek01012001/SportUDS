import { useEffect, useState } from 'react';
import {
  Table, Button, Card, Typography, Modal, Form, Select, Input,
  message, Space, Popconfirm, Tooltip, Tag, Alert, Descriptions,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ApiOutlined, CloudUploadOutlined, CopyOutlined,
} from '@ant-design/icons';
import { devicesAPI, hallsAPI } from '../../services/api';

const { Title, Text } = Typography;

const STATUS_META = {
  active: { color: 'green', label: 'Faol' },
  inactive: { color: 'default', label: 'Nofaol' },
  disabled: { color: 'red', label: "O'chirilgan" },
};

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [halls, setHalls] = useState([]);
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();

  // Yangi qurilma credential'lari — BIR MARTA ko'rsatiladi (qurilmaga flash uchun)
  const [creds, setCreds] = useState(null);

  // OTA modal
  const [otaDevice, setOtaDevice] = useState(null);
  const [otaForm] = Form.useForm();

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await devicesAPI.getAll();
      setDevices(res.data.data || []);
    } catch { message.error('Qurilmalarni yuklashda xato'); }
    finally { setLoading(false); }
  };

  const fetchHalls = async () => {
    try {
      const res = await hallsAPI.getAll();
      setHalls(res.data.data || []);
    } catch { /* zallar ixtiyoriy */ }
  };

  useEffect(() => { fetchDevices(); fetchHalls(); }, []);

  const openAdd = () => { addForm.resetFields(); setAddOpen(true); };

  const handleCreate = async (values) => {
    try {
      const res = await devicesAPI.create({ machine_id: values.machine_id || undefined });
      setAddOpen(false);
      setCreds({ ...res.data.credentials, provisioning: res.data.provisioning });
      fetchDevices();
    } catch (err) {
      message.error(err.response?.data?.error || 'Qurilma yaratishda xato');
    }
  };

  const handleDelete = async (id) => {
    try {
      await devicesAPI.delete(id);
      message.success("Qurilma o'chirildi");
      fetchDevices();
    } catch (err) {
      message.error(err.response?.data?.error || 'Xato');
    }
  };

  const handleOta = async (values) => {
    try {
      const res = await devicesAPI.startOta(otaDevice.id, values.firmware_id.trim());
      message.success(`OTA boshlandi (session: ${res.data.session_id || 'ok'})`);
      setOtaDevice(null);
      otaForm.resetFields();
    } catch (err) {
      const code = err.response?.status;
      message.error(err.response?.data?.error || (code === 409 ? 'Aktiv OTA sessiyasi bor' : 'OTA boshlashda xato'));
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    message.success('Nusxa olindi');
  };

  const columns = [
    {
      title: 'Device UID',
      dataIndex: 'device_uid',
      key: 'device_uid',
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: 'MQTT client_id',
      dataIndex: 'mqtt_client_id',
      key: 'mqtt_client_id',
      render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Trenajor',
      dataIndex: 'machine_name',
      key: 'machine_name',
      render: (v) => v || <span style={{ opacity: 0.4 }}>— biriktirilmagan</span>,
    },
    {
      title: 'Holat',
      dataIndex: 'status',
      key: 'status',
      render: (s) => {
        const m = STATUS_META[s] || { color: 'default', label: s };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: 'Proshivka',
      dataIndex: 'ota_version',
      key: 'ota_version',
      render: (v) => v || <span style={{ opacity: 0.4 }}>—</span>,
    },
    {
      title: "Oxirgi ko'rinish",
      dataIndex: 'last_seen',
      key: 'last_seen',
      render: (v) => (v ? new Date(v).toLocaleString() : <span style={{ opacity: 0.4 }}>hech qachon</span>),
    },
    {
      title: 'Amallar',
      key: 'actions',
      width: 120,
      render: (_, rec) => (
        <Space>
          <Tooltip title="OTA yangilash">
            <Button size="small" icon={<CloudUploadOutlined />} onClick={() => { setOtaDevice(rec); otaForm.resetFields(); }} />
          </Tooltip>
          <Popconfirm
            title="Qurilma o'chirilsinmi?"
            description="MQTT akkaunti ham o'chiriladi."
            onConfirm={() => handleDelete(rec.id)}
            okText="Ha"
            cancelText="Yo'q"
          >
            <Tooltip title="O'chirish">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Zallar → mashinalar (optgroup)
  const machineOptions = halls.map((h) => ({
    label: h.name,
    options: (h.machines || []).filter(Boolean).map((m) => ({
      value: m.id,
      label: `${m.name}${m.serial_number ? ` (${m.serial_number})` : ''}`,
    })),
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ApiOutlined style={{ marginRight: 8, color: '#6366f1' }} />
          Qurilmalar (IoT trenajorlar)
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Qurilma qo'shish
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={devices}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* ── Qurilma qo'shish ── */}
      <Modal
        title="Yangi qurilma"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => addForm.submit()}
        okText="Yaratish"
        cancelText="Bekor"
        width={520}
      >
        <Alert
          type="info"
          message="Qurilma yaratilganda MQTT akkaunt provizion qilinadi. Login/parol bir marta ko'rsatiladi — qurilmaga flash qiling."
          style={{ marginBottom: 16 }}
        />
        <Form form={addForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="machine_id" label="Trenajor (ixtiyoriy)">
            <Select
              allowClear
              placeholder="Trenajorni tanlang yoki bo'sh qoldiring"
              options={machineOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Credential'lar (bir marta) ── */}
      <Modal
        title="Qurilma credential'lari"
        open={!!creds}
        onCancel={() => setCreds(null)}
        footer={[<Button key="ok" type="primary" onClick={() => setCreds(null)}>Yopish</Button>]}
        width={560}
      >
        <Alert
          type="warning"
          message="Bu ma'lumot faqat hozir ko'rsatiladi. Qurilmaga flash qiling va saqlab qo'ying."
          style={{ marginBottom: 16 }}
        />
        {creds && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Device UID">
              <Space><Text code>{creds.device_uid}</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(String(creds.device_uid))} /></Space>
            </Descriptions.Item>
            <Descriptions.Item label="MQTT client_id">
              <Space><Text code>{creds.mqtt_client_id}</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(creds.mqtt_client_id)} /></Space>
            </Descriptions.Item>
            <Descriptions.Item label="MQTT parol">
              <Space><Text code>{creds.mqtt_password}</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(creds.mqtt_password)} /></Space>
            </Descriptions.Item>
            <Descriptions.Item label="Provisioning">{creds.provisioning}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* ── OTA boshlash ── */}
      <Modal
        title={`OTA yangilash — ${otaDevice?.mqtt_client_id || ''}`}
        open={!!otaDevice}
        onCancel={() => setOtaDevice(null)}
        onOk={() => otaForm.submit()}
        okText="Boshlash"
        cancelText="Bekor"
        width={520}
      >
        <Alert
          type="info"
          message="Firmware oldindan firmwares jadvalida bo'lishi kerak. Proshivka ID'sini (UUID) kiriting."
          style={{ marginBottom: 16 }}
        />
        <Form form={otaForm} layout="vertical" onFinish={handleOta}>
          <Form.Item
            name="firmware_id"
            label="Firmware ID (UUID)"
            rules={[{ required: true, message: 'Firmware ID kiritilishi shart' }]}
          >
            <Input placeholder="masalan: 3f2b...-...." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
