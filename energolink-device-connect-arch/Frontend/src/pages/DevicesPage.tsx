import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Cpu, Plus, MoreHorizontal, Pencil, Trash2, Loader2, Wifi, WifiOff, Key, RefreshCw, Eye, Copy, Settings, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DeviceTelemetryModal } from "../components/DeviceTelemetryModal";
import { devicesApi, organizationsApi } from "../api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useViewOrg } from "../hooks/useViewOrg";
import { useDeviceTelemetry } from "../hooks/useTrips";
import { useTranslation } from "../lib/i18n";
import type { Device, DeviceType } from "../api/types";
import type { Organization } from "../api/organizations";

// Regex для валидации mqtt_client_id (соответствует CHECK constraint миграции 27).
const IMEI_RE = /^\d{15}$/;
const SERIAL_RE = /^[A-Za-z0-9-]{1,50}$/;

interface DeviceForm {
  device_uid: string;
  device_type: DeviceType;
  client_input: string;        // IMEI (для lte) или serial (для serial)
  organization_id: string;
  name: string;
  status: string;
}

const EMPTY_FORM: DeviceForm = {
  device_uid: "", device_type: "lte", client_input: "",
  organization_id: "", name: "", status: "active",
};

export function DevicesPage() {
  const { t } = useTranslation();
  const { hasMinRole, role: myRole } = useCurrentUser();
  const { isDemo } = useViewOrg();
  const canEdit = hasMinRole("manager") && !isDemo;
  const canDelete = hasMinRole("admin") && !isDemo;
  const isSuperadmin = myRole === "superadmin";

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<DeviceForm>(EMPTY_FORM);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [selectedDeviceForTelemetry, setSelectedDeviceForTelemetry] = useState<string | null>(null);
  // MQTT password — модалка показа plaintext'а (после create, reveal, rotate)
  const [pwdModal, setPwdModal] = useState<{ clientId: string; password: string; action: "created" | "revealed" | "rotated" } | null>(null);
  const [pwdBusy, setPwdBusy] = useState<string | null>(null); // device id
  const [rotateTarget, setRotateTarget] = useState<Device | null>(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [telPage, setTelPage] = useState(1);
  const PAGE_SIZE = 20;
  const { logs: telemetryLogs, loading: telemetryLoading, total: telTotalFromHook } = useDeviceTelemetry(
    selectedDeviceForTelemetry ? `${selectedDeviceForTelemetry}` : undefined,
    PAGE_SIZE,
    (telPage - 1) * PAGE_SIZE
  );
  const telTotalPages = Math.ceil((telTotalFromHook ?? 0) / PAGE_SIZE);

  const fetch = () => {
    setLoading(true);
    devicesApi.getAll()
      .then(r => setDevices(r.data || []))
      .catch(() => toast.error(t("loadingError")))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  useEffect(() => {
    if (!openMenu && !bulkMenuOpen) return;
    const close = () => { setOpenMenu(null); setBulkMenuOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu, bulkMenuOpen]);

  const handleBulkStatus = async (targetStatus: "active" | "inactive") => {
    setBulkMenuOpen(false);
    const toUpdate = devices.filter(d => d.status !== targetStatus);
    if (toUpdate.length === 0) {
      toast.info(t(targetStatus === "active" ? "allDevicesAlreadyActive" : "allDevicesAlreadyInactive"));
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(toUpdate.map(d => devicesApi.update(d.id, { status: targetStatus })));
      toast.success(t(targetStatus === "active" ? "allDevicesActivated" : "allDevicesDeactivated", { n: toUpdate.length }));
      fetch();
    } catch {
      toast.error(t("loadingError"));
    } finally {
      setBulkBusy(false);
    }
  };

  // Загружаем список организаций при открытии модалки (только для create).
  useEffect(() => {
    if (!isModalOpen || editing) return;
    organizationsApi.list(1, 200)
      .then(r => {
        const list = r.data || [];
        setOrgs(list);
        // Для admin (не superadmin) — фиксируем первую (свою) org как default.
        if (!isSuperadmin && list.length > 0 && !form.organization_id) {
          setForm(f => ({ ...f, organization_id: list[0].id }));
        }
      })
      .catch(() => toast.error(t("orgLoadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, editing, isSuperadmin]);

  // Собирает client_id из device_type + client_input.
  const buildClientId = (type: DeviceType, input: string) =>
    type === "lte" ? `lte-${input}` : `device-${input}`;

  const clientIdPreview = form.client_input
    ? buildClientId(form.device_type, form.client_input.trim())
    : "—";

  const isClientInputValid =
    form.device_type === "lte"
      ? IMEI_RE.test(form.client_input.trim())
      : SERIAL_RE.test(form.client_input.trim());

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    // При edit поля mqtt_client_id/device_type/organization_id read-only
    // (UpdateDeviceRequest в backend принимает только name+status).
    setForm({
      device_uid: String(d.device_uid),
      device_type: d.device_type,
      client_input: d.mqtt_client_id.replace(/^(lte|device)-/, ""),
      organization_id: d.organization_id,
      name: d.name || "",
      status: d.status,
    });
    setIsModalOpen(true);
    setOpenMenu(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await devicesApi.update(editing.id, { name: form.name, status: form.status });
        toast.success(t("deviceUpdated"));
      } else {
        if (!isClientInputValid) {
          toast.error(t("deviceClientIdInvalid"));
          setSaving(false);
          return;
        }
        if (!form.organization_id) {
          toast.error(t("deviceOrgRequired"));
          setSaving(false);
          return;
        }
        const resp: any = await devicesApi.create({
          device_uid: Number(form.device_uid),
          mqtt_client_id: buildClientId(form.device_type, form.client_input.trim()),
          device_type: form.device_type,
          organization_id: form.organization_id,
          name: form.name,
          status: form.status,
        });
        toast.success(t("deviceAdded"));
        // Backend возвращает {device, mqtt_password} при включённой DynSec integration.
        if (resp && typeof resp === "object" && resp.mqtt_password && resp.device) {
          setPwdModal({
            clientId: resp.device.mqtt_client_id,
            password: resp.mqtt_password,
            action: "created",
          });
        }
      }
      setIsModalOpen(false);
      fetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReveal = async (d: Device) => {
    setOpenMenu(null);
    setPwdBusy(d.id);
    try {
      const r = await devicesApi.revealPassword(d.id);
      setPwdModal({ clientId: d.mqtt_client_id, password: r.mqtt_password, action: "revealed" });
    } catch (err: any) {
      toast.error(err.message ?? t("loadingError"));
    } finally {
      setPwdBusy(null);
    }
  };

  const handleRotate = async (d: Device) => {
    setPwdBusy(d.id);
    try {
      const r = await devicesApi.rotatePassword(d.id);
      setPwdModal({ clientId: d.mqtt_client_id, password: r.mqtt_password, action: "rotated" });
      fetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("loadingError"));
    } finally {
      setPwdBusy(null);
      setRotateTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    setDeleting(true);
    try {
      await devicesApi.delete(deletedId);
      toast.success(t("deviceDeleted"));
      // Сначала очищаем все state-references на удалённый device,
      // чтобы Modal'ы / useDeviceTelemetry / pwdBusy не дёргали
      // .find() с null и не падали на следующем render'е.
      setDeleteTarget(null);
      setOpenMenu(null);
      if (pwdBusy === deletedId) setPwdBusy(null);
      if (pwdModal && devices.find(d => d.id === deletedId)?.mqtt_client_id === pwdModal.clientId) {
        setPwdModal(null);
      }
      if (selectedDeviceForTelemetry === deletedId) {
        setSelectedDeviceForTelemetry(null);
        setTelPage(1);
      }
      fetch();
    } catch (err: any) {
      toast.error(err?.message ?? t("loadingError"));
    } finally {
      setDeleting(false);
    }
  };

  const formatLastSeen = (ls?: string) => {
    if (!ls) return t("timeNever");
    const d = new Date(ls);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return t("timeSecondsAgo", { n: Math.floor(diff) });
    if (diff < 3600) return t("timeMinutesAgo", { n: Math.floor(diff / 60) });
    return d.toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("devices")}</h1>
          <p className="text-gray-500 mt-1">{t("iotDevicesSubtitle")}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setBulkMenuOpen(!bulkMenuOpen); }}
                disabled={bulkBusy || devices.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm disabled:opacity-50">
                {bulkBusy ? <Loader2 size={18} className="animate-spin" /> : <Settings size={18} />}
                {t("manageAll")}
              </button>
              {bulkMenuOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50"
                  onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleBulkStatus("active")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                    <Power size={15} className="text-green-500" />{t("activateAll")}
                  </button>
                  <button onClick={() => handleBulkStatus("inactive")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                    <PowerOff size={15} className="text-red-500" />{t("deactivateAll")}
                  </button>
                </div>
              )}
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white rounded-lg hover:bg-[#152e4d] font-medium text-sm shadow-lg shadow-blue-900/10">
              <Plus size={18} />{t("addDeviceBtn")}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-gray-400" size={28} /></div>
      ) : devices.length === 0 ? (
        <div className="p-12 text-center text-gray-400">
          <Cpu size={40} className="mx-auto mb-3 opacity-30" />
          <p>{t("noDevicesFound")}</p>
        </div>
      ) : (
        <>
          {/* Mobile: card grid */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {devices.map(d => (
              <div key={d.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedDeviceForTelemetry(d.id)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                      <Cpu size={20} />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{d.name || `GasTracker-${d.device_uid}`}</div>
                      <div className="text-xs text-gray-500">UID: {d.device_uid}</div>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === d.id ? null : d.id); }}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                        <MoreHorizontal size={18} />
                      </button>
                      {openMenu === d.id && (
                        <div className="absolute right-0 bottom-full mb-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50"
                          onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEdit(d)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                            <Pencil size={15} className="text-blue-500" />{t("editBtn")}
                          </button>
                          {!d.legacy_shared_creds && (
                            <button onClick={() => handleReveal(d)} disabled={pwdBusy === d.id}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                              {pwdBusy === d.id ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} className="text-emerald-500" />}
                              {t("deviceRevealPassword")}
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => { setOpenMenu(null); setRotateTarget(d); }} disabled={pwdBusy === d.id}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                              <RefreshCw size={15} className="text-amber-500" />
                              {d.legacy_shared_creds ? t("deviceMigrateFromLegacy") : t("deviceRotatePassword")}
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => { setDeleteTarget(d); setOpenMenu(null); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                              <Trash2 size={15} />{t("deleteBtn")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t("status")}</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      d.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}>
                      {d.status === "active" ? <Wifi size={11} /> : <WifiOff size={11} />}
                      {d.status === "active" ? t("statusActive") : t("statusInactive")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t("tableLinkedVehicle")}</span>
                    {d.vehicle_plate ? (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{d.vehicle_plate}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">{t("notAssigned")}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t("tableLastSignal")}</span>
                    <span className="text-gray-600 text-xs">{formatLastSeen(d.last_seen)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-visible">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">{t("tableDevice")}</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">{t("status")}</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">{t("tableLinkedVehicle")}</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">{t("tableLastSignal")}</th>
                    {canEdit && <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">{t("tableActions")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {devices.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedDeviceForTelemetry(d.id)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                            <Cpu size={20} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{d.name || `GasTracker-${d.device_uid}`}</div>
                            <div className="text-xs text-gray-500">UID: {d.device_uid}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          d.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                        }`}>
                          {d.status === "active" ? <Wifi size={11} /> : <WifiOff size={11} />}
                          {d.status === "active" ? t("statusActive") : t("statusInactive")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {d.vehicle_plate ? (
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">{d.vehicle_plate}</span>
                        ) : (
                          <span className="text-gray-400 text-sm">{t("notAssigned")}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatLastSeen(d.last_seen)}</td>
                      {canEdit && (
                        <td className="px-6 py-4">
                          <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === d.id ? null : d.id); }}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                              <MoreHorizontal size={18} />
                            </button>
                            {openMenu === d.id && (
                              <div className="absolute right-0 bottom-full mb-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50"
                                onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => openEdit(d)}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                                  <Pencil size={15} className="text-blue-500" />{t("editBtn")}
                                </button>
                                {!d.legacy_shared_creds && (
                                  <button onClick={() => handleReveal(d)} disabled={pwdBusy === d.id}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                    {pwdBusy === d.id ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} className="text-emerald-500" />}
                                    {t("deviceRevealPassword")}
                                  </button>
                                )}
                                {canEdit && (
                                  <button onClick={() => { setOpenMenu(null); setRotateTarget(d); }} disabled={pwdBusy === d.id}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                    <RefreshCw size={15} className="text-amber-500" />
                                    {d.legacy_shared_creds ? t("deviceMigrateFromLegacy") : t("deviceRotatePassword")}
                                  </button>
                                )}
                                {canDelete && (
                                  <button onClick={() => { setDeleteTarget(d); setOpenMenu(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                                    <Trash2 size={15} />{t("deleteBtn")}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
        title={editing ? t("editDeviceTitle") : t("newDeviceTitle")}>
        <form onSubmit={handleSubmit} className="space-y-5">
          {!editing && (
            <>
              {/* Тип устройства */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t("deviceTypeLabel")} *</label>
                <div className="flex gap-2">
                  {(["lte", "serial"] as DeviceType[]).map(type => (
                    <button key={type} type="button"
                      onClick={() => setForm({ ...form, device_type: type, client_input: "" })}
                      className={`flex-1 px-4 py-2.5 rounded-xl border-2 font-medium text-sm transition
                        ${form.device_type === type
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                      data-testid={`device-type-${type}`}>
                      {type === "lte" ? t("deviceTypeLTE") : t("deviceTypeSerial")}
                    </button>
                  ))}
                </div>
              </div>

              {/* IMEI/Serial */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {form.device_type === "lte" ? "IMEI" : t("deviceSerialLabel")} *
                </label>
                <input type="text" required
                  className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                  value={form.client_input}
                  inputMode={form.device_type === "lte" ? "numeric" : "text"}
                  maxLength={form.device_type === "lte" ? 15 : 50}
                  pattern={form.device_type === "lte" ? "\\d{15}" : "[A-Za-z0-9-]{1,50}"}
                  onChange={e => {
                    // Для LTE сразу режем не-цифры и обрезаем до 15 символов,
                    // чтобы paste/опечатки не давали невалидный ввод.
                    let v = e.target.value;
                    if (form.device_type === "lte") {
                      v = v.replace(/\D/g, "").slice(0, 15);
                    } else {
                      v = v.replace(/[^A-Za-z0-9-]/g, "").slice(0, 50);
                    }
                    setForm({ ...form, client_input: v });
                  }}
                  placeholder={form.device_type === "lte" ? "861234567890123" : "EL-001-2026"}
                  data-testid="device-client-input" />
                <p className={`text-xs mt-1 ${isClientInputValid || !form.client_input ? "text-gray-400" : "text-red-500"}`}>
                  {form.device_type === "lte" ? t("deviceImeiHint") : t("deviceSerialHint")}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  client_id: <span className="font-mono text-gray-700">{clientIdPreview}</span>
                </p>
              </div>

              {/* Организация. Выбор org — только superadmin; admin привязан к своей
                  (организация авто-выставляется и показывается read-only). */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t("deviceOrgLabel")} *</label>
                {isSuperadmin ? (
                  <select required
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl outline-none appearance-none"
                    value={form.organization_id}
                    onChange={e => setForm({ ...form, organization_id: e.target.value })}
                    data-testid="device-org-select">
                    <option value="">{t("deviceOrgPlaceholder")}</option>
                    {orgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                ) : (
                  <div
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-700"
                    data-testid="device-org-readonly">
                    {orgs.find(o => o.id === form.organization_id)?.name ?? "—"}
                  </div>
                )}
              </div>

              {/* Внутренний ID (device_uid) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t("deviceUIDLabel")} *</label>
                <input type="number" required min="1"
                  className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  value={form.device_uid} onChange={e => setForm({ ...form, device_uid: e.target.value })}
                  placeholder={t("deviceUIDExample")} />
                <p className="text-xs text-gray-400 mt-1">{t("deviceUidHint")}</p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t("deviceNameOptional")}</label>
            <input type="text"
              className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder={t("deviceNameExample")} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t("status")}</label>
            <select className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl outline-none appearance-none"
              value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="active">{t("statusActive")}</option>
              <option value="inactive">{t("statusInactive")}</option>
              <option value="suspended">{t("statusSuspended")}</option>
              <option value="archived">{t("statusArchived")}</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">
              {t("cancel")}
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 text-white bg-[#1E3A5F] hover:bg-[#152e4d] rounded-xl font-medium disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={16} className="animate-spin" />}{t("save")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={t("deleteDeviceTitle")}
        message={`${t("confirmDelete")} "${deleteTarget?.name || `UID: ${deleteTarget?.device_uid}`}"?`}
        confirmText={t("deleteBtn")} cancelText={t("cancel")} loading={deleting} />

      <ConfirmDialog isOpen={!!rotateTarget} onClose={() => setRotateTarget(null)}
        onConfirm={() => rotateTarget && handleRotate(rotateTarget)}
        title={t("deviceRotatePassword")}
        message={t("deviceRotateConfirm")}
        confirmText={t("confirm")} cancelText={t("cancel")} loading={!!pwdBusy} />

      {/* MQTT password reveal/rotate/created modal */}
      <Modal isOpen={!!pwdModal} onClose={() => setPwdModal(null)} title={t("deviceMqttCredsTitle")}>
        {pwdModal && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
              <Key size={18} className="flex-shrink-0 mt-0.5" />
              <span>
                {pwdModal.action === "created" && t("deviceCredsCreatedHint")}
                {pwdModal.action === "rotated" && t("deviceCredsRotatedHint")}
                {pwdModal.action === "revealed" && t("deviceCredsRevealedHint")}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">client_id</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono break-all">{pwdModal.clientId}</code>
                  <button onClick={() => { navigator.clipboard.writeText(pwdModal.clientId).then(() => toast.success(t("inviteCopied"))); }}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title={t("copy")}>
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t("deviceMqttPassword")}</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-mono break-all">{pwdModal.password}</code>
                  <button onClick={() => { navigator.clipboard.writeText(pwdModal.password).then(() => toast.success(t("inviteCopied"))); }}
                    className="p-2 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded-lg" title={t("copy")}>
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <div>{t("deviceBrokerHost")}: <code className="font-mono">mqtt.energolink.uz</code></div>
                <div>{t("deviceBrokerPort")}: <code className="font-mono">1883</code> (TLS: <code className="font-mono">8883</code>)</div>
                <div>{t("deviceTopic")}: <code className="font-mono">devices/{pwdModal.clientId}/telemetry</code></div>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button onClick={() => setPwdModal(null)}
                className="px-5 py-2.5 bg-[#1E3A5F] text-white rounded-xl hover:bg-[#152e4d] font-medium">{t("close")}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Device Telemetry Modal */}
      <DeviceTelemetryModal
        isOpen={!!selectedDeviceForTelemetry}
        onClose={() => { setSelectedDeviceForTelemetry(null); setTelPage(1); }}
        deviceId={devices.find(d => d.id === selectedDeviceForTelemetry)?.device_uid}
        deviceName={devices.find(d => d.id === selectedDeviceForTelemetry)?.name}
        logs={telemetryLogs}
        loading={telemetryLoading}
        page={telPage}
        totalPages={telTotalPages}
        onPageChange={setTelPage}
      />
    </motion.div>
  );
}
