import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "../lib/i18n";

export interface DeviceTelemetryRecord {
  id?: number;
  device_uid?: number;
  pressure?: number;
  temperature?: number;
  lat?: number;
  lon?: number;
  speed?: number;
  course?: number;
  gnss_fix?: boolean;
  device_time?: string;
  received_at?: string;
}

interface DeviceTelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId?: string | number;
  deviceName?: string;
  logs: DeviceTelemetryRecord[];
  loading?: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function DeviceTelemetryModal({
  isOpen,
  onClose,
  deviceId,
  deviceName,
  logs = [],
  loading = false,
  page = 1,
  totalPages = 1,
  onPageChange,
}: DeviceTelemetryModalProps) {
  const { t } = useTranslation();
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[600]"
          />

          {/* Modal wrapper — centered */}
          <div className="fixed inset-0 flex items-center justify-center z-[601] p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col pointer-events-auto"
              style={{ maxHeight: "90vh" }}
            >
              {/* Header */}
              <div className="border-b border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    📡 {t("deviceTelemetryTitle")}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {t("deviceTelemetryFor", { name: deviceName || `#${deviceId}` })}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-gray-100 rounded-lg transition"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin text-blue-500 text-2xl">↻</div>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                    <span className="text-sm">{t("noTelemetryFound")}</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">
                            📅 {t("telemetryColReceivedAt")}
                          </th>
                          <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">
                            🕐 {t("telemetryColDeviceTime")}
                          </th>
                          <th className="border border-gray-300 px-4 py-2 text-center font-semibold text-orange-600">
                            🔶 {t("telemetryColPressure")}
                          </th>
                          <th className="border border-gray-300 px-4 py-2 text-center font-semibold text-red-600">
                            🌡️ {t("telemetryColTemperature")}
                          </th>
                          <th className="border border-gray-300 px-4 py-2 text-center font-semibold text-gray-700">
                            📍 {t("telemetryColCoords")}
                          </th>
                          <th className="border border-gray-300 px-4 py-2 text-center font-semibold text-gray-700">
                            ⚡ {t("telemetryColSpeed")}
                          </th>
                          <th className="border border-gray-300 px-4 py-2 text-center font-semibold text-gray-700">
                            🧭 {t("telemetryColCourse")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log, idx) => (
                          <tr
                            key={log.id ?? idx}
                            className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                          >
                            <td className="border border-gray-200 px-4 py-2 text-gray-700 text-xs whitespace-nowrap">
                              {log.received_at
                                ? new Date(log.received_at).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })
                                : "—"}
                            </td>
                            <td className="border border-gray-200 px-4 py-2 text-gray-700 text-xs whitespace-nowrap">
                              {log.device_time
                                ? new Date(log.device_time).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })
                                : "—"}
                            </td>
                            <td className="border border-gray-200 px-4 py-2 text-center font-semibold text-orange-600">
                              {log.pressure != null ? log.pressure.toFixed(2) : "—"}
                            </td>
                            <td className="border border-gray-200 px-4 py-2 text-center font-semibold text-red-600">
                              {log.temperature != null ? log.temperature.toFixed(1) : "—"}
                            </td>
                            <td className="border border-gray-200 px-4 py-2 text-center text-gray-700 text-xs">
                              {log.lat != null && log.lon != null
                                ? `${log.lat.toFixed(4)}, ${log.lon.toFixed(4)}`
                                : "—"}
                            </td>
                            <td className="border border-gray-200 px-4 py-2 text-center text-gray-700">
                              {log.speed != null ? `${log.speed.toFixed(1)} ${t("kmh")}` : "—"}
                            </td>
                            <td className="border border-gray-200 px-4 py-2 text-center text-gray-700">
                              {log.course != null ? `${log.course.toFixed(1)}°` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 p-4 bg-gray-50 flex items-center justify-between text-sm text-gray-600 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <span>{t("telemetryRecordsCount", { n: logs.length })}</span>
                  {totalPages > 1 && onPageChange && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
                        className="p-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs px-2">{page}/{totalPages}</span>
                      <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                        className="p-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition">
                  {t("close")}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
