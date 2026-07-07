// mqtt.service.ts — mqtt-service (Go) /internal/* endpointlariga HTTP klient.
// SportUDS backend energolink'dagi vehicle-service rolini bajaradi: trenajor qurilmasi
// yaratilganda unga MQTT akkaunt (Dynamic Security) provizion qiladi va OTA yangilanishni boshlaydi.
// Bearer INTERNAL_SERVICE_TOKEN orqali (mqtt-service bilan shared).

const BASE_URL = process.env.MQTT_SERVICE_URL || 'http://localhost:8087';
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  };
}

// enabled — token berilmagan bo'lsa integratsiya o'chiq (DEV: anonim broker). Provizion chaqiruvlari
// bexatar o'tkazib yuboriladi.
export const mqttIntegrationEnabled = (): boolean => TOKEN !== '';

export interface ProvisionResult {
  ok: boolean;
  skipped?: boolean;   // integratsiya o'chiq yoki mqtt-service dynsec'siz — best-effort o'tkazib yuborildi
  error?: string;
}

// provisionDevice — Mosquitto Dynamic Security'da qurilma uchun MQTT akkaunt yaratadi
// (username = clientId, o'z role + literal ACL devices/<clientId>/#). Best-effort: mqtt-service
// javob bermasa/dynsec o'chiq bo'lsa, qurilma yozuvi baribir yaratiladi (DEV anonim broker).
export async function provisionDevice(
  clientId: string,
  password: string,
  textname: string,
): Promise<ProvisionResult> {
  if (!mqttIntegrationEnabled()) return { ok: true, skipped: true };
  try {
    const r = await fetch(`${BASE_URL}/internal/mqtt/clients`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ client_id: clientId, password, textname }),
    });
    // 404 — mqtt-service'da Dynamic Security o'chiq (DEV anonim broker): route ro'yxatdan o'tmagan.
    // Bu DEV uchun normal — best-effort o'tkazib yuboramiz (qurilma yozuvi baribir yaratiladi).
    if (r.status === 404) return { ok: true, skipped: true };
    if (!r.ok) return { ok: false, error: `mqtt-service ${r.status}: ${await r.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setDevicePassword(clientId: string, password: string): Promise<ProvisionResult> {
  if (!mqttIntegrationEnabled()) return { ok: true, skipped: true };
  try {
    const r = await fetch(`${BASE_URL}/internal/mqtt/clients/${encodeURIComponent(clientId)}/password`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ password }),
    });
    if (r.status === 404) return { ok: true, skipped: true };
    if (!r.ok) return { ok: false, error: `mqtt-service ${r.status}: ${await r.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deprovisionDevice(clientId: string): Promise<ProvisionResult> {
  if (!mqttIntegrationEnabled()) return { ok: true, skipped: true };
  try {
    const r = await fetch(`${BASE_URL}/internal/mqtt/clients/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (r.status === 404) return { ok: true, skipped: true };
    if (!r.ok && r.status !== 204) return { ok: false, error: `mqtt-service ${r.status}: ${await r.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface OtaStartResult {
  ok: boolean;
  sessionId?: string;
  conflict?: boolean;  // 409 — allaqachon aktiv OTA sessiyasi bor
  error?: string;
}

// startOta — mqtt-service'ga OTA yangilanishni boshlashni buyuradi: offered-sessiya yaratiladi va
// qurilmaga MQTT-trigger (devices/<id>/OTA/cmd) publish qilinadi.
export async function startOta(deviceUid: number, firmwareId: string): Promise<OtaStartResult> {
  if (!mqttIntegrationEnabled()) return { ok: false, error: 'mqtt-service integration disabled (INTERNAL_SERVICE_TOKEN not set)' };
  try {
    const r = await fetch(`${BASE_URL}/internal/ota/start`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ device_uid: deviceUid, firmware_id: firmwareId }),
    });
    if (r.status === 409) return { ok: false, conflict: true, error: 'another OTA update is already in progress' };
    if (r.status !== 202) return { ok: false, error: `mqtt-service ${r.status}: ${await r.text()}` };
    const body = (await r.json()) as { session_id?: string };
    return { ok: true, sessionId: body.session_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
