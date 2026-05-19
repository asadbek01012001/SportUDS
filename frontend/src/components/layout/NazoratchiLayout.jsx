import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';

const { Content } = Layout;

export default function NazoratchiLayout() {
  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Content style={{ padding: 0, minHeight: '100vh' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
