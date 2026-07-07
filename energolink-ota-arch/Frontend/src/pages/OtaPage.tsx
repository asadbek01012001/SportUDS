import { useState, useEffect, useCallback, useMemo } from "react";
import {
  HardDrive, Cpu, Upload, History, Loader2, X, Download, ArrowUpCircle,
  Rocket, ClipboardList, Activity, Info, Trash2, CheckCircle2, AlertTriangle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "../lib/i18n";
import { otaApi, Firmware, DeviceRegistryEntry, FirmwareHistoryEntry, OtaSession, Rollout } from "../api/ota";
import { organizationsApi } from "../api/organizations";
import { API_BASE_URL } from "../api/client";
import { lsGet, lsRemove } from "../lib/storage";

// OtaPage — раздел OTA (Confluence OTA_frontend, 5 вкладок). Plan ②: каркас + вкладка «Прошивки»
// (репозиторий A/B-пар на реальном API) + «Устройства» (реестр, KAN-31/32). Rollout/Журнал/
// Мониторинг — заглушки (следующие планы). «Устройств на версии» считается клиентски из реестра.

const MAX_FW_BYTES = 64 * 1024;
type Tab = "firmwares" | "devices" | "rollout" | "journal" | "monitoring";

// majMin — major.minor из версии вида major.minor.patch (для сопоставления прошивка/устройство).
const majMin = (v: string) => v.split(".").slice(0, 2).join(".");

export function OtaPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("firmwares");
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [devices, setDevices] = useState<DeviceRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    // allSettled: падение одного списка не должно бланчить второй.
    const [fw, dev] = await Promise.allSettled([otaApi.firmwares(), otaApi.devices()]);
    if (fw.status === "fulfilled") setFirmwares(fw.value.data ?? []);
    if (dev.status === "fulfilled") setDevices(dev.value.data ?? []);
    if (fw.status === "rejected" || dev.status === "rejected") setErr(t("otaLoadError"));
    setLoading(false);
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const tabs: { id: Tab; label: string; icon: typeof HardDrive }[] = [
    { id: "firmwares", label: t("otaTabFirmwares"), icon: HardDrive },
    { id: "devices", label: t("otaTabDevices"), icon: Cpu },
    { id: "rollout", label: t("otaTabRollout"), icon: Rocket },
    { id: "journal", label: t("otaTabJournal"), icon: ClipboardList },
    { id: "monitoring", label: t("otaTabMonitoring"), icon: Activity },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HardDrive size={22} className="text-[#1E3A5F]" />
            {t("otaTitle")}
          </h1>
          <p className="text-sm text-gray-500">{t("otaSubtitle")}</p>
        </div>
        {tab === "firmwares" && (
          <button
            onClick={() => setUploadModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm font-semibold"
          >
            <Upload size={15} />{t("otaUploadVersion")}
          </button>
        )}
      </div>

      {err && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="p-1 hover:bg-red-100 rounded"><X size={14} /></button>
        </div>
      )}

      {/* Вкладки */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              tab === tb.id
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <tb.icon size={15} />{tb.label}
          </button>
        ))}
      </div>

      {tab === "firmwares" && (
        <FirmwaresTab firmwares={firmwares} devices={devices} loading={loading} onError={() => setErr(t("otaDownloadError"))} onReload={load} />
      )}
      {tab === "devices" && (
        <DevicesTab devices={devices} firmwares={firmwares} loading={loading} onReload={load} />
      )}
      {tab === "rollout" && <RolloutTab firmwares={firmwares} />}
      {tab === "journal" && <JournalTab />}
      {tab === "monitoring" && <MonitoringTab />}

      {uploadModal && <UploadModal firmwares={firmwares} onClose={() => setUploadModal(false)} onDone={load} />}
    </div>
  );
}

// ── Вкладка «Прошивки» ───────────────────────────────────────────────────────
function FirmwaresTab({
  firmwares, devices, loading, onError, onReload,
}: {
  firmwares: Firmware[];
  devices: DeviceRegistryEntry[];
  loading: boolean;
  onError: () => void;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [infoOf, setInfoOf] = useState<Firmware | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Удаление версии прошивки (KAN-43). 409 → понятная ошибка (активное обновление/раскатка).
  const removeFw = async (f: Firmware) => {
    if (!window.confirm(t("otaDeleteConfirm").replace("{v}", f.version))) return;
    setDeleting(f.id);
    try {
      await otaApi.deleteFirmware(f.id);
      toast.success(t("otaDeleted").replace("{v}", f.version));
      await onReload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/409|использ/i.test(msg) ? t("otaDeleteInUse") : msg);
    } finally {
      setDeleting(null);
    }
  };

  // «Устройств на версии» — клиентский подсчёт из реестра. Нормализуем к major.minor: прошивка
  // теперь major.minor.patch ("3.3.0"), а устройство рапортует major.minor ("3.3") — иначе 0.
  const countByVersion = useMemo(() => {
    const m = new Map<string, number>();
    devices.forEach((d) => {
      if (d.current_version) { const k = majMin(d.current_version); m.set(k, (m.get(k) ?? 0) + 1); }
    });
    return m;
  }, [devices]);
  const maxCount = Math.max(1, ...Array.from(countByVersion.values()));

  const readyCount = firmwares.filter((f) => f.status === "beta" || f.status === "stable").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t("otaStatVersions")} value={firmwares.length} />
        <StatCard label={t("otaStatReady")} value={readyCount} accent="emerald" />
        <StatCard label={t("otaStatDevices")} value={devices.length} />
      </div>

      <section className="bg-white rounded-card shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <HardDrive size={18} className="text-gray-400" />{t("otaFirmwares")}
          </h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
        ) : firmwares.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
            <HardDrive size={32} className="mb-2 opacity-40" />{t("otaNoFirmwares")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 font-semibold">{t("otaVersion")}</th>
                  <th className="px-4 py-3 font-semibold">{t("otaTarget")}</th>
                  <th className="px-4 py-3 font-semibold">{t("status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("otaColDevices")}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t("otaSize")}</th>
                  <th className="px-4 py-3 font-semibold">{t("otaColPair")}</th>
                  <th className="px-4 py-3 font-semibold">{t("otaColChangelog")}</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {firmwares.map((f, i) => {
                  const cnt = countByVersion.get(majMin(f.version)) ?? 0;
                  return (
                    <tr key={f.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{f.version}</td>
                      <td className="px-4 py-3 text-gray-700">{f.target}</td>
                      <td className="px-4 py-3"><StatusBadge status={f.status} t={t} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[90px]">
                          <span className="tabular-nums text-gray-700 w-6 text-right">{cnt}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(cnt / maxCount) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap tabular-nums">{(f.fw_size / 1024).toFixed(1)} {t("kb")}</td>
                      <td className="px-4 py-3"><PairBadge firmware={f} t={t} /></td>
                      <td className="px-4 py-3 text-gray-600 max-w-[280px] truncate" title={f.release_notes}>{f.release_notes || "—"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setInfoOf(f)} className="inline-flex items-center text-gray-400 hover:text-[#1E3A5F] mr-2" title={t("otaInfo")}>
                          <Info size={16} />
                        </button>
                        <button onClick={() => downloadFw(f, onError)} className="inline-flex items-center text-gray-400 hover:text-[#1E3A5F] mr-2" title={t("otaDownload")}>
                          <Download size={16} />
                        </button>
                        <button onClick={() => removeFw(f)} disabled={deleting === f.id}
                          className="inline-flex items-center text-gray-400 hover:text-red-600 disabled:opacity-40" title={t("otaDelete")}>
                          {deleting === f.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {infoOf && <VersionInfoModal firmware={infoOf} deviceCount={countByVersion.get(majMin(infoOf.version)) ?? 0} onClose={() => setInfoOf(null)} onDone={onReload} />}
    </div>
  );
}

// ── Вкладка «Устройства» (реестр, KAN-31/32) ─────────────────────────────────
function DevicesTab({
  devices, firmwares, loading, onReload,
}: {
  devices: DeviceRegistryEntry[];
  firmwares: Firmware[];
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [historyOf, setHistoryOf] = useState<DeviceRegistryEntry | null>(null);
  const [updateOf, setUpdateOf] = useState<DeviceRegistryEntry | null>(null);

  return (
    <section className="bg-white rounded-card shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Cpu size={18} className="text-gray-400" />{t("otaDevices")}
        </h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
          <Cpu size={32} className="mb-2 opacity-40" />{t("otaNoDevices")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 font-semibold">device_uid</th>
                <th className="px-4 py-3 font-semibold">client_id</th>
                <th className="px-4 py-3 font-semibold">{t("vehicle")}</th>
                <th className="px-4 py-3 font-semibold">{t("otaCurrentVer")}</th>
                <th className="px-4 py-3 font-semibold">{t("otaLastSeen")}</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-3 font-medium text-gray-900 tabular-nums">{d.device_uid}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{d.client_id || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{d.vehicle_plate || "—"}</td>
                  <td className="px-4 py-3">
                    {d.current_version
                      ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">{d.current_version}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(d.last_seen)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setUpdateOf(d)} disabled={firmwares.length === 0}
                      className="inline-flex items-center text-gray-400 hover:text-[#1E3A5F] disabled:opacity-30 disabled:hover:text-gray-400 mr-2" title={t("otaUpdateDevice")}>
                      <ArrowUpCircle size={16} />
                    </button>
                    <button onClick={() => setHistoryOf(d)} className="inline-flex items-center text-gray-400 hover:text-[#1E3A5F]" title={t("otaHistory")}>
                      <History size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historyOf && <HistoryModal device={historyOf} onClose={() => setHistoryOf(null)} />}
      {updateOf && <UpdateModal device={updateOf} firmwares={firmwares} onClose={() => setUpdateOf(null)} onDone={onReload} />}
    </section>
  );
}

// ── Вкладка «Rollout» (массовая раскатка на организацию, §5) ──────────────────
function RolloutTab({ firmwares }: { firmwares: Firmware[] }) {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [rollouts, setRollouts] = useState<Rollout[]>([]);
  const [fwId, setFwId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [level, setLevel] = useState("normal");
  const [gate, setGate] = useState<{ a: number; b: number } | null>(null);
  const [ans, setAns] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const deployable = firmwares.filter((f) => f.status === "beta" || f.status === "stable");

  const loadRollouts = useCallback(() => otaApi.rollouts().then((r) => setRollouts(r.data ?? [])).catch(() => undefined), []);
  useEffect(() => {
    organizationsApi.list(1, 100).then((r) => setOrgs((r.data ?? []).map((o) => ({ id: o.id, name: o.name })))).catch(() => undefined);
    loadRollouts();
    const iv = setInterval(loadRollouts, 6000); // прогресс кампаний live
    return () => clearInterval(iv);
  }, [loadRollouts]);
  useEffect(() => { if (!fwId && deployable[0]) setFwId(deployable[0].id); }, [deployable, fwId]);

  const newExample = () => setGate({ a: 2 + Math.floor(Math.random() * 7), b: 2 + Math.floor(Math.random() * 7) });
  const openGate = () => {
    if (!fwId) { setErr(t("otaRolloutNoReady")); return; }
    if (!orgId) { setErr(t("otaRolloutPickOrg")); return; }
    setErr(""); setAns(""); newExample();
  };
  const submit = async () => {
    if (!gate) return;
    if (Number(ans) !== gate.a + gate.b) { newExample(); setAns(""); setErr(t("otaGateWrong")); return; }
    setSaving(true); setErr("");
    try {
      await otaApi.createRollout({ firmware_id: fwId, organization_id: orgId, level });
      setGate(null); await loadRollouts();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-card shadow-sm border border-gray-100 p-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3"><Rocket size={18} className="text-gray-400" />{t("otaRolloutNew")}</h2>
        {deployable.length === 0 ? (
          <p className="text-sm text-gray-400">{t("otaRolloutNoReady")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <Field label={t("otaVersion")}>
              <select value={fwId} onChange={(e) => setFwId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]">
                {deployable.map((f) => <option key={f.id} value={f.id}>{f.version} · {f.target}</option>)}
              </select>
            </Field>
            <Field label={t("otaRolloutOrg")}>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]">
                <option value="">{t("otaRolloutPickOrg")}</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label={t("otaRolloutLevel")}>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]">
                {["normal", "priority", "force"].map((l) => <option key={l} value={l}>{t(`otaLevel_${l}`)}</option>)}
              </select>
            </Field>
            <button onClick={openGate} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold inline-flex items-center justify-center gap-2">
              <Rocket size={15} />{t("otaRolloutStart")}
            </button>
          </div>
        )}
        {err && !gate && <p className="text-sm text-red-600 mt-2">{err}</p>}
      </section>

      <section className="bg-white rounded-card shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><h2 className="font-semibold text-gray-800">{t("otaRolloutCampaigns")}</h2></div>
        {rollouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm"><Rocket size={32} className="mb-2 opacity-40" />{t("otaRolloutEmpty")}</div>
        ) : (
          <div className="divide-y divide-gray-100">{rollouts.map((ro) => <RolloutCard key={ro.id} ro={ro} t={t} />)}</div>
        )}
      </section>

      {gate && (
        <ModalShell title={t("otaRolloutStart")} onClose={() => setGate(null)}>
          <div className="p-4 space-y-3">
            <div className="text-sm text-gray-700">{deployable.find((f) => f.id === fwId)?.version} → {orgs.find((o) => o.id === orgId)?.name} · {t(`otaLevel_${level}`)}</div>
            {level === "force" && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{t("otaRolloutForceWarn")}</div>}
            <div className="text-xs text-gray-500">{t("otaGatePrompt")}</div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{gate.a} + {gate.b} =</span>
              <input value={ans} onChange={(e) => setAns(e.target.value)} className="w-20 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]" />
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
          <ModalFooter>
            <button onClick={() => setGate(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100">{t("cancel")}</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">
              {saving && <Loader2 size={14} className="animate-spin" />}{t("otaRolloutStart")}
            </button>
          </ModalFooter>
        </ModalShell>
      )}
    </div>
  );
}

function RolloutCard({ ro, t }: { ro: Rollout; t: (k: string) => string }) {
  const pctDone = ro.total > 0 ? Math.round((ro.done / ro.total) * 100) : 0;
  const statusCls = ro.status === "completed" ? "bg-green-100 text-green-700" : ro.status === "running" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500";
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-gray-900">v{ro.version}</span>
          <span className="text-gray-400">→</span>
          <span className="text-gray-700">{ro.organization_name || "—"}</span>
          <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-700">{t(`otaLevel_${ro.level}`) || ro.level}</span>
        </div>
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>{ro.status}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctDone}%` }} />
        </div>
        <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{ro.done}/{ro.total} {t("otaRolloutDone")} · ✓{ro.success} ✗{ro.failed}</span>
      </div>
    </div>
  );
}

// ── Сессии OTA (журнал/мониторинг) ───────────────────────────────────────────
const SESSION_PALETTE: Record<string, string> = {
  offered: "bg-gray-100 text-gray-600",
  waiting: "bg-amber-100 text-amber-700",
  downloading: "bg-blue-50 text-blue-600",
  verifying: "bg-blue-50 text-blue-600",
  applying: "bg-violet-100 text-violet-700",
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-600",
  "rolled-back": "bg-orange-100 text-orange-600",
};
const ACTIVE_STATES = ["offered", "waiting", "downloading", "verifying", "applying"];
const PIPELINE = ["offered", "downloading", "verifying", "applying", "success"];

function SessionBadge({ status, t }: { status: string; t: (k: string) => string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SESSION_PALETTE[status] ?? "bg-gray-100 text-gray-500"}`}>{t(`otaSess_${status}`) || status}</span>;
}

// useSessions — загрузка списка OTA-сессий; pollMs>0 → периодический опрос (мониторинг live).
function useSessions(pollMs?: number) {
  const [sessions, setSessions] = useState<OtaSession[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () => otaApi.sessions().then((r) => { if (alive) setSessions(r.data ?? []); }).finally(() => { if (alive) setLoading(false); });
    load();
    if (pollMs) {
      const id = setInterval(load, pollMs);
      return () => { alive = false; clearInterval(id); };
    }
    return () => { alive = false; };
  }, [pollMs]);
  return { sessions, loading };
}

function pct(seq: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((seq / total) * 100)) : 0;
}

// sessLog — столбец «Логи»: ошибка, иначе переданные кадры (current_seq 0-индексный → +1).
function sessLog(s: OtaSession, t: (k: string) => string): string {
  if (s.error) return s.error;
  if (s.frames_total > 0) return `${s.current_seq + 1}/${s.frames_total}`;
  if (s.current_seq > 0) return `${s.current_seq + 1} ${t("otaFrames")}`;
  return "—";
}

// JournalTab — объединённый журнал + мониторинг OTA: live-таблица всех сессий (опрос 5с) с
// датой/временем (создано/обновлено), версией, статусом и прогрессом/логом. Активные сессии
// (offered…applying) — сверху (live), затем история.
function JournalTab() {
  const { t } = useTranslation();
  const { sessions, loading } = useSessions(5000); // live-опрос: журнал и мониторинг — одно
  const [status, setStatus] = useState("all");
  const STATUSES = ["all", "success", "failed", "rolled-back", "downloading", "applying", "offered"];
  const filtered = status === "all" ? sessions : sessions.filter((s) => s.status === status);
  // Сортировка: активные сессии первыми (мониторинг), затем по времени обновления (свежие выше).
  const ordered = [...filtered].sort((a, b) => {
    const aw = ACTIVE_STATES.includes(a.status) ? 1 : 0;
    const bw = ACTIVE_STATES.includes(b.status) ? 1 : 0;
    if (aw !== bw) return bw - aw;
    return (b.updated_at || "").localeCompare(a.updated_at || "");
  });
  const activeCount = sessions.filter((s) => ACTIVE_STATES.includes(s.status)).length;

  return (
    <section className="bg-white rounded-card shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><ClipboardList size={18} className="text-gray-400" />{t("otaTabJournal")}</h2>
        {activeCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
            <Activity size={11} />{activeCount} {t("otaActiveNow")}
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-500">
          {t("otaFilterStatus")}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-sm px-2 py-1 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]">
            {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? t("otaFilterAll") : (t(`otaSess_${s}`) || s)}</option>)}
          </select>
        </label>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm"><ClipboardList size={32} className="mb-2 opacity-40" />{t("otaNoSessions")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 font-semibold">{t("otaColTime")}</th>
                <th className="px-4 py-3 font-semibold">{t("otaColDevice")}</th>
                <th className="px-4 py-3 font-semibold">{t("otaColVersion")}</th>
                <th className="px-4 py-3 font-semibold">{t("status")}</th>
                <th className="px-4 py-3 font-semibold">{t("otaColProgress")}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((s, i) => {
                const active = ACTIVE_STATES.includes(s.status);
                const downloading = s.status === "downloading" && s.frames_total > 0;
                return (
                  <tr key={s.id} className={active ? "bg-blue-50/40" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    {/* Дата и время: создано (основное) + обновлено (приглушённо) */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-gray-700">{fmtDate(s.created_at)}</div>
                      {s.updated_at && s.updated_at !== s.created_at && (
                        <div className="text-xs text-gray-400">{t("otaUpdated")}: {fmtDate(s.updated_at)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-700">{s.client_id || s.device_uid}</div>
                      <div className="text-xs text-gray-400">{[s.vehicle_plate, s.organization_name].filter(Boolean).join(" · ") || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {s.version}
                      {s.launched_version && s.launched_version !== s.version && (
                        <span className="text-gray-400"> → {s.launched_version}</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><SessionBadge status={s.status} t={t} /></td>
                    <td className="px-4 py-3 max-w-[240px]">
                      {downloading ? (
                        <div className="min-w-[120px]">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>{s.current_seq}/{s.frames_total}</span><span>{pct(s.current_seq, s.frames_total)}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct(s.current_seq, s.frames_total)}%` }} /></div>
                        </div>
                      ) : (
                        <span className={`text-xs truncate block ${s.error ? "text-red-600" : "text-gray-500"}`} title={s.error}>{sessLog(s, t)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// MonitoringTab — живые сессии с пошаговым пайплайном (§7): видно все шаги обновления.
function MonitoringTab() {
  const { t } = useTranslation();
  const { sessions, loading } = useSessions(5000); // live-опрос каждые 5с
  const shown = sessions.filter((s) => ACTIVE_STATES.includes(s.status) || s.status === "failed" || s.status === "rolled-back");

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>;
  if (shown.length === 0) {
    return <div className="bg-white rounded-card border border-gray-100 flex flex-col items-center justify-center py-16 text-gray-400 text-sm"><Activity size={32} className="mb-2 opacity-40" />{t("otaNoActive")}</div>;
  }
  return (
    <div className="space-y-3">
      {shown.map((s) => <SessionCard key={s.id} s={s} t={t} />)}
    </div>
  );
}

function SessionCard({ s, t }: { s: OtaSession; t: (k: string) => string }) {
  const isProblem = s.status === "failed" || s.status === "rolled-back";
  const isWaiting = s.status === "waiting";
  const stepIdx = PIPELINE.indexOf(s.status);
  return (
    <div className={`bg-white rounded-card border p-4 ${isProblem ? "border-red-200" : "border-gray-100"}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Cpu size={15} className="text-gray-400" />
          <span className="font-mono text-xs text-gray-700">{s.client_id || s.device_uid}</span>
          <span className="text-xs text-gray-400">{[s.vehicle_plate, s.organization_name].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">v{s.version}</span>
          <SessionBadge status={s.status} t={t} />
        </div>
      </div>

      {/* Пайплайн состояний (§7) — видно все шаги */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PIPELINE.map((step, i) => {
          const done = stepIdx >= 0 && i < stepIdx;
          const active = step === s.status;
          return (
            <div key={step} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                done ? "bg-green-50 text-green-600" : active ? (isProblem ? "bg-red-100 text-red-600" : "bg-blue-50 text-blue-600 font-medium") : "bg-gray-50 text-gray-400"
              }`}>
                {done && <CheckCircle2 size={11} />}{t(`otaSess_${step}`) || step}
              </span>
              {i < PIPELINE.length - 1 && <span className="text-gray-300">›</span>}
            </div>
          );
        })}
      </div>

      {/* Прогресс загрузки (stop-and-wait) */}
      {s.status === "downloading" && s.frames_total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{s.current_seq}/{s.frames_total}</span><span>{pct(s.current_seq, s.frames_total)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct(s.current_seq, s.frames_total)}%` }} /></div>
        </div>
      )}

      {isWaiting && s.error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><Clock size={12} />{s.error}</div>
      )}
      {isProblem && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle size={12} />{s.error || t(`otaSess_${s.status}`)}</div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "emerald" }) {
  return (
    <div className="bg-white rounded-card shadow-sm border border-gray-100 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent === "emerald" ? "text-emerald-600" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-500",
    beta: "bg-blue-50 text-blue-600",
    stable: "bg-green-100 text-green-700",
    released: "bg-green-100 text-green-700", // legacy
    deprecated: "bg-orange-100 text-orange-600",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-500"}`}>{t(`otaStatus_${status}`) || status}</span>;
}

// PairBadge — результат сверки пары A/B (§7.2). Нет image_B (legacy single) → нейтральное «—».
function PairBadge({ firmware, t }: { firmware: Firmware; t: (k: string) => string }) {
  const pc = firmware.pair_check;
  if (!pc) return <span className="text-gray-400 text-xs">{t("otaPairNone")}</span>;
  const map: Record<string, { cls: string; label: string }> = {
    ok: { cls: "bg-green-100 text-green-700", label: t("otaPairOk") },
    failed: { cls: "bg-red-100 text-red-600", label: t("otaPairFailed") },
    pending: { cls: "bg-blue-50 text-blue-600", label: t("otaPairPending") },
  };
  const m = map[pc] ?? { cls: "bg-gray-100 text-gray-500", label: pc };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`} title={firmware.pair_check_detail}>{m.label}</span>;
}

// ── Модалки ──────────────────────────────────────────────────────────────────
// KNOWN_TARGETS — базовые типы устройств (объединяются с фактическими из репозитория прошивок).
const KNOWN_TARGETS = ["cng-lte", "stm32f401rc", "stm32f401rct6"];

function UploadModal({ firmwares, onClose, onDone }: { firmwares: Firmware[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [verMajor, setVerMajor] = useState("1");
  const [verMinor, setVerMinor] = useState("0");
  const [verPatch, setVerPatch] = useState("0");
  const targets = Array.from(new Set([...firmwares.map((f) => f.target), ...KNOWN_TARGETS])).filter(Boolean);
  const [target, setTarget] = useState(targets[0] ?? "cng-lte");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // onlyDigits — поля версии принимают только цифры (никаких точек/букв/минусов).
  const onlyDigits = (v: string) => v.replace(/\D/g, "");

  const submit = async () => {
    if (!fileA) { setError(t("otaErrNoFile")); return; }
    if (fileA.size > MAX_FW_BYTES || (fileB && fileB.size > MAX_FW_BYTES)) { setError(t("otaErrTooBig")); return; }
    if (!target.trim()) { setError(t("otaErrNoTarget")); return; }
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file_a", fileA);
      if (fileB) fd.append("file_b", fileB);
      fd.append("ver_major", String(Number(verMajor) || 0));
      fd.append("ver_minor", String(Number(verMinor) || 0));
      fd.append("ver_patch", String(Number(verPatch) || 0));
      fd.append("target", target.trim());
      fd.append("status", status);
      fd.append("release_notes", notes);
      await otaApi.uploadFirmware(fd);
      await onDone(); // обновляем список ДО закрытия — ошибка reload видна
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const verInput = "w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]";
  return (
    <ModalShell title={t("otaUploadVersion")} onClose={onClose}>
      <div className="p-4 space-y-3">
        <Field label={t("otaImageA")}>
          <input type="file" accept=".bin,application/octet-stream" onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
            className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#1E3A5F] file:text-white file:text-sm hover:file:bg-[#152e4d]" />
        </Field>
        <Field label={t("otaImageB")}>
          <input type="file" accept=".bin,application/octet-stream" onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
            className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-200 file:text-gray-700 file:text-sm hover:file:bg-gray-300" />
          <p className="mt-1 text-xs text-gray-400">{t("otaImageBHint")}</p>
        </Field>
        <Field label={t("otaVersion")}>
          <div className="grid grid-cols-3 gap-2">
            <input inputMode="numeric" pattern="[0-9]*" placeholder={t("otaVerMajor")} value={verMajor}
              onChange={(e) => setVerMajor(onlyDigits(e.target.value))} className={verInput} />
            <input inputMode="numeric" pattern="[0-9]*" placeholder={t("otaVerMinor")} value={verMinor}
              onChange={(e) => setVerMinor(onlyDigits(e.target.value))} className={verInput} />
            <input inputMode="numeric" pattern="[0-9]*" placeholder={t("otaVerPatch")} value={verPatch}
              onChange={(e) => setVerPatch(onlyDigits(e.target.value))} className={verInput} />
          </div>
          <p className="mt-1 text-xs text-gray-400">major.minor.patch · {verMajor || 0}.{verMinor || 0}.{verPatch || 0}</p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("otaTarget")}>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={verInput}>
              {targets.map((tg) => <option key={tg} value={tg}>{tg}</option>)}
            </select>
          </Field>
          <Field label={t("status")}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={verInput}>
              <option value="draft">{t("otaStatus_draft") || "draft"}</option>
              <option value="beta">{t("otaStatus_beta") || "beta"}</option>
              <option value="stable">{t("otaStatus_stable") || "stable"}</option>
            </select>
          </Field>
        </div>
        <Field label={t("otaReleaseNotes")}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F] resize-none" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <ModalFooter>
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100">{t("cancel")}</button>
        <button onClick={submit} disabled={saving}
          className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">
          {saving && <Loader2 size={14} className="animate-spin" />}{t("otaUploadVersion")}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

function VersionInfoModal({
  firmware, deviceCount, onClose, onDone,
}: {
  firmware: Firmware;
  deviceCount: number;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(firmware.release_notes ?? "");
  const [status, setStatus] = useState(firmware.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await otaApi.patchFirmware(firmware.id, { status, release_notes: notes });
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  // Жизненный цикл §3.2: draft → beta → stable → deprecated. Раскатывать можно только beta/stable.
  const STATUSES = ["draft", "beta", "stable", "deprecated"];

  return (
    <ModalShell title={`${firmware.version} · ${firmware.target}`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info2 label={t("status")} value={
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]">
              {STATUSES.map((s) => <option key={s} value={s}>{t(`otaStatus_${s}`) || s}</option>)}
            </select>
          } />
          <Info2 label={t("otaColDevices")} value={String(deviceCount)} />
          <Info2 label={`${t("otaSize")} A`} value={`${(firmware.fw_size / 1024).toFixed(1)} ${t("kb")}`} />
          <Info2 label={`${t("otaSize")} B`} value={firmware.fw_size_b != null ? `${(firmware.fw_size_b / 1024).toFixed(1)} ${t("kb")}` : "—"} />
          <Info2 label="CRC A" value={<span className="font-mono text-xs">{fmtCrc(firmware.fw_crc32)}</span>} />
          <Info2 label="CRC B" value={firmware.fw_crc32_b != null ? <span className="font-mono text-xs">{fmtCrc(firmware.fw_crc32_b)}</span> : "—"} />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">{t("otaPairDetail")}</div>
          <div className="flex items-start gap-2">
            <PairBadge firmware={firmware} t={t} />
            {firmware.pair_check_detail && <span className="text-xs text-gray-500">{firmware.pair_check_detail}</span>}
          </div>
        </div>
        <Field label={t("otaColChangelog")}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F] resize-none" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <ModalFooter>
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100">{t("close")}</button>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">
          {saving && <Loader2 size={14} className="animate-spin" />}{t("otaSaveChangelog")}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

function UpdateModal({
  device, firmwares, onClose, onDone,
}: {
  device: DeviceRegistryEntry;
  firmwares: Firmware[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [firmwareId, setFirmwareId] = useState(firmwares[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!firmwareId) { setError(t("otaUpdateNoFw")); return; }
    // Подтверждение: OTA перезагружает реальное устройство (как confirm при удалении версии).
    const fw = firmwares.find((f) => f.id === firmwareId);
    if (!window.confirm(t("otaUpdateConfirm").replace("{d}", String(device.device_uid)).replace("{v}", fw?.version ?? ""))) return;
    setSaving(true);
    setError("");
    try {
      await otaApi.startUpdate(device.device_uid, firmwareId);
      setDone(true);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`${t("otaUpdateDevice")} · ${device.device_uid}`} onClose={onClose} icon={<ArrowUpCircle size={18} className="text-gray-400" />}>
      <div className="p-4 space-y-3">
        {done ? (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{t("otaUpdateQueued")}</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">{t("otaUpdateHint")}</p>
            <Field label={t("otaFirmwares")}>
              <select value={firmwareId} onChange={(e) => setFirmwareId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#1E3A5F]">
                {firmwares.map((f) => (
                  <option key={f.id} value={f.id}>{f.version} · {f.target} ({t(`otaStatus_${f.status}`) || f.status})</option>
                ))}
              </select>
            </Field>
            {device.current_version && <p className="text-xs text-gray-400">{t("otaCurrentVer")}: {device.current_version}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}
      </div>
      <ModalFooter>
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100">{done ? t("close") : t("cancel")}</button>
        {!done && (
          <button onClick={submit} disabled={saving || !firmwareId}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-50 inline-flex items-center gap-1">
            {saving && <Loader2 size={14} className="animate-spin" />}{t("otaUpdateStart")}
          </button>
        )}
      </ModalFooter>
    </ModalShell>
  );
}

function HistoryModal({ device, onClose }: { device: DeviceRegistryEntry; onClose: () => void }) {
  const { t } = useTranslation();
  const [hist, setHist] = useState<FirmwareHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    otaApi.history(device.device_uid)
      .then((r) => { if (alive) setHist(r.data ?? []); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [device.device_uid]);

  return (
    <ModalShell title={`${t("otaHistory")} · ${device.device_uid}`} onClose={onClose} icon={<History size={18} className="text-gray-400" />}>
      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" size={22} /></div>
        ) : hist.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">{t("otaNoHistory")}</p>
        ) : (
          <ul className="space-y-2">
            {hist.map((h) => (
              <li key={h.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium text-gray-900">{h.version}</span>
                  <span className="block text-xs text-gray-400">{fmtDate(h.created_at)}</span>
                </div>
                <HistoryResult result={h.result} t={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}

function HistoryResult({ result, t }: { result: string; t: (k: string) => string }) {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-500",
    success: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-600",
    "rolled-back": "bg-orange-100 text-orange-600",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[result] ?? "bg-gray-100 text-gray-500"}`}>{t(`otaResult_${result}`) || result}</span>;
}

// ── Общие примитивы ──────────────────────────────────────────────────────────
function ModalShell({ title, onClose, icon, children }: { title: string; onClose: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">{icon}{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 border-t border-gray-200 p-4">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Info2({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
}

async function downloadFw(f: Firmware, onError: () => void) {
  try {
    const token = lsGet("token");
    const res = await fetch(`${API_BASE_URL}/firmwares/${f.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      lsRemove("token");
      lsRemove("user");
      window.location.href = "/login";
      return;
    }
    if (!res.ok) { onError(); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${f.target}-${f.version}.bin`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  } catch {
    onError();
  }
}

function fmtCrc(n: number): string {
  return "0x" + (n >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
