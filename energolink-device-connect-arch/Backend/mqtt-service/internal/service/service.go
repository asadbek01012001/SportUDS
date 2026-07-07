package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/energolink/mqtt-service/internal/config"
	"github.com/energolink/mqtt-service/internal/model"
	"github.com/energolink/mqtt-service/internal/physics"
)

type Client struct{ Send chan []byte }

type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*Client]bool),
		register:  make(chan *Client),
		unregister: make(chan *Client),
		broadcast: make(chan []byte, 512),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock(); h.clients[c] = true; h.mu.Unlock()
			log.Printf("[WS] Client connected. Total: %d", len(h.clients))
		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok { delete(h.clients, c); close(c.Send) }
			h.mu.Unlock()
			log.Printf("[WS] Client disconnected. Total: %d", len(h.clients))
		case msg := <-h.broadcast:
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.Send <- msg:
				default: close(c.Send); delete(h.clients, c)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Register(c *Client)   { h.register <- c }
func (h *Hub) Unregister(c *Client) { h.unregister <- c }
func (h *Hub) Broadcast(msg []byte) { h.broadcast <- msg }

// ── MQTTService ───────────────────────────────────────────────────────────────

type MQTTService struct {
	cfg  *config.Config
	db   *sql.DB
	hub  *Hub
	mqtt mqtt.Client

	// Кэш объёма баллона (cng_volume_l) per device_uid для расчёта массы газа при приёме
	// телеметрии (KAN-10c) — чтобы не дёргать БД на каждое сообщение. TTL-инвалидация.
	volMu    sync.RWMutex
	volCache map[uint32]volCacheEntry

	// onOtaInfo — колбэк после сохранения версии из OTA/info (event-driven подтверждение
	// OTA-сессии, §11). nil до регистрации main.go; вызов под nil-guard.
	onOtaInfo func(clientID string)
}

type volCacheEntry struct {
	volL float64 // cng_volume_l (0 = не задан/нет ТС)
	at   time.Time
}

const volCacheTTL = 10 * time.Minute

func New(cfg *config.Config, db *sql.DB, hub *Hub) *MQTTService {
	return &MQTTService{cfg: cfg, db: db, hub: hub, volCache: make(map[uint32]volCacheEntry)}
}

// SetOtaInfoHook регистрирует колбэк, вызываемый с mqtt_client_id после сохранения версии из
// OTA/info. Используется для event-driven подтверждения OTA-сессии (ota.Store.ConfirmApplyingByClientID).
func (s *MQTTService) SetOtaInfoHook(fn func(clientID string)) { s.onOtaInfo = fn }

// cngVolumeL — объём баллона (л) ТС, привязанного к device_uid, из кэша или БД. 0 = не задан
// или устройство не привязано к ТС. Кэш с TTL (volCacheTTL) гасит нагрузку на БД.
func (s *MQTTService) cngVolumeL(devUID uint32) float64 {
	s.volMu.RLock()
	e, ok := s.volCache[devUID]
	s.volMu.RUnlock()
	if ok && time.Since(e.at) < volCacheTTL {
		return e.volL
	}

	var vol sql.NullFloat64
	err := s.db.QueryRow(
		`SELECT v.cng_volume_l FROM vehicles v
		 JOIN devices d ON d.id = v.device_id
		 WHERE d.device_uid = $1 AND v.archived_at IS NULL`, devUID,
	).Scan(&vol)
	volL := 0.0
	if err == nil && vol.Valid {
		volL = vol.Float64
	}
	s.volMu.Lock()
	s.volCache[devUID] = volCacheEntry{volL: volL, at: time.Now()}
	s.volMu.Unlock()
	return volL
}

func (s *MQTTService) Connect() error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(s.cfg.MQTTBroker)
	opts.SetClientID(s.cfg.MQTTClientID)
	opts.SetAutoReconnect(true)
	opts.SetCleanSession(false)
	// SetConnectRetry заставляет paho ретраить initial Connect() в фоне.
	// Без него после первой неудачи (broker не успел подняться) клиент
	// «висит мёртвым» — AutoReconnect не помогает, потому что включается
	// только после первого успешного коннекта.
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(s.cfg.MQTTConnectRetryInterval)
	if s.cfg.MQTTUsername != "" {
		opts.SetUsername(s.cfg.MQTTUsername)
		opts.SetPassword(s.cfg.MQTTPassword)
	}
	opts.SetOnConnectHandler(func(c mqtt.Client) {
		log.Printf("[MQTT] Connected to broker: %s", s.cfg.MQTTBroker)
		s.subscribe(c)
	})
	opts.SetConnectionLostHandler(func(c mqtt.Client, err error) {
		log.Printf("[MQTT] Connection lost: %v", err)
	})
	opts.SetReconnectingHandler(func(_ mqtt.Client, o *mqtt.ClientOptions) {
		broker := s.cfg.MQTTBroker
		if len(o.Servers) > 0 {
			broker = o.Servers[0].String()
		}
		log.Printf("[MQTT] reconnecting to %s after connection loss", broker)
	})
	client := mqtt.NewClient(opts)
	// Не делаем token.Wait() — с ConnectRetry=true paho будет ретраить
	// бесконечно в фоне, и Wait() заблокировал бы startup HTTP/WS-сервера.
	client.Connect()
	s.mqtt = client
	go s.connectWatchdog()
	return nil
}

// connectWatchdog логирует, что MQTT-pipe не поднимается, пока paho retry
// крутится в фоне на DEBUG-уровне. Goroutine завершается сразу после
// успешного коннекта или закрытия клиента.
func (s *MQTTService) connectWatchdog() {
	interval := s.cfg.MQTTWatchdogInterval
	if interval <= 0 {
		interval = 30 * time.Second
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for range t.C {
		if s.mqtt == nil || s.mqtt.IsConnected() {
			return
		}
		log.Printf("[MQTT] not yet connected to %s, paho retrying every %s",
			s.cfg.MQTTBroker, s.cfg.MQTTConnectRetryInterval)
	}
}

// Publish публикует payload в topic (QoS 1, не retained). Используется OTA-триггером (§7) —
// команда «обновись» в devices/<client_id>/commands. Реализует ota.Publisher.
func (s *MQTTService) Publish(topic string, payload []byte) error {
	if s.mqtt == nil || !s.mqtt.IsConnected() {
		return fmt.Errorf("mqtt: not connected, cannot publish to %s", topic)
	}
	tok := s.mqtt.Publish(topic, 1, false, payload)
	if !tok.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("mqtt: publish timeout to %s", topic)
	}
	return tok.Error()
}

func (s *MQTTService) subscribe(c mqtt.Client) {
	token := c.Subscribe(s.cfg.MQTTTopic, 1, s.handleMessage)
	token.Wait()
	if err := token.Error(); err != nil {
		log.Printf("[MQTT] Subscribe error: %v", err)
	} else {
		log.Printf("[MQTT] Subscribed to: %s", s.cfg.MQTTTopic)
	}
	// OTA/info (retained, §11): текущая версия прошивки устройства — для health-check.
	if t := c.Subscribe("devices/+/OTA/info", 1, s.handleOtaInfo); t.Wait() && t.Error() != nil {
		log.Printf("[MQTT] OTA/info subscribe error: %v", t.Error())
	} else {
		log.Printf("[MQTT] Subscribed to: devices/+/OTA/info")
	}
}

// parseClientIDFromTopic извлекает <client_id> из topic вида
// "devices/<client_id>/telemetry". TrimSpace защищает strict-lookup от
// firmware-bug'ов с whitespace в публикуемом топике.
// Возвращает пустую строку для невалидного формата.
func parseClientIDFromTopic(topic string) string {
	parts := strings.Split(topic, "/")
	if len(parts) != 3 || parts[0] != "devices" || parts[2] != "telemetry" {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// handleMessage — strict mode v2: принимает сообщение только от
// зарегистрированного active-устройства с совпадающим device_uid (anti-spoofing).
// Любое отклонение → лог + return, никакой записи в БД.
func (s *MQTTService) handleMessage(_ mqtt.Client, msg mqtt.Message) {
	log.Printf("[MQTT] Topic=%s Payload=%s", msg.Topic(), string(msg.Payload()))

	clientID := parseClientIDFromTopic(msg.Topic())
	if clientID == "" {
		log.Printf("[MQTT] rejected: invalid topic format %q (expected devices/<client_id>/telemetry)", msg.Topic())
		return
	}

	var t model.DeviceTelemetry
	if err := json.Unmarshal(msg.Payload(), &t); err != nil {
		log.Printf("[MQTT] JSON parse error: %v", err)
		return
	}

	// Lookup device по mqtt_client_id (strict pre-registration v2).
	var devUID uint32
	var status string
	switch err := s.db.QueryRow(
		`SELECT device_uid, status FROM devices WHERE mqtt_client_id = $1`, clientID,
	).Scan(&devUID, &status); {
	case err == sql.ErrNoRows:
		log.Printf("[MQTT] rejected: unknown client_id %q (not pre-registered)", clientID)
		return
	case err != nil:
		log.Printf("[MQTT] device lookup error for %q: %v", clientID, err)
		return
	}

	if status != "active" {
		log.Printf("[MQTT] rejected: client_id %q is not active (status=%s)", clientID, status)
		return
	}

	if t.ID != devUID {
		log.Printf("[MQTT] rejected: id mismatch for client_id %q (payload.id=%d, expected device_uid=%d)",
			clientID, t.ID, devUID)
		return
	}

	// Update last_seen для зарегистрированного устройства (не auto-create).
	if _, err := s.db.Exec(
		`UPDATE devices SET last_seen = NOW(), updated_at = NOW() WHERE mqtt_client_id = $1`,
		clientID,
	); err != nil {
		log.Printf("[MQTT] last_seen update error for %q: %v", clientID, err)
	}

	// Save raw telemetry
	if err := s.saveTelemetry(t); err != nil {
		log.Printf("[MQTT] telemetry insert error: %v", err)
	}

	// Update vehicle position (only if device is assigned to a vehicle and GPS fix is valid)
	if err := s.updateVehicle(t); err != nil {
		log.Printf("[MQTT] vehicle update error: %v", err)
	}

	// Broadcast to WebSocket clients
	broadcast := model.WSBroadcast{Type: "device_telemetry", Data: t}
	data, _ := json.Marshal(broadcast)
	s.hub.Broadcast(data)
}

func isValidCoord(lat, lon float64) bool {
	return lat >= 36.0 && lat <= 46.0 && lon >= 56.0 && lon <= 74.0
}

func (s *MQTTService) saveTelemetry(t model.DeviceTelemetry) error {
	deviceTime := time.Unix(int64(t.Tim), 0).UTC()

	// Координаты храним, если они валидны (в bbox Узбекистана) — НЕ привязываемся к флагу
	// fix: устройства шлют его по-разному (true / 1 / 2 / 3 / "3D" …), и неузнанный формат
	// раньше ронял валидные координаты в NULL (позиция «замораживалась»). isValidCoord уже
	// отсекает мусор (0,0 и вне региона). gnss_fix-флаг сохраняем отдельно для информации.
	var lat, lon interface{}
	if isValidCoord(t.Lat, t.Lon) {
		lat, lon = t.Lat, t.Lon
	}

	// Версия прошивки/протокола (KAN-10): legacy-прибор ver не шлёт → NULL.
	var verArg interface{}
	if t.Ver != "" {
		verArg = t.Ver
	}

	// Масса газа из давления+температуры (KAN-10c) — основа расчёта расхода после убирания
	// расходомера. Считаем при наличии давления и заданного объёма баллона; иначе NULL.
	var gasMassArg interface{}
	if t.Prs > 0 {
		if volL := s.cngVolumeL(t.ID); volL > 0 {
			gasMassArg = physics.GasMassKg(t.Prs, t.Tmp, volL)
		}
	}

	_, err := s.db.Exec(
		`INSERT INTO device_telemetry (device_uid, flow, pressure, lat, lon, temperature, speed, course, gnss_fix, device_time,
		 engine_temperature, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, ver, gas_mass_kg)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
		t.ID, t.Flw, t.Prs, lat, lon, t.Tmp, t.Spd, t.Crs, t.Fix == 1, deviceTime,
		t.Etm, t.Ax, t.Ay, t.Az, t.Gx, t.Gy, t.Gz, verArg, gasMassArg,
	)
	return err
}

func (s *MQTTService) updateVehicle(t model.DeviceTelemetry) error {
	// Devicening vehicle ga biriktirilgan vehicle ni topamiz
	var vehicleID string
	err := s.db.QueryRow(
		`SELECT v.id FROM vehicles v
		 INNER JOIN devices d ON d.id = v.device_id
		 WHERE d.device_uid = $1`, t.ID,
	).Scan(&vehicleID)

	if err != nil {
		// Device hech qaysi mashinaga biriktirilmagan — skip
		return nil
	}

	// Уровень CNG-топлива (%) из давления баллона: pressure/pFullBar*100, clamp 0..100.
	// pFullBar=200 бар — «полный» баллон (как в refuels-детекторе). Обновляем только при
	// наличии давления (>0); иначе fuelArg=nil и COALESCE($, fuel) сохраняет прежнее
	// значение (не затираем валидный уровень нулём при сбое/отсутствии датчика).
	var fuelArg interface{}
	if t.Prs > 0 {
		fuelArg = clampFuelPct(t.Prs / pFullBar * 100)
	}

	// Живую позицию машины обновляем по валидным координатам (см. saveTelemetry: не гейтим
	// по флагу fix, иначе неузнанный формат «замораживал» позицию на последней точке).
	if isValidCoord(t.Lat, t.Lon) {
		heading := int(math.Round(t.Crs))
		speed := int(math.Round(t.Spd))
		_, err = s.db.Exec(
			`UPDATE vehicles SET lat=$1, lng=$2, speed=$3, heading=$4, fuel=COALESCE($5, fuel), updated_at=NOW() WHERE id=$6`,
			t.Lat, t.Lon, speed, heading, fuelArg, vehicleID,
		)
	} else {
		_, err = s.db.Exec(`UPDATE vehicles SET fuel=COALESCE($1, fuel), updated_at=NOW() WHERE id=$2`, fuelArg, vehicleID)
	}
	return err
}

// pFullBar — давление «полного» CNG-баллона (бар). Согласовано с refuels-детектором.
const pFullBar = 200.0

// clampFuelPct — округляет процент топлива в int и зажимает в [0,100] (CHECK vehicles.fuel).
func clampFuelPct(pct float64) int {
	f := int(math.Round(pct))
	if f < 0 {
		return 0
	}
	if f > 100 {
		return 100
	}
	return f
}
