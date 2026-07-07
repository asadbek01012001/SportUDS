# EnergoLink — OTA (прошивка устройств) — архитектура и код

> Извлечено из проекта **energolink** (ветка `main`, HEAD `6c9f26f`) для переиспользования в проекте **Sport**.
> Это **справочная копия** серверной стороны OTA. Здесь нет исходников самой прошивки устройства (ESP/микроконтроллер) —
> протокол «зашит» в устройстве, а сервер реализует его **байт-в-байт**. Модель устройства: **GasLink** (LTE-модем за NAT).

Uzbekcha qisqa: bu energolink'dagi OTA (proshivka yuklash) tizimining **server tomoni** kodi. Qurilma (ESP)
proshivkasining o'zi bu yerda yo'q — protokol qurilmada qattiq yozilgan, server esa uni bayt-bayt takrorlaydi.
Sport loyihasida ham xuddi shu protokol/arxitekturani ishlatish uchun namuna.

---

## 1. Общая картина

OTA-обновление доставляется устройству за **LTE-NAT** (сервер не может подключиться к устройству напрямую).
Поэтому поток «пробуждения» — через MQTT, а сама передача — по TCP, инициированному устройством:

```
┌──────────────┐  1. POST /internal/ota/start        ┌───────────────────┐
│ vehicle-svc  │ ───────(Bearer, admin)────────────▶ │   mqtt-service    │
│  (admin UI/  │                                      │  ota.Manager      │
│   REST API)  │                                      │  ├─ CreateSession │ (offered)
└──────────────┘                                      │  └─ TriggerUpdate │
                                                       └─────────┬─────────┘
                                                                 │ 2. MQTT publish
                                                                 │  topic: devices/<client_id>/OTA/cmd
                                                                 │  {cmd:"ota_update", version:"maj.min",
                                                                 │   ota_host, ota_port, level}
                                                                 ▼
                                                        ┌──────────────────┐
                                                        │  Устройство      │
                                                        │  (GasLink, LTE)  │
                                                        └────────┬─────────┘
                                                                 │ 3. Само открывает TCP → ota_host:ota_port
                                                                 ▼
                                                       ┌───────────────────┐
                                                       │ ota.Server (:9000)│
                                                       │ 4. ClaimOffered   │  (offered → active)
                                                       │ 5. SendFirmware   │  §3.4 stop-and-wait:
                                                       │    HEADER→DATA→EOT │  HELLO, слот A/B
                                                       └─────────┬─────────┘
                                                                 │ 6. UpdateStatus / RecordHistory
                                                                 ▼
                                                          Postgres (ota_sessions,
                                                          firmwares, device_firmware_history)
```

**Ключевая идея:** MQTT только «будит» устройство и даёт ему **публичный адрес** OTA-сервера.
Всю прошивку (.bin ≤ 64 КБ на слот) гонит **TCP-сервер** по бинарному кадровому протоколу со stop-and-wait ACK.

---

## 2. Бинарный протокол (§3) — `ota/protocol.go`

Кадр (всё little-endian):

```
[ SOF=0x7E | type:1 | seq:2 | len:2 | payload | crc32:4 ]
```

- **CRC32** — над `SOF..payload` (без самого поля crc). Алгоритм **CRC-32/ISO-HDLC** (= Go `crc32.IEEE`
  = Python `zlib.crc32`), контроль: `check("123456789") = 0xCBF43926`.
- **Типы кадров:**
  | Тип | Значение | Направление |
  |-----|----------|-------------|
  | `HEADER` | `0x01` | сервер → устройство |
  | `DATA`   | `0x02` | сервер → устройство |
  | `EOT`    | `0x03` | сервер → устройство |
  | `ACK`    | `0x10` | устройство → сервер |
  | `NACK`   | `0x11` | устройство → сервер |
- **DATA payload** ≤ 256 байт (полный кадр ≤ 266 байт).
- **HEADER payload** (12 байт LE): `fw_size:u32 | fw_crc32:u32 | ver_major:u16 | ver_minor:u16`.

---

## 3. Драйвер сессии (§3.4) — `ota/session.go`

Stop-and-wait поверх TCP:

1. (опц.) литерал `OTAUPDATE` в TCP — если прошивка ждёт его в потоке (`Config.SendTrigger`).
2. `HEADER` (seq=0) → ждём ACK.
3. `DATA` seq=0..n-1, **строгое** сопоставление ACK по seq. NACK/таймаут → повтор того же кадра.
4. `EOT` (seq=n) → ждём ACK.

Параметры (`Config`): `ACKTimeout=8s`, `MaxRetries=4` (потом сессия `failed`).
Ограничения: слот **64 КБ** (`SlotSize`), пустой образ и превышение слота — ошибки.

**Допущения**, которые в спеке §3 не выведены однозначно (уточнить у Hardware/прошивки — помечены в комментах `session.go`):
формат ACK/NACK как обычных кадров §3.1; нумерация DATA с 0; триггер вне TCP через MQTT.

---

## 4. TCP-сервер — `ota/server.go`

- Слушает `:9000`. Устройство подключается само (за LTE-NAT).
- **HELLO (§9.4):** устройство первым шлёт ASCII `OTAHELLO slot=<A|B> ver=<maj>.<min>\n`
  (толерантно к legacy без HELLO → слот `A`). Разбор — `ota/hello.go`.
- **A/B-слоты (§7.3):** по активному слоту из HELLO выбирается образ **свободного** слота (`ImageForActiveSlot`).
- **Anti-DDoS:** на порту нет app-level auth → семафор `maxConcurrent=64` одновременных сессий;
  сверх лимита коннект сразу закрывается. `connMaxDuration=5m` — потолок на сессию.
- Диагностика (KAN-43): hex+ASCII первых 48 байт устройства в лог — чтобы видеть реальный формат прошивки.

По завершении: `UpdateStatus(session, "applying")` + `RecordHistory(..., "pending")`.
Финальный `success/rolled-back` подтверждается телеметрией (health-check §11, `ota/healthcheck.go`).

---

## 5. Admin-сторона: назначение обновления

- **`ota/manager.go` — `Manager.StartUpdate(deviceUID, firmwareID)`:**
  резолвит `client_id` и версию → создаёт **offered**-сессию → публикует MQTT-триггер.
  Если publish упал — сессия помечается `failed` (чтобы её не подхватил случайный коннект).
- **`ota/trigger.go` — `TriggerUpdate`:** MQTT-команда в `devices/<client_id>/OTA/cmd`.
  ⚠️ **Живой урок с реального устройства (KAN-43):**
  - `version` — **строка** `"maj.min"` (не отдельные поля, иначе устройство читает `v0.0`);
  - `ota_host` + `ota_port` — **публичный** адрес OTA-сервера (доступный по LTE, не внутренний `10.10.7.x`);
    без них устройство падает на `QIOPEN 565`. Поля **без** `omitempty` + валидация до публикации.
- **`internal/handler/ota_http.go` — HTTP-фасад:** `POST /internal/ota/start {device_uid, firmware_id}` →
  `202 {session_id}`. Bearer-auth через `INTERNAL_SERVICE_TOKEN` (shared с vehicle-service).
  `409` если уже есть активная сессия (`ErrActiveSession`).

---

## 6. Репозиторий прошивок (vehicle-service)

- **`handler/firmwares.go`** — REST загрузки/управления .bin (KAN-29/30), **глобальный** ресурс (admin/superadmin в gateway):
  - upload пары образов **A/B** (§7.1): `file_a` (обяз.) + `file_b` (опц.); legacy single `file` = image_A;
  - сервер сам считает размер + **CRC-32/ISO-HDLC**, валидирует ≤ 64 КБ, сверяет пару (§7.2);
  - версия `ver_major.ver_minor[.ver_patch]`, `target`, `channel`, `status` (draft/beta/stable).
- **`repository/firmwares.go`, `firmware_verify.go`** — CRUD + верификация целостности.
- **`repository/ota_journal.go`** — журнал/история OTA по устройству.
- **`repository/ota_rollout.go`** — раскатка (rollout) прошивки на группу устройств.

---

## 7. Устройство (симулятор) — `fleet-simulator/internal/sim/otaclient.go`

Клиентская сторона протокола для **тестов без железа**: эмулирует HELLO, приём HEADER/DATA/EOT,
отправку ACK/NACK, проверку whole-image CRC. Полезно как исполняемая спецификация «что делает устройство».

---

## 8. Схема БД — `Backend/migrations/`

Применять в порядке номеров (`*.up.sql`; `*.down.sql` — откат):

| Миграция | Что добавляет |
|----------|---------------|
| `000063_firmwares` | таблица прошивок (bin, size, crc32, версия, target, channel, status) |
| `000064_device_firmware_history` | история прошивок по устройству |
| `000065_ota_sessions` | сессии OTA (offered/active/applying/failed…) |
| `000066_ota_one_active_session` | инвариант: одна активная сессия на устройство |
| `000070_firmwares_ab_pair` | пара образов A/B у прошивки |
| `000071_ota_rollouts` | раскатки на группы устройств |
| `000074_devices_ota_info` | OTA-инфо на устройстве (текущая версия/слот) |
| `000075_firmwares_ver_patch` | семантический patch-компонент версии |
| `000076_ota_sessions_pre_version` | версия «до» в сессии (для отката/аудита) |

> Примечание: провижининг устройств и MQTT-аутентификация (миграции `000022/000027/000028/000030/000055`)
> — **отдельная** подсистема (identity/mqtt-auth), сюда не входит, но OTA от неё зависит (`client_id`, топики).

---

## 9. Frontend (admin UI)

- **`Frontend/src/api/ota.ts`** — API-клиент (запуск обновления, список прошивок/сессий).
- **`Frontend/src/pages/OtaPage.tsx`** — страница управления OTA (загрузка прошивок, запуск раскатки, статусы).

---

## 10. Как переиспользовать в Sport

1. **Протокол** (`ota/protocol.go`, `session.go`, `hello.go`) переносится как есть, **если устройство Sport
   говорит тем же кадровым протоколом §3.** Если протокол другой — это точка адаптации №1 (менять только кодек кадров).
2. **Транспорт** (MQTT-триггер + TCP-сервер) переиспользуется целиком: меняются только топики и публичный адрес.
3. **Репозиторий прошивок + миграции** — переносятся, при желании подгоняется размер слота (`SlotSize`/`fwSlotSize`, сейчас 64 КБ).
4. **Тесты** (`*_test.go`) идут вместе — они и есть исполняемая спецификация протокола; прогонять их первым делом.

### Точки конфигурации
- `OTA_PUBLIC_HOST` / `OTA_PUBLIC_PORT` — публичный адрес TCP-сервера (обязательно, иначе устройство по LTE не достучится).
- `INTERNAL_SERVICE_TOKEN` — Bearer между vehicle-service и mqtt-service.
- MQTT-топик команд: `devices/<client_id>/OTA/cmd`.
- Слот: 64 КБ (`ota.SlotSize`, `handler.fwSlotSize` — держать синхронно).

---

## 11. Манифест (47 файлов, ~1.85k LOC ядра ota)

```
Backend/mqtt-service/internal/ota/         — ядро протокола + TCP-сервер + сессии (+ тесты)
  protocol.go / session.go / server.go / hello.go / healthcheck.go
  manager.go / trigger.go / store.go
Backend/mqtt-service/internal/handler/ota_http.go       — HTTP-фасад /internal/ota/start
Backend/mqtt-service/internal/service/ota_info.go       — OTA-инфо устройства (+ тест)
Backend/vehicle-service/internal/handler/firmwares.go   — REST прошивок (+ тест)
Backend/vehicle-service/internal/repository/            — firmwares / firmware_verify / ota_journal / ota_rollout
Backend/fleet-simulator/internal/sim/otaclient.go       — клиент-симулятор устройства
Backend/migrations/0000{63,64,65,66,70,71,74,75,76}_*   — схема БД (up/down)
Frontend/src/api/ota.ts, Frontend/src/pages/OtaPage.tsx — admin UI
```

> Ссылки на Confluence в комментах (`§N`, `12_ota_server`) — внутренние документы energolink;
> при переносе смысл разделов сохранён в этом файле. Спорные места помечены в коде как «уточнить у Hardware/прошивки».
