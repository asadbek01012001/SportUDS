import { api } from "./client";
import type { Device, CreateDeviceRequest, UpdateDeviceRequest, DeviceListResponse } from "./types";

export const devicesApi = {
  getFree: () =>
    api.get<{ data: any[] }>("/devices/free"),

  getAll: (page = 1, limit = 50) =>
    api.get<DeviceListResponse>(`/devices?page=${page}&limit=${limit}`),

  getByID: (id: string) => api.get<Device>(`/devices/${id}`),

  getTelemetry: (id: string, limit = 20, offset = 0) =>
    api.get<{ data: Array<Record<string, unknown>>; total: number }>(`/devices/${id}/telemetry?limit=${limit}&offset=${offset}`),

  // Backend возвращает {device, mqtt_password} (plaintext один раз).
  // Fallback: при выключенной DynSec integration — просто Device без поля password.
  create: (data: CreateDeviceRequest) =>
    api.post<{ device: Device; mqtt_password?: string } | Device>("/devices", data),

  update: (id: string, data: UpdateDeviceRequest) => api.put<Device>(`/devices/${id}`, data),

  delete: (id: string) => api.del<void>(`/devices/${id}`),

  // Per-device MQTT credentials (Plan 30): reveal текущего пароля и ротация.
  revealPassword: (id: string) =>
    api.get<{ mqtt_password: string }>(`/devices/${id}/mqtt-password`),

  rotatePassword: (id: string) =>
    api.post<{ mqtt_password: string }>(`/devices/${id}/rotate-mqtt-password`, {}),
};

export const fleetApi = {
  // Biriktirilmagan haydovchilar
  getAvailableDrivers: () =>
    api.get<{ data: any[] }>("/vehicles/available/drivers"),

  // Biriktirilmagan devicelar
  getAvailableDevices: () =>
    api.get<{ data: any[] }>("/vehicles/available/devices"),

  // Mashinaga haydovchi biriktirish (driverId="" => ajratish)
  assignDriver: (vehicleId: string, driverId: string) =>
    api.post<any>(`/vehicles/${vehicleId}/assign-driver`, { driver_id: driverId }),

  // Mashinaga device biriktirish (deviceId="" => ajratish)
  assignDevice: (vehicleId: string, deviceId: string) =>
    api.post<any>(`/vehicles/${vehicleId}/assign-device`, { device_id: deviceId }),
};
