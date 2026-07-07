import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import http from 'http';
import { networkInterfaces } from 'os';

import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import athletesRoutes from './routes/athletes.routes';
import sessionsRoutes from './routes/sessions.routes';
import analyticsRoutes from './routes/analytics.routes';
import hallsRoutes from './routes/halls.routes';
import supervisorRoutes from './routes/supervisor.routes';
import machineRoutes from './routes/machine.routes';
import athleteAuthRoutes from './routes/athleteAuth.routes';
import teamsRoutes from './routes/teams.routes';
import devicesRoutes from './routes/devices.routes';

import { initSocket } from './socket';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// app.use(helmet({
//   crossOriginResourcePolicy: { policy: "cross-origin" },
//   contentSecurityPolicy: false
// }));
app.use(cors({ origin: '*', credentials: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/athletes', athletesRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/halls', hallsRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/machine', machineRoutes);
app.use('/api/athlete', athleteAuthRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/devices', devicesRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// QR kod skanerlanganda kamera brauzer ochadi → bu sahifa deep link orqali ilovaga yo'naltiradi
app.get('/scan', (req, res) => {
  const token = req.query.token as string | undefined;
  const machine = req.query.machine as string | undefined;
  // Trenajor QR (machine) yoki eski token oqimi
  const qs = machine ? `machine=${machine}` : `token=${token}`;
  const deepLink = `sportuds://scan?${qs}`;
  // Android intent URL - Chrome/Android 12+ da ishonchli ishlaydi
  const intentUrl = `intent://scan?${qs}#Intent;scheme=sportuds;package=com.sportuds.app;end`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SportUDS</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#060a14;height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif}
    .wrap{text-align:center;padding:32px}
    .logo{width:72px;height:72px;border-radius:20px;background:#1e40af;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:24px;font-weight:900;color:#fff;letter-spacing:1px}
    .title{color:#f1f5f9;font-size:24px;font-weight:800;margin-bottom:8px}
    .sub{color:#475569;font-size:14px;line-height:1.6;margin-bottom:32px}
    .btn{display:inline-block;background:#1d4ed8;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:14px;text-decoration:none;letter-spacing:0.3px}
    .hint{color:#334155;font-size:12px;margin-top:20px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">UDS</div>
    <div class="title">SportUDS</div>
    <div class="sub">Mashg'ulotni boshlash uchun<br>ilovani oching</div>
    <a class="btn" href="${intentUrl}">Ilovani ochish</a>
    <div class="hint">Ilova o'rnatilmagan bo'lsa, avval o'rnating</div>
  </div>
  <script>
    // sportuds:// sxemasi bilan ham urinib ko'r (fallback)
    setTimeout(function(){ window.location.href = '${deepLink}'; }, 500);
  </script>
</body>
</html>`);
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route topilmadi' });
});

const server = http.createServer(app);
initSocket(server);

function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log(`SportUDS Backend ${PORT}-portda ishlamoqda`);
  console.log(`Local:   http://localhost:${PORT}/api/health`);
  console.log(`Network: http://${ip}:${PORT}/api/health`);
  console.log(`Mobile APP_BASE_URL: http://${ip}:${PORT}`);
});

export default app;
