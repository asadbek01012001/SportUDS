import { Modal, Typography, Divider, Tag, Space, Row, Col } from 'antd';
import {
  DashboardOutlined, TeamOutlined, ExperimentOutlined, BarChartOutlined,
  FileTextOutlined, SafetyOutlined, UserOutlined, TrophyOutlined,
  RocketOutlined, BulbOutlined, ApiOutlined,
} from '@ant-design/icons';
import { useLang } from '../context/LangContext';

const { Title, Paragraph, Text } = Typography;

const SECTIONS = {
  uz: [
    {
      icon: <DashboardOutlined />, color: '#6366f1',
      title: 'Bosh sahifa (Dashboard)',
      desc: 'Tizimning umumiy ko\'rinishi. Foydalanuvchilar, sportchilar, sessiyalar soni va oylik faoliyat statistikasi. Grafik va diagrammalar orqali tizim holatini tezda baholash mumkin.',
    },
    {
      icon: <TeamOutlined />, color: '#22c55e',
      title: 'Sportchilar',
      desc: 'Barcha sportchilar ro\'yxati. Yangi sportchi qo\'shish, ma\'lumotlarini tahrirlash, sport turi va jamoaga biriktirish. Har bir sportchining test sessiyalari tarixi va ko\'rsatkichlari ko\'rinadi.',
    },
    {
      icon: <ExperimentOutlined />, color: '#f59e0b',
      title: 'Test Sessiyalari',
      desc: 'UDS sensori yordamida o\'tkazilgan testlar ro\'yxati. Yangi test sessiyasi yaratish, sensor ma\'lumotlarini kiritish (F, t, S), UDS formulalari avtomatik hisoblanadi (Fmax, J, Q, G, Vmax, Nmax). Sessiyani yakunlash va tasdiqlash.',
    },
    {
      icon: <BarChartOutlined />, color: '#38bdf8',
      title: 'Analitika',
      desc: 'Sportchi dinamikasi (ko\'rsatkichlarning vaqt o\'tishi bilan o\'zgarishi), yuklamadan oldin/keyin taqqoslash, guruh taqqoslash, AI asosidagi tavsiyalar. Trenerni o\'qitish samaradorligini baholashga yordam beradi.',
    },
    {
      icon: <FileTextOutlined />, color: '#a78bfa',
      title: 'Hisobotlar',
      desc: 'Barcha test sessiyalari ro\'yxati. Sportchi va holat bo\'yicha filtrlash. CSV formatda yuklab olish va tahlil qilish imkoniyati. Excel yoki boshqa dasturlarda ochish mumkin.',
    },
    {
      icon: <SafetyOutlined />, color: '#f87171',
      title: 'Admin Panel',
      desc: 'Foydalanuvchilar boshqaruvi (qo\'shish, tahrirlash, rol berish), sport turlari CRUD, test protokollari yaratish, tizim audit jurnali. Faqat administrator roli uchun.',
    },
  ],
  ru: [
    {
      icon: <DashboardOutlined />, color: '#6366f1',
      title: 'Главная (Dashboard)',
      desc: 'Общий обзор системы. Количество пользователей, спортсменов, сессий и месячная статистика активности. Быстрая оценка состояния системы через графики и диаграммы.',
    },
    {
      icon: <TeamOutlined />, color: '#22c55e',
      title: 'Спортсмены',
      desc: 'Список всех спортсменов. Добавление, редактирование, привязка к виду спорта и команде. История тестовых сессий и показатели каждого спортсмена.',
    },
    {
      icon: <ExperimentOutlined />, color: '#f59e0b',
      title: 'Тест-сессии',
      desc: 'Список тестов с UDS сенсором. Создание новой сессии, ввод данных сенсора (F, t, S), автоматический расчёт формул UDS (Fmax, J, Q, G, Vmax, Nmax). Завершение и подтверждение сессии.',
    },
    {
      icon: <BarChartOutlined />, color: '#38bdf8',
      title: 'Аналитика',
      desc: 'Динамика спортсмена (изменение показателей со временем), сравнение до/после нагрузки, сравнение группы, AI-рекомендации. Помогает оценить эффективность тренировочного процесса.',
    },
    {
      icon: <FileTextOutlined />, color: '#a78bfa',
      title: 'Отчёты',
      desc: 'Список всех тестовых сессий. Фильтрация по спортсмену и статусу. Выгрузка в CSV для анализа в Excel или других программах.',
    },
    {
      icon: <SafetyOutlined />, color: '#f87171',
      title: 'Админ панель',
      desc: 'Управление пользователями (добавление, редактирование, роли), CRUD видов спорта, создание протоколов тестирования, журнал аудита системы. Только для роли администратора.',
    },
  ],
  en: [
    {
      icon: <DashboardOutlined />, color: '#6366f1',
      title: 'Dashboard',
      desc: 'System overview: user count, athletes, sessions and monthly activity statistics. Quickly assess the system state via charts and graphs.',
    },
    {
      icon: <TeamOutlined />, color: '#22c55e',
      title: 'Athletes',
      desc: 'Full list of athletes. Add, edit, assign to sport type and team. View each athlete\'s test session history and performance indicators.',
    },
    {
      icon: <ExperimentOutlined />, color: '#f59e0b',
      title: 'Test Sessions',
      desc: 'Tests conducted with the UDS sensor. Create sessions, enter sensor data (F, t, S), and UDS formulas are computed automatically (Fmax, J, Q, G, Vmax, Nmax). Complete and validate sessions.',
    },
    {
      icon: <BarChartOutlined />, color: '#38bdf8',
      title: 'Analytics',
      desc: 'Athlete dynamics (indicator changes over time), pre/post-load comparison, group comparison, AI recommendations. Helps evaluate training effectiveness.',
    },
    {
      icon: <FileTextOutlined />, color: '#a78bfa',
      title: 'Reports',
      desc: 'Complete list of test sessions. Filter by athlete and status. Download as CSV for analysis in Excel or other tools.',
    },
    {
      icon: <SafetyOutlined />, color: '#f87171',
      title: 'Admin Panel',
      desc: 'User management (add, edit, assign roles), sport types CRUD, test protocol creation, system audit log. Administrator role only.',
    },
  ],
};

const ROLES = {
  uz: [
    { role: 'Administrator', color: '#f87171', desc: 'To\'liq huquq. Foydalanuvchilar, sozlamalar va barcha ma\'lumotlarga kirish.' },
    { role: 'Tadqiqotchi', color: '#a78bfa', desc: 'Analitika, protokollar yaratish va barcha sessiyalarni ko\'rish.' },
    { role: 'Murabbiy', color: '#60a5fa', desc: 'O\'z sportchilarini boshqarish, sessiya ko\'rish va tahlil.' },
    { role: 'Operator', color: '#34d399', desc: 'Test sessiyalarini yaratish va sensor ma\'lumotlarini kiritish.' },
    { role: 'Sportchi', color: '#fbbf24', desc: 'Faqat o\'z sessiyalari va ko\'rsatkichlarini ko\'rish.' },
  ],
  ru: [
    { role: 'Администратор', color: '#f87171', desc: 'Полный доступ. Пользователи, настройки и все данные.' },
    { role: 'Исследователь', color: '#a78bfa', desc: 'Аналитика, создание протоколов и просмотр всех сессий.' },
    { role: 'Тренер', color: '#60a5fa', desc: 'Управление своими спортсменами, просмотр и анализ сессий.' },
    { role: 'Оператор', color: '#34d399', desc: 'Создание тест-сессий и ввод данных сенсора.' },
    { role: 'Спортсмен', color: '#fbbf24', desc: 'Просмотр только своих сессий и показателей.' },
  ],
  en: [
    { role: 'Administrator', color: '#f87171', desc: 'Full access. Users, settings and all data.' },
    { role: 'Researcher', color: '#a78bfa', desc: 'Analytics, protocol creation and viewing all sessions.' },
    { role: 'Coach', color: '#60a5fa', desc: 'Manage own athletes, view and analyze sessions.' },
    { role: 'Operator', color: '#34d399', desc: 'Create test sessions and enter sensor data.' },
    { role: 'Athlete', color: '#fbbf24', desc: 'View only own sessions and indicators.' },
  ],
};

const INTRO = {
  uz: {
    title: 'SportUDS — Sport Monitoring Tizimi',
    sub: 'UDS texnologiyasi va Sun\'iy Intellekt asosida sportchilar kuch va tezkor-kuch ko\'rsatkichlarini monitoring qilish tizimi.',
    what: 'UDS (Universal Diagnostic System) sensori sportchining mushaklariga qo\'yiladi va maksimal kuch (Fmax), vaqt (tmax), siljish (S) ko\'rsatkichlarini o\'lchaydi. Tizim bu ma\'lumotlar asosida P₀, J, Q, G, Vmax, Nmax kabi murakkab formulalarni avtomatik hisoblaydi va sportchining jismoniy tayyorgarlik darajasini aniqlaydi.',
    howTitle: 'Qanday foydalanish kerak?',
    steps: [
      'Sportchi qo\'shing → "Sportchilar" bo\'limidan yangi sportchi registratsiyasini amalga oshiring',
      'Protokol tanlang → Testdan oldin "Admin Panel → Protokollar" dan test turini belgilang',
      'Test sessiyasini boshlang → "Test Sessiyalari → Yangi test" dan operatsiyani ishga tushiring',
      'Sensor ma\'lumotlarini kiriting → Har bir urinish uchun F(N), t(ms), S(m) qiymatlarini kiriting',
      'Natijalarni ko\'ring → Sessiya yakunlangach ko\'rsatkichlar avtomatik hisoblanadi',
      'Analitika → Dinamikani kuzating, AI tavsiyasini oling',
    ],
  },
  ru: {
    title: 'SportUDS — Система мониторинга спортсменов',
    sub: 'Система мониторинга силовых и скоростно-силовых показателей спортсменов на основе технологии UDS и ИИ.',
    what: 'Датчик UDS (Universal Diagnostic System) устанавливается на мышцы спортсмена и измеряет максимальную силу (Fmax), время (tmax) и смещение (S). Система автоматически вычисляет сложные формулы: P₀, J, Q, G, Vmax, Nmax — и определяет уровень физической подготовленности.',
    howTitle: 'Как использовать?',
    steps: [
      'Добавьте спортсмена → Зарегистрируйте нового спортсмена в разделе "Спортсмены"',
      'Выберите протокол → В "Админ панель → Протоколы" задайте вид теста',
      'Начните тест-сессию → "Тест-сессии → Новый тест" — запустите операцию',
      'Введите данные сенсора → Для каждой попытки введите F(N), t(ms), S(m)',
      'Смотрите результаты → После завершения сессии показатели рассчитываются автоматически',
      'Аналитика → Следите за динамикой, получите AI-рекомендацию',
    ],
  },
  en: {
    title: 'SportUDS — Sport Monitoring System',
    sub: 'A system for monitoring strength and speed-strength indicators of athletes using UDS technology and AI.',
    what: 'The UDS (Universal Diagnostic System) sensor is placed on the athlete\'s muscles and measures maximum force (Fmax), time (tmax), and displacement (S). The system automatically calculates complex formulas: P₀, J, Q, G, Vmax, Nmax — and determines the athlete\'s physical fitness level.',
    howTitle: 'How to use?',
    steps: [
      'Add an athlete → Register a new athlete in the "Athletes" section',
      'Select a protocol → In "Admin Panel → Protocols", define the test type',
      'Start a test session → "Test Sessions → New Test" — launch the operation',
      'Enter sensor data → For each attempt, enter F(N), t(ms), S(m) values',
      'View results → After the session ends, indicators are calculated automatically',
      'Analytics → Track dynamics, get an AI recommendation',
    ],
  },
};

export default function InfoModal({ open, onClose }) {
  const { lang } = useLang();
  const l = lang in INTRO ? lang : 'uz';
  const intro = INTRO[l];
  const sections = SECTIONS[l];
  const roles = ROLES[l];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={780}
      title={
        <Space>
          <RocketOutlined style={{ color: '#6366f1', fontSize: 18 }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>{intro.title}</span>
        </Space>
      }
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto', paddingRight: 8 } }}
    >
      <Typography>
        {/* Intro */}
        <Paragraph style={{ fontSize: 15, marginBottom: 4 }}>{intro.sub}</Paragraph>

        <Divider orientation="left">
          <Space><ApiOutlined />{lang === 'ru' ? 'Технология UDS' : lang === 'en' ? 'UDS Technology' : 'UDS Texnologiyasi'}</Space>
        </Divider>
        <Paragraph style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{intro.what}</Paragraph>

        {/* Formulas */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {['P₀=Fmax', 'J=Fmax/tmax', 'Q=0.5Fmax/t₁', 'G=0.5Fmax/t₂', 'Vmax=S/tmax', 'Nmax=Fmax×Vmax'].map(f => (
            <Tag key={f} color="purple" style={{ fontFamily: 'monospace', fontSize: 13, padding: '2px 10px' }}>{f}</Tag>
          ))}
        </div>

        <Divider orientation="left">
          <Space><BulbOutlined />{intro.howTitle}</Space>
        </Divider>
        <div style={{ marginBottom: 16 }}>
          {intro.steps.map((step, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 700,
              }}>{i + 1}</div>
              <Text style={{ lineHeight: 1.6 }}>{step}</Text>
            </div>
          ))}
        </div>

        {/* Sections */}
        <Divider orientation="left">
          <Space><DashboardOutlined />Bo'limlar / Разделы / Sections</Space>
        </Divider>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {sections.map((s, i) => (
            <Col xs={24} sm={12} key={i}>
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'var(--bg-card-hover)',
                border: '1px solid var(--border)',
              }}>
                <Space style={{ marginBottom: 6 }}>
                  <span style={{ color: s.color, fontSize: 16 }}>{s.icon}</span>
                  <Text strong style={{ fontSize: 14 }}>{s.title}</Text>
                </Space>
                <Paragraph style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                  {s.desc}
                </Paragraph>
              </div>
            </Col>
          ))}
        </Row>

        {/* Roles */}
        <Divider orientation="left">
          <Space><UserOutlined />Rollar / Роли / Roles</Space>
        </Divider>
        <div>
          {roles.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '8px 0', borderBottom: '1px solid var(--border)',
            }}>
              <Tag color={r.color} style={{ minWidth: 100, textAlign: 'center', marginTop: 2 }}>{r.role}</Tag>
              <Text style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>{r.desc}</Text>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <Text style={{ color: '#6366f1', fontSize: 13 }}>
            <TrophyOutlined style={{ marginRight: 6 }} />
            SportUDS · UDS & AI · 2025
          </Text>
        </div>
      </Typography>
    </Modal>
  );
}
