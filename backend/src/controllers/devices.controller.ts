import { Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { provisionDevice, deprovisionDevice, startOta } from '../services/mqtt.service';

// devices.controller.ts — trenajor IoT qurilmalarini boshqarish (energolink vehicle-service roli).
// Qurilma yaratilganda mqtt-service'da MQTT akkaunt provizion qilinadi va credential qaytariladi
// (jismoniy qurilmaga shu bilan flash qilinadi). OTA yangilanishni ham shu yerdan boshlaymiz.

// randomDeviceUid — 32-bitli musbat identifikator (telemetriya payload.id bilan mos, u uint32).
function randomDeviceUid(): number {
  // 1..2^31-1 oralig'i (BIGINT ustunga xavfsiz, ishorasiz).
  return crypto.randomInt(1, 2 ** 31 - 1);
}

function randomPassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// GET /api/devices — qurilmalar ro'yxati (parolsiz).
export const listDevices = async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT d.id, d.device_uid, d.mqtt_client_id, d.status, d.ota_version,
             d.last_seen, d.machine_id, m.name AS machine_name
      FROM devices d
      LEFT JOIN machines m ON m.id = d.machine_id
      ORDER BY d.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// POST /api/devices — qurilma yaratish + MQTT akkaunt provizion.
// Body: { machine_id?: uuid }. Javob credential'ni BIR MARTA qaytaradi (qurilmaga flash uchun).
export const registerDevice = async (req: Request, res: Response) => {
  const { machine_id } = req.body as { machine_id?: string };
  try {
    if (machine_id) {
      const m = await query('SELECT id FROM machines WHERE id = $1', [machine_id]);
      if (m.rowCount === 0) {
        res.status(404).json({ success: false, error: 'Trenajor topilmadi' });
        return;
      }
    }

    const deviceUid = randomDeviceUid();
    const clientId = `machine-${deviceUid}`;
    const password = randomPassword();
    const textname = machine_id ? `SportUDS machine ${machine_id}` : `SportUDS device ${deviceUid}`;

    // Mosquitto Dynamic Security akkaunt (best-effort: DEV anonim brokerda o'tkazib yuboriladi).
    const prov = await provisionDevice(clientId, password, textname);
    if (!prov.ok) {
      res.status(502).json({ success: false, error: `MQTT provisioning xatosi: ${prov.error}` });
      return;
    }

    const { rows } = await query(
      `INSERT INTO devices (device_uid, machine_id, mqtt_client_id, mqtt_password, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, device_uid, mqtt_client_id, status`,
      [deviceUid, machine_id || null, clientId, password],
    );

    res.status(201).json({
      success: true,
      data: rows[0],
      // credential faqat shu javobda ko'rsatiladi — qurilmaga flash qiling.
      credentials: { mqtt_client_id: clientId, mqtt_password: password, device_uid: deviceUid },
      provisioning: prov.skipped ? 'skipped (DEV anonymous broker)' : 'ok',
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      res.status(409).json({ success: false, error: 'device_uid/client_id to\'qnashuvi, qayta urinib ko\'ring' });
      return;
    }
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// POST /api/devices/:id/assign — device'ni trenajorga biriktirish yoki uzish (1:1 ixtiyoriy).
// Body: { machine_id: uuid | null }. null → uzish. Har trenajorda ko'pi bilan 1 device (008 unique).
export const assignDevice = async (req: Request, res: Response) => {
  const { machine_id } = req.body as { machine_id?: string | null };
  try {
    const dev = await query('SELECT id FROM devices WHERE id = $1', [req.params.id]);
    if (dev.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Qurilma topilmadi' });
      return;
    }
    if (machine_id) {
      const m = await query('SELECT id FROM machines WHERE id = $1', [machine_id]);
      if (m.rowCount === 0) {
        res.status(404).json({ success: false, error: 'Trenajor topilmadi' });
        return;
      }
    }
    const { rows } = await query(
      `UPDATE devices SET machine_id = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, device_uid, mqtt_client_id, status, machine_id`,
      [machine_id || null, req.params.id],
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      res.status(409).json({ success: false, error: 'Bu trenajorda allaqachon qurilma biriktirilgan' });
      return;
    }
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// GET /api/machine/:id/device — trenajorga biriktirilgan device + oxirgi telemetriya (jonli ko'rsatish).
export const getMachineDevice = async (req: Request, res: Response) => {
  try {
    const d = await query(
      `SELECT id, device_uid, mqtt_client_id, status, ota_version, last_seen
       FROM devices WHERE machine_id = $1`,
      [req.params.id],
    );
    if (d.rowCount === 0) {
      res.json({ success: true, data: null });   // biriktirilmagan — normal holat
      return;
    }
    const device = d.rows[0];
    const tRes = await query(
      `SELECT bar_cm, weight_kg, reps, speed, heart_rate, ver, received_at
       FROM machine_telemetry WHERE device_uid = $1
       ORDER BY received_at DESC LIMIT 1`,
      [device.device_uid],
    );
    res.json({ success: true, data: { ...device, latest: tRes.rows[0] || null } });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// DELETE /api/devices/:id — qurilmani va MQTT akkauntini o'chirish.
export const deleteDevice = async (req: Request, res: Response) => {
  try {
    const { rows } = await query('SELECT mqtt_client_id FROM devices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Qurilma topilmadi' });
      return;
    }
    await deprovisionDevice(rows[0].mqtt_client_id);
    await query('DELETE FROM devices WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// POST /api/devices/:id/ota — qurilmaga OTA yangilanishni boshlash. Body: { firmware_id: uuid }.
export const triggerOta = async (req: Request, res: Response) => {
  const { firmware_id } = req.body as { firmware_id?: string };
  if (!firmware_id) {
    res.status(400).json({ success: false, error: 'firmware_id talab qilinadi' });
    return;
  }
  try {
    const { rows } = await query('SELECT device_uid FROM devices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Qurilma topilmadi' });
      return;
    }
    const result = await startOta(Number(rows[0].device_uid), firmware_id);
    if (!result.ok) {
      if (result.conflict) {
        res.status(409).json({ success: false, error: 'Allaqachon aktiv OTA sessiyasi bor' });
        return;
      }
      res.status(502).json({ success: false, error: `OTA boshlash xatosi: ${result.error}` });
      return;
    }
    res.status(202).json({ success: true, session_id: result.sessionId });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
