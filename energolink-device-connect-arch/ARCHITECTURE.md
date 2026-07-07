# EnergoLink — Подключение устройства к серверу — архитектура и код

> Извлечено из проекта **energolink** (ветка `main`, HEAD `6c9f26f`) для переиспользования в проекте **Sport**.
> Это **справочная копия** серверной стороны: провижининг MQTT-аккаунта устройства, приём телеметрии,
> раздача её в UI. Прошивки устройства (ESP/микроконтроллер) здесь нет.
> Пара к папке **`energolink-ota-arch`** (доставка прошивки) — вместе описывают весь канал «устройство ↔ сервер».

Uzbekcha qisqa: bu energolink'da **qurilma serverga qanday ulanishi** — MQTT akkaunt berish (provisioning),
telemetriya qabul qilish va uni UI'ga uzatishning server tomoni. Qurilma proshivkasi bu yerda yo'q.
`energolink-ota-arch` papkasi bilan birga to'liq «qurilma ↔ server» kanalini tashkil qiladi.

---

## 1. Общая картина

Устройство (GasLink, за **LTE-NAT**) — MQTT-клиент. Брокер — **Mosquitto** с плагином **Dynamic Security**.
Два потока: (A) провижининг аккаунта устройства и (B) приём телеметрии.

```
(A) ПРОВИЖИНИНГ (admin создаёт устройство)
┌──────────────┐  создать устройство         ┌───────────────────┐  POST /internal/mqtt/clients  ┌───────────────┐
│ vehicle-svc  │  (client_id + password) ───▶ │  mqttctl.Client   │ ────(Bearer)────────────────▶ │  mqtt-service │
│ device_      │  сохраняет пароль (000030)   │ (HTTP → mqtt-svc) │                                │ dynsec_http   │
│ registry     │                              └───────────────────┘                                └──────┬────────┘
└──────────────┘                                                                                          │ dynsec.Client
                                                                     $CONTROL/dynamic-security/v1 (+resp) ▼
                                                                                                   ┌───────────────┐
                                                                                                   │  Mosquitto    │
                                                                                                   │  DynSec:      │
                                                                                                   │  createClient │  user = client_id
                                                                                                   │  createRole   │  role = device-<id>
                                                                                                   │  + ACL topics │  (literal, per-device)
                                                                                                   └───────────────┘

(B) ТЕЛЕМЕТРИЯ (устройство → сервер → UI)
┌──────────────┐  MQTT connect (client_id/pwd)      ┌───────────────┐
│  Устройство  │ ─────publish─────────────────────▶ │  Mosquitto    │
│  (LTE)       │  devices/<client_id>/telemetry     │  broker :1883 │
└──────────────┘                                    └──────┬────────┘
                                                           │ subscribe devices/+/telemetry (QoS1)
                                                           ▼
                                                    ┌───────────────────┐
                                                    │   mqtt-service    │  service.go:
                                                    │  handleMessage     │  1. parseClientIDFromTopic
                                                    │  ├ unmarshal (JSON)│  2. strict device lookup
                                                    │  ├ physics (газ)   │  3. INSERT device_telemetry
                                                    │  ├ saveTelemetry   │  4. updateVehicle (last pos/pressure)
                                                    │  └ Hub.Broadcast   │  5. → WebSocket
                                                    └─────────┬─────────┘
                                                              │ WS
                                                              ▼
                                                    Frontend (DevicesPage, DeviceTelemetryModal)
```

---

## 2. Провижининг: Dynamic Security (§10)

Устройство не может публиковать, пока у него нет MQTT-аккаунта. Аккаунт создаётся автоматически при создании устройства:

1. **`vehicle-service/handler/device_registry.go`** — CRUD устройств. При создании генерит `client_id` + пароль,
   сохраняет пароль (миграция `000030_devices_mqtt_password`) и вызывает mqtt-service.
2. **`vehicle-service/mqttctl/client.go`** — HTTP-клиент к mqtt-service:
   `POST /internal/mqtt/clients {client_id, password, textname}`, `PUT …/password`, `DELETE …`.
   Bearer через `INTERNAL_SERVICE_TOKEN`. Метод `Enabled()` — интеграция опциональна (нет URL/token → пропуск).
3. **`mqtt-service/handler/dynsec_http.go`** — HTTP-фасад над dynsec-клиентом (тот же контракт).
4. **`mqtt-service/dynsec/client.go`** — Go-клиент к Mosquitto Dynamic Security:
   команды публикуются в `$CONTROL/dynamic-security/v1`, ответы — в `…/v1/response`, сопоставление по `correlationData`.
   ⚠️ **Важно:** DynSec ACL **не** поддерживает подстановку (`${clientid}`/`%c`) → для **каждого** устройства
   создаётся **отдельная role** `device-<id>` с **hardcoded** топиками. (`dynsec/random.go` — генерация паролей.)

Итог: у устройства свой MQTT-логин с ACL ровно на свои топики (`devices/<client_id>/#`) — изоляция устройств.

---

## 3. Подключение и приём телеметрии — `mqtt-service/service/service.go`

- **`Connect()`** (стр. 125): `paho.mqtt.golang`, `AddBroker(MQTT_BROKER)`, `SetConnectRetry(true)` +
  `connectWatchdog()` — брокер/сеть могут мигать, клиент сам переподключается (initial Connect не блокирует старт).
- **`subscribe()`** (стр. 196): подписка на `devices/+/telemetry` (QoS 1) и `devices/+/OTA/info`.
- **`handleMessage()`** (стр. 227):
  1. `parseClientIDFromTopic` — вытащить `<client_id>` из `devices/<client_id>/telemetry` (TrimSpace-защита);
  2. **strict lookup** устройства по client_id (неизвестный/невалидный топик → reject, не пишем);
  3. распарсить JSON-телеметрию (`model/telemetry_unmarshal.go`, формат — `model/model.go`);
  4. физика (масса газа из давления и т.п. — `physics`), `saveTelemetry` → `INSERT INTO device_telemetry`;
  5. `updateVehicle` — актуальные координаты/давление на карточке ТС;
  6. `Hub.Broadcast` — разослать всем WS-клиентам (живая карта/модалка).
- **`Publish()`** (стр. 185): QoS 1, не retained — используется OTA-триггером (`devices/<client_id>/OTA/cmd`),
  реализует интерфейс `ota.Publisher` из соседней папки.

**WebSocket-раздача** — `handler/ws.go` + `Hub` (в `service.go`): сервер → браузер (не устройство), даёт живой поток в UI.

---

## 4. Топики MQTT (сводка)

| Топик | Направление | Назначение |
|-------|-------------|-----------|
| `devices/<client_id>/telemetry` | устройство → сервер | телеметрия (QoS 1) |
| `devices/<client_id>/OTA/info`  | устройство → сервер | статус OTA/версия |
| `devices/<client_id>/OTA/cmd`   | сервер → устройство | триггер обновления (см. `energolink-ota-arch`) |
| `$CONTROL/dynamic-security/v1` (+ `/response`) | сервер → брокер | провижининг аккаунтов/ролей |

---

## 5. Конфигурация — `mqtt-service/config/config.go` (env)

| Переменная | Дефолт | Назначение |
|-----------|--------|-----------|
| `MQTT_BROKER` | `tcp://localhost:1883` | адрес брокера |
| `MQTT_TOPIC` | `devices/+/telemetry` | подписка на телеметрию |
| `MQTT_CLIENT_ID` | `gaslink-mqtt-service` | client_id подписчика (не пересекается с устройствами) |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | — | логин подписчика |
| `MQTT_CONNECT_RETRY_INTERVAL` | `5s` | ретрай подключения |
| `MQTT_WATCHDOG_INTERVAL` | `30s` | watchdog переподключения |
| `DYNSEC_ADMIN_USERNAME` / `DYNSEC_ADMIN_PASSWORD` | `dynsec-admin` / — | админ-аккаунт Dynamic Security |
| `OTA_PUBLIC_HOST` / `OTA_PUBLIC_PORT` | `130.49.170.45` / `9000` | публичный адрес OTA-сервера (для триггера) |

`INTERNAL_SERVICE_TOKEN` — Bearer между vehicle-service ↔ mqtt-service (провижининг и OTA-старт).

---

## 6. Схема БД — `Backend/migrations/`

| Миграция | Что |
|----------|-----|
| `000001_init` | базовые таблицы, в т.ч. **`devices`** и **`device_telemetry`** ⚠️ (файл содержит и не относящиеся к устройствам таблицы — берём только `devices` / `device_telemetry` / `vehicles.device_id`) |
| `000022_device_assignments` | привязка устройства ↔ ТС |
| `000027_devices_strict_provisioning` | строгий провижининг (запрет неизвестных устройств) |
| `000028_mqtt_users` | MQTT-пользователи |
| `000030_devices_mqtt_password` | хранение MQTT-пароля устройства |
| `000036_telemetry_imu_engine_temp` | поля телеметрии: IMU, температура двигателя |
| `000055_activate_demo_devices` | демо-устройства (dev-данные) |
| `000060_telemetry_ver` | версия формата телеметрии |
| `000061_telemetry_gas_mass` | масса газа в телеметрии |

---

## 7. Frontend (admin UI)

- **`Frontend/src/api/devices.ts`** — API-клиент устройств.
- **`Frontend/src/pages/DevicesPage.tsx`** — список/карточки устройств, статусы онлайн/офлайн.
- **`Frontend/src/components/DeviceTelemetryModal.tsx`** — живая телеметрия устройства (через WebSocket).

## 8. Инфра — `k8s/base/mqtt-service/`
Deployment/Service/Kustomization mqtt-service (для контекста развёртывания брокера-потребителя).

---

## 9. Как переиспользовать в Sport

1. **Брокер + Dynamic Security** переносятся как есть: Mosquitto + плагин, тот же паттерн «per-device role, literal ACL».
2. **Провижининг-цепочка** (vehicle-svc → mqttctl → dynsec_http → dynsec.Client) — универсальна; меняются только
   имена сервисов и топиков.
3. **Приёмник телеметрии** (`service.go`) — точка адаптации №1: подставить **свой формат телеметрии**
   (`model/model.go`, `telemetry_unmarshal.go`) и свою бизнес-логику вместо `physics`/газовых полей.
4. **Топики** — держать единый шаблон `devices/<client_id>/…`, тогда strict-lookup и ACL работают без изменений.
5. Тесты (`*_test.go`) переносить вместе — они фиксируют формат телеметрии и провижининг-контракт.

> Ссылки на Confluence (`§N`, `12_ota_server`) в комментах — внутренние документы energolink; ключевое сведено сюда.
