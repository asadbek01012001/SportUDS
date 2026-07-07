import { api } from "./client";

// OTA: репозиторий прошивок (KAN-29/30) + реестр устройств (KAN-31).

export interface Firmware {
  id: string;
  ver_major: number;
  ver_minor: number;
  version: string;
  target: string;
  fw_size: number;        // размер image_A, байт
  fw_crc32: number;       // CRC image_A (uint32)
  fw_size_b?: number;     // размер image_B (нет → legacy single)
  fw_crc32_b?: number;    // CRC image_B
  pair_check?: string;        // ok | failed | pending | "" (legacy single)
  pair_check_detail?: string; // причина результата сверки пары A/B (§7.2)
  release_notes?: string;
  status: string;  // draft / beta / stable / deprecated (§3.2)
  channel: string; // stable / beta (legacy)
  uploaded_by?: string;
  created_at: string;
}

export interface DeviceRegistryEntry {
  id: string;
  device_uid: number;
  client_id: string;
  name?: string;
  status: string;
  organization_id?: string;
  vehicle_plate?: string;
  current_version?: string; // из телеметрии ver
  last_seen?: string;
}

export interface FirmwareHistoryEntry {
  id: string;
  version: string;
  result: string; // pending / success / rolled-back / failed
  created_at: string;
}

// OtaSession — строка журнала/мониторинга OTA (§6/§7).
export interface OtaSession {
  id: string;
  device_uid: number;
  client_id?: string;
  vehicle_plate?: string;
  organization_id?: string;
  organization_name?: string;
  version: string;            // отправленная
  launched_version?: string;  // реально запущенная (health-check)
  status: string;             // offered/downloading/applying/success/failed/rolled-back
  current_seq: number;
  frames_total: number;
  error?: string;
  created_at: string;
  updated_at: string;
}

// Rollout — кампания массовой раскатки (§5).
export interface Rollout {
  id: string;
  organization_id: string;
  organization_name?: string;
  version: string;
  level: string;            // normal/priority/force
  status: string;           // running/completed/stopped
  total: number;
  done: number;             // success+failed
  success: number;
  failed: number;
  created_at: string;
}

export const otaApi = {
  firmwares: () => api.get<{ data: Firmware[]; total: number }>("/firmwares"),
  uploadFirmware: (form: FormData) => api.postForm<Firmware>("/firmwares", form),
  patchFirmware: (id: string, body: { status?: string; channel?: string; release_notes?: string }) =>
    api.patch<Firmware>(`/firmwares/${id}`, body),
  deleteFirmware: (id: string) => api.del<{ status: string }>(`/firmwares/${id}`),

  devices: () => api.get<{ data: DeviceRegistryEntry[]; total: number }>("/device-registry"),
  sessions: () => api.get<{ data: OtaSession[]; total: number }>("/ota/sessions"),
  rollouts: () => api.get<{ data: Rollout[]; total: number }>("/ota/rollouts"),
  createRollout: (body: { firmware_id: string; organization_id: string; level: string }) =>
    api.post<{ id: string; targets: number }>("/ota/rollouts", body),
  history: (uid: number) =>
    api.get<{ data: FirmwareHistoryEntry[]; total: number }>(`/device-registry/${uid}/history`),
  // KAN-32: назначить обновление устройству (создаёт offered-сессию + MQTT-триггер).
  startUpdate: (uid: number, firmwareId: string) =>
    api.post<{ status: string; device_uid: number; firmware_id: string }>(
      `/device-registry/${uid}/update`,
      { firmware_id: firmwareId }
    ),
};
