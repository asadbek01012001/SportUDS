# mqtt-service — SportUDS qurilma-server kanali

Trenajor (IoT) qurilmalarini serverga ulash va ularga havodan (OTA) proshivka yuklash uchun Go
mikroservisi. `energolink-device-connect-arch` (MQTT ulanish + telemetriya) va `energolink-ota-arch`
(OTA) reference arxitekturalaridan **SportUDS uchun moslashtirilgan** holda birlashtirilgan.

energolink'ning gaz/vehicle biznes-logikasi (physics, mileage, trips, drivers, refuels, alerts,
GPS/IMU telemetriyasi) olib tashlangan; o'rniga trenajor telemetriyasi qo'yilgan.

## Nima qiladi

1. **device-connect** — Mosquitto Dynamic Security orqali har bir qurilmaga alohida MQTT akkaunt
   (username + role + literal ACL `devices/<client_id>/#`), telemetriyani qabul qilish
   (`devices/<client_id>/telemetry`) → `machine_telemetry` jadvali + WebSocket + aktiv QR-sessiyaga
   `measurements` oqimi.
2. **OTA** — qurilmaga MQTT-trigger (`devices/<client_id>/OTA/cmd`) yuborib, uni OTA TCP-serverga
   (`:9000`) chaqiradi va `.bin` proshivkani binar kadrli protokol (§3.4, stop-and-wait) bilan uzatadi.

## Arxitektura oqimi

```
                 provisioning (qurilma yaratilganda)
Node backend ──POST /internal/mqtt/clients──▶ mqtt-service ──$CONTROL──▶ Mosquitto (per-device akkaunt)

                 telemetriya
Trenajor ──devices/<id>/telemetry──▶ Mosquitto ──▶ mqtt-service ──▶ machine_telemetry
                                                          ├──▶ measurements (aktiv QR-sessiya bo'lsa)
                                                          └──▶ WebSocket (/ws/telemetry)

                 OTA
Node backend ──POST /internal/ota/start──▶ mqtt-service ──OTA/cmd──▶ Mosquitto ──▶ Trenajor
                                                                                      │ TCP :9000
Trenajor ◀──HEADER/DATA/EOT (§3.4)──── mqtt-service OTA TCP-server ◀───────────────────┘
```

## Tuzilma

```
cmd/main.go                     — lean entrypoint (energolink worker'lari olib tashlangan)
internal/config                 — env konfiguratsiya (SportUDS defaultlari)
internal/model                  — MachineTelemetry (trenajor telemetriyasi)
internal/service                — MQTT subscriber + telemetriya ingest + WS Hub + OTA/info
internal/dynsec                 — Mosquitto Dynamic Security klienti (per-device akkaunt) [verbatim]
internal/handler                — ws / dynsec_http / ota_http (HTTP fasadlar)
internal/ota                    — OTA binar protokol + TCP-server + sessiya + store [verbatim]
mosquitto/config                — broker konfiguratsiyasi (dev + dynsec)
```

`internal/ota/*` va `internal/dynsec/*` — reference'dan deyarli **verbatim** (faqat modul import
yo'li o'zgargan). Protokol qurilmada qattiq yozilgan, shuning uchun uni o'zgartirmaslik muhim.

## Ishga tushirish (docker-compose)

Loyiha ildizidagi `docker-compose.yml` orqali `db`, `mosquitto`, `mqtt-service` birga ko'tariladi:

```
docker compose up -d db mosquitto mqtt-service
```

Jadvallar (`devices`, `machine_telemetry`, `firmwares`, `ota_sessions`, `device_firmware_history`)
backend migratsiyasi (`006_devices.sql`, `007_ota.sql`) orqali yaratiladi.

## Konfiguratsiya (env)

| O'zgaruvchi | Default | Izoh |
|---|---|---|
| `DB_HOST/PORT/NAME/USER/PASSWORD` | `db/5432/sportuds/postgres/sportuds_pass` | SportUDS bazasi (backend bilan bir) |
| `SERVICE_PORT` | `8087` | HTTP/WebSocket + `/internal/*` |
| `OTA_TCP_PORT` | `9000` | OTA TCP-server (qurilma ulanadi) |
| `OTA_PUBLIC_HOST` / `OTA_PUBLIC_PORT` | `170.168.6.84` / `9000` | OTA/cmd'dagi **ommaviy** manzil (majburiy) |
| `MQTT_BROKER` | `tcp://mosquitto:1883` | broker manzili |
| `INTERNAL_SERVICE_TOKEN` | — | backend ↔ mqtt-service Bearer |
| `DYNSEC_ADMIN_USERNAME/PASSWORD` | `dynsec-admin` / — | Dynamic Security admin (bo'sh → control API o'chiq) |

## Node backend API (qurilma boshqaruvi)

`/api/devices` (admin/super_admin):

- `GET  /api/devices` — qurilmalar ro'yxati
- `POST /api/devices` `{machine_id?}` — qurilma yaratish + MQTT provizion; credential BIR MARTA qaytadi
- `DELETE /api/devices/:id` — qurilma + MQTT akkaunt o'chirish
- `POST /api/devices/:id/ota` `{firmware_id}` — OTA yangilanishni boshlash

## DEV vs Production broker (Dynamic Security)

**DEV (default):** `mosquitto/config/mosquitto.conf` — `allow_anonymous true`. Pipeline to'liq
ishlaydi, lekin per-device izolyatsiya yo'q. `DYNSEC_ADMIN_PASSWORD` bo'sh, provisioning best-effort
o'tkazib yuboriladi.

**Production (per-device izolyatsiya):**

1. dynamic-security.json bootstrap (bir marta):
   ```
   docker run --rm -v "$PWD/mqtt-service/mosquitto/config:/mosquitto/config" \
     eclipse-mosquitto:2 mosquitto_ctrl dynsec init \
     /mosquitto/config/dynamic-security.json dynsec-admin
   ```
2. compose'da mosquitto config'ni `mosquitto.dynsec.conf` ga almashtiring.
3. mqtt-service'ga `DYNSEC_ADMIN_PASSWORD` (yuqoridagi parol) bering, subscriber uchun MQTT akkaunt
   yarating (telemetriya + OTA/info topiclariga subscribe ACL bilan).

## Firmware repozitoriysi (ulangan)

`.bin` yuklash/boshqarish REST endpointi Node backendda **amalga oshirildi**
(`backend/src/controllers/firmwares.controller.ts`, `energolink-ota-arch/.../handler/firmwares.go` va
`repository/firmware_verify.go` asosida). Server `.bin` ni qabul qilib o'zi o'lcham + CRC-32/ISO-HDLC
(qurilma protokoli bilan bir xil) ni hisoblaydi, slot capini (64KB) tekshiradi va A/B juftlik
strukturaviy sverkasini (§7.2) bajaradi. Yuklash transporti multipart o'rniga base64 JSON (proshivka
≤64KB — qo'shimcha dependency shart emas). Metadata maydonlari `009_firmwares_meta.sql` da qo'shilgan.

`/api/firmwares` (admin/super_admin):

- `GET    /api/firmwares` — proshivkalar ro'yxati (binarlarsiz)
- `POST   /api/firmwares` `{ver_major, ver_minor, ver_patch?, target, channel?, status?, release_notes?, file_a, file_b?}` — yuklash (base64)
- `GET    /api/firmwares/:id` — bitta proshivka metadatasi
- `GET    /api/firmwares/:id/download` — image_A `.bin` yuklab olish
- `PATCH  /api/firmwares/:id` — status/channel/release_notes tahriri
- `DELETE /api/firmwares/:id` — o'chirish (aktiv OTA sessiyasida bo'lsa 409)

Web-trener admin panelida «Proshivkalar» bo'limi orqali boshqariladi; «Qurilmalar» → OTA modalida
proshivka ro'yxatdan tanlanadi.

## Hali ulanmagan (keyingi qadam)

- **Ommaviy rollout (kampaniya)** — energolink `ota_rollouts` (park bo'ylab bosqichma-bosqich
  yoyish) SportUDS'ning soddaroq modeliga hali port qilinmagan; hozircha OTA qurilmaga bittalab
  tayinlanadi.
- **Qurilma tomoni proshivkasi (ESP)** reference'da yo'q — protokol server tomoni bayt-bayt shu yerda.
```
