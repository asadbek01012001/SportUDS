import { useEffect, useState } from 'react';
import {
  Table, Button, Input, Space, Tag, Typography, Modal, Form, Card,
  Select, Popconfirm, message, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  KeyOutlined, UserOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';
import { isSuperAdmin } from '../../constants/roles';

const { Title } = Typography;
const { Option } = Select;

const roleColors = {
  super_admin: 'volcano', admin: 'red', researcher: 'purple', coach: 'blue', operator: 'green', athlete: 'default',
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const fetchUsers = async (p = page, s = search) => {
    setLoading(true);
    try {
      const res = await adminAPI.getUsers({ page: p, limit: 20, search: s });
      setUsers(res.data.data);
      setTotal(res.data.pagination.total);
    } catch { message.error(t('common.loading')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const openAdd = () => { setEditRecord(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (rec) => {
    setEditRecord(rec);
    form.setFieldsValue({ full_name: rec.full_name, role: rec.role, is_active: rec.is_active });
    setModalOpen(true);
  };
  const openPwd = (rec) => { setEditRecord(rec); pwdForm.resetFields(); setPwdModalOpen(true); };

  const handleSave = async (values) => {
    try {
      if (editRecord) {
        await adminAPI.updateUser(editRecord.id, values);
        message.success(t('common.save') + 'landi');
      } else {
        await adminAPI.createUser(values);
        message.success(t('admin.addUser'));
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || 'Xato');
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteUser(id);
      message.success(t('admin.deactivated'));
      fetchUsers();
    } catch { message.error('Xato'); }
  };

  const handleResetPwd = async (values) => {
    try {
      await adminAPI.resetPassword(editRecord.id, { new_password: values.new_password });
      message.success(t('admin.passwordReset'));
      setPwdModalOpen(false);
    } catch { message.error('Xato'); }
  };

  const columns = [
    {
      title: t('athletes.fullName'),
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text, rec) => (
        <Space>
          <UserOutlined />
          <span>{text}</span>
          {rec.id === currentUser?.id && <Tag color="gold">{t('admin.youBadge')}</Tag>}
        </Space>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: t('admin.role'),
      dataIndex: 'role',
      key: 'role',
      render: (v) => <Tag color={roleColors[v]}>{t(`roles.${v}`)}</Tag>,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v) => <Badge status={v ? 'success' : 'error'} text={v ? t('common.active') : t('common.inactive')} />,
    },
    {
      title: t('common.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v) => new Date(v).toLocaleDateString(),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_, rec) => (
        <Space>
          <Tooltip title={t('common.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          </Tooltip>
          <Tooltip title={t('admin.resetPassword')}>
            <Button size="small" icon={<KeyOutlined />} onClick={() => openPwd(rec)} />
          </Tooltip>
          {rec.id !== currentUser?.id && (
            <Popconfirm
              title={t('admin.deactivate') + '?'}
              onConfirm={() => handleDelete(rec.id)}
              okText={t('common.yes')}
              cancelText={t('common.no')}
            >
              <Tooltip title={t('admin.deactivate')}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('admin.users')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          {t('admin.addUser')}
        </Button>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder={t('common.search') + '...'}
          value={search}
          onChange={(e) => { setSearch(e.target.value); fetchUsers(1, e.target.value); }}
          style={{ maxWidth: 360 }}
          allowClear
        />
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            total,
            pageSize: 20,
            current: page,
            onChange: (p) => { setPage(p); fetchUsers(p); },
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editRecord ? t('admin.editUser') : t('admin.addUser')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {!editRecord && (
            <Form.Item name="email" label="Email" rules={[{ required: true }, { type: 'email' }]}>
              <Input placeholder="email@example.com" />
            </Form.Item>
          )}
          <Form.Item name="full_name" label={t('athletes.fullName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label={t('admin.role')} rules={[{ required: true }]}>
            <Select>
              {/* Admin/Super Admin rolini faqat Super Admin tayinlay oladi */}
              {(isSuperAdmin(currentUser?.role)
                ? ['super_admin', 'admin', 'researcher', 'coach', 'operator', 'athlete']
                : ['researcher', 'coach', 'operator', 'athlete']
              ).map(r => (
                <Option key={r} value={r}>{t(`roles.${r}`)}</Option>
              ))}
            </Select>
          </Form.Item>
          {!editRecord && (
            <Form.Item name="password" label={t('auth.password')} rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
          )}
          {editRecord && (
            <Form.Item name="is_active" label={t('common.status')} rules={[{ required: true }]}>
              <Select>
                <Option value={true}>{t('common.active')}</Option>
                <Option value={false}>{t('common.inactive')}</Option>
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title={`${t('admin.resetPassword')} — ${editRecord?.full_name}`}
        open={pwdModalOpen}
        onCancel={() => setPwdModalOpen(false)}
        onOk={() => pwdForm.submit()}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleResetPwd}>
          <Form.Item
            name="new_password"
            label={t('auth.newPassword')}
            rules={[{ required: true }, { min: 8 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm"
            label={t('auth.confirmPassword')}
            dependencies={['new_password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error(t('auth.passwordMismatch')));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
