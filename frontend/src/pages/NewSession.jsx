import { useEffect, useState } from 'react';
import {
  Card, Form, Select, DatePicker, Input, InputNumber, Button,
  Typography, Row, Col, message, Steps, Alert, Space, Tag,
} from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { athletesAPI, sessionsAPI, analyticsAPI } from '../services/api';
import { useLang } from '../context/LangContext';

const { Title, Text } = Typography;
const { Option } = Select;

export default function NewSession() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [athletes, setAthletes] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [sensorInput, setSensorInput] = useState('');
  const [calculatedResult, setCalculatedResult] = useState(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    athletesAPI.getAll({ limit: 100 }).then((r) => setAthletes(r.data.data));
    analyticsAPI.getProtocols().then((r) => setProtocols(r.data.data));
    const athleteId = searchParams.get('athlete_id');
    if (athleteId) form.setFieldValue('athlete_id', athleteId);
  }, [lang]);

  const createSession = async (values) => {
    setLoading(true);
    try {
      const res = await sessionsAPI.create({
        ...values,
        session_date: values.session_date?.toISOString(),
      });
      setSessionId(res.data.data.id);
      setCurrentStep(1);
      message.success(t('sessions.createSession'));
    } catch (err) {
      message.error(err.response?.data?.error || t('sessions.loadError'));
    } finally { setLoading(false); }
  };

  const parseSensorData = (text) => {
    const lines = text.trim().split('\n');
    const timeMs = [], forceValues = [], dispValues = [];
    for (const line of lines) {
      const parts = line.trim().split(/[,;\t\s]+/);
      if (parts.length >= 2) {
        const t = parseFloat(parts[0]);
        const f = parseFloat(parts[1]);
        const d = parts[2] ? parseFloat(parts[2]) : 0;
        if (!isNaN(t) && !isNaN(f)) {
          timeMs.push(t);
          forceValues.push(f);
          dispValues.push(d);
        }
      }
    }
    return { timeMs, forceValues, dispValues };
  };

  const saveSensorData = async () => {
    if (!sensorInput.trim()) { message.warning(t('sessions.sensorData')); return; }
    const { timeMs, forceValues, dispValues } = parseSensorData(sensorInput);
    if (timeMs.length < 2) {
      message.error(t('sessions.loadError'));
      return;
    }
    setLoading(true);
    try {
      const res = await sessionsAPI.saveSensorData(sessionId, {
        attempt_number: attemptNumber,
        time_ms: timeMs,
        force_values: forceValues,
        displacement_values: dispValues,
        sampling_rate: 1000,
      });
      setCalculatedResult(res.data.data);
      setAttemptNumber((prev) => prev + 1);
      setSensorInput('');
      message.success(`${attemptNumber} ${t('sessions.attempt')}`);
    } catch (err) {
      message.error(err.response?.data?.error || t('sessions.loadError'));
    } finally { setLoading(false); }
  };

  const finishSession = async () => {
    setLoading(true);
    try {
      await sessionsAPI.complete(sessionId);
      message.success(t('sessions.completed'));
      navigate(`/sessions/${sessionId}`);
    } catch { message.error(t('sessions.loadError')); }
    finally { setLoading(false); }
  };

  const steps = [
    { title: t('sessions.session') },
    { title: t('sessions.sensorData') },
    { title: t('indicators.title') },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Button onClick={() => navigate('/sessions')}>← {t('common.back')}</Button>
        <Title level={4} style={{ display: 'inline', marginLeft: 16 }}>{t('sessions.newSession')}</Title>
      </div>

      <Steps current={currentStep} items={steps} style={{ marginBottom: 32 }} />

      {currentStep === 0 && (
        <Card title={t('sessions.session')}>
          <Form form={form} layout="vertical" onFinish={createSession}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="athlete_id" label={t('athletes.title')} rules={[{ required: true }]}>
                  <Select showSearch placeholder={t('analytics.selectAthlete')} optionFilterProp="children">
                    {athletes.map((a) => <Option key={a.id} value={a.id}>{a.full_name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="protocol_id" label={t('sessions.protocol')} rules={[{ required: true }]}>
                  <Select placeholder={t('protocols.title')}>
                    {protocols.map((p) => <Option key={p.id} value={p.id}>{p.name_localized || p.name_uz || p.name} ({p.test_type})</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="training_context" label={t('sessions.context')} rules={[{ required: true }]}>
                  <Select>
                    <Option value="diagnostic">{t('sessions.contexts.diagnostic')}</Option>
                    <Option value="pre_load">{t('sessions.contexts.pre_load')}</Option>
                    <Option value="post_load">{t('sessions.contexts.post_load')}</Option>
                    <Option value="stage_monitoring">{t('sessions.contexts.stage_monitoring')}</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="session_date" label={t('sessions.date')}>
                  <DatePicker showTime style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="body_weight" label={t('sessions.bodyWeight')}>
                  <InputNumber min={30} max={200} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="heart_rate" label={t('sessions.heartRate')}>
                  <InputNumber min={40} max={220} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="subjective_state" label={t('sessions.subjectiveState')}>
                  <InputNumber min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="notes" label={t('sessions.notes')}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
            <Button type="primary" htmlType="submit" loading={loading}>{t('sessions.createSession')}</Button>
          </Form>
        </Card>
      )}

      {currentStep === 1 && (
        <Card title={`${t('sessions.sensorData')} — ${attemptNumber} ${t('sessions.attempt')}`}>
          <Alert
            type="info"
            message={`${t('sessions.sensorData')}: time(ms), force(N) [, displacement(m)]`}
            style={{ marginBottom: 16 }}
          />
          <Text code style={{ display: 'block', marginBottom: 8 }}>
            0, 0.0{'\n'}10, 45.5{'\n'}20, 120.3
          </Text>
          <Input.TextArea
            value={sensorInput}
            onChange={(e) => setSensorInput(e.target.value)}
            rows={12}
            placeholder={t('sessions.sensorData') + '...'}
            style={{ fontFamily: 'monospace', marginBottom: 16 }}
          />

          {calculatedResult && (
            <Alert
              type="success"
              message={t('indicators.title')}
              description={
                <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
                  {[
                    ['Fmax', calculatedResult.fMax, 'N'],
                    ['tmax', calculatedResult.tMax, 'ms'],
                    ['J', calculatedResult.j, ''],
                    ['Q', calculatedResult.q, ''],
                    ['G', calculatedResult.g, ''],
                    ['Vmax', calculatedResult.vMax, 'm/s'],
                    ['Nmax', calculatedResult.nMax, 'W'],
                  ].map(([name, val, unit]) => (
                    <Col key={name} span={6}>
                      <Tag color="blue">{name}: {val ? parseFloat(val).toFixed(3) : '—'} {unit}</Tag>
                    </Col>
                  ))}
                </Row>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Space>
            <Button type="primary" onClick={saveSensorData} loading={loading}>
              {attemptNumber} {t('sessions.attempt')} — {t('common.save')}
            </Button>
            <Button type="default" onClick={finishSession} disabled={attemptNumber === 1}>
              {t('sessions.complete')}
            </Button>
          </Space>
        </Card>
      )}
    </div>
  );
}
