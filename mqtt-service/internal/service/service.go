package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/sportuds/mqtt-service/internal/config"
	"github.com/sportuds/mqtt-service/internal/model"
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
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 512),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = true
			h.mu.Unlock()
			log.Printf("[WS] Client connected. Total: %d", len(h.clients))
		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.Send)
			}
			h.mu.Unlock()
			log.Printf("[WS] Client disconnected. Total: %d", len(h.clients))
		case msg := <-h.broadcast:
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.Send <- msg:
				default:
					close(c.Send)
					delete(h.clients, c)
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

	// onOtaInfo — OTA/info'dan versiya saqlangandan keyin chaqiriladigan callback (event-driven
	// OTA sessiyasini tasdiqlash, §11). main.go registratsiya qilmaguncha nil; chaqiruv nil-guard bilan.
	onOtaInfo func(clientID string)
}

func New(cfg *config.Config, db *sql.DB, hub *Hub) *MQTTService {
	return &MQTTService{cfg: cfg, db: db, hub: hub}
}

// SetOtaInfoHook OTA/info'dan versiya saqlangach chaqiriladigan callbackni ro'yxatdan o'tkazadi
// (ota.Store.ConfirmApplyingByClientID orqali OTA sessiyasini darhol tasdiqlash uchun).
func (s *MQTTService) SetOtaInfoHook(fn func(clientID string)) { s.onOtaInfo = fn }

func (s *MQTTService) Connect() error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(s.cfg.MQTTBroker)
	opts.SetClientID(s.cfg.MQTTClientID)
	opts.SetAutoReconnect(true)
	opts.SetCleanSession(false)
	// SetConnectRetry — paho initial Connect()ni fonda qayta uradi. Busiz brokerga birinchi
	// urinish muvaffaqiyatsiz bo'lsa (broker hali ko'tarilmagan) klient "o'lik" qoladi.
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
	// token.Wait() qilmaymiz — ConnectRetry=true bilan paho fonda cheksiz qayta uradi va Wait()
	// startup HTTP/WS serverni bloklagan bo'lardi.
	client.Connect()
	s.mqtt = client
	go s.connectWatchdog()
	return nil
}

// connectWatchdog paho fonda qayta ulanayotganda MQTT-pipe hali ko'tarilmaganini loglaydi.
// Muvaffaqiyatli ulanish yoki klient yopilishi bilan goroutine tugaydi.
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

// Publish payloadni topicga publish qiladi (QoS 1, retained emas). OTA-trigger ishlatadi
// (devices/<client_id>/OTA/cmd). ota.Publisher interfeysini amalga oshiradi.
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
	// OTA/info (retained, §11): qurilmaning joriy proshivka versiyasi — health-check uchun.
	if t := c.Subscribe("devices/+/OTA/info", 1, s.handleOtaInfo); t.Wait() && t.Error() != nil {
		log.Printf("[MQTT] OTA/info subscribe error: %v", t.Error())
	} else {
		log.Printf("[MQTT] Subscribed to: devices/+/OTA/info")
	}
}

// parseClientIDFromTopic "devices/<client_id>/telemetry" topicidan <client_id> ni ajratadi.
// TrimSpace strict-lookupni firmware whitespace-bug'laridan himoyalaydi. Noto'g'ri format → "".
func parseClientIDFromTopic(topic string) string {
	parts := strings.Split(topic, "/")
	if len(parts) != 3 || parts[0] != "devices" || parts[2] != "telemetry" {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// handleMessage — strict mode: xabar faqat ro'yxatdan o'tgan active qurilmadan va mos device_uid
// bilan qabul qilinadi (anti-spoofing). Har qanday chetlanish → log + return, bazaga yozilmaydi.
func (s *MQTTService) handleMessage(_ mqtt.Client, msg mqtt.Message) {
	log.Printf("[MQTT] Topic=%s Payload=%s", msg.Topic(), string(msg.Payload()))

	clientID := parseClientIDFromTopic(msg.Topic())
	if clientID == "" {
		log.Printf("[MQTT] rejected: invalid topic format %q (expected devices/<client_id>/telemetry)", msg.Topic())
		return
	}

	var t model.MachineTelemetry
	if err := json.Unmarshal(msg.Payload(), &t); err != nil {
		log.Printf("[MQTT] JSON parse error: %v", err)
		return
	}

	// Qurilmani mqtt_client_id bo'yicha topamiz (strict pre-registration).
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

	// Ro'yxatdan o'tgan qurilma uchun last_seen yangilash.
	if _, err := s.db.Exec(
		`UPDATE devices SET last_seen = NOW(), updated_at = NOW() WHERE mqtt_client_id = $1`,
		clientID,
	); err != nil {
		log.Printf("[MQTT] last_seen update error for %q: %v", clientID, err)
	}

	// Xom telemetriyani saqlash.
	if err := s.saveTelemetry(t, msg.Payload()); err != nil {
		log.Printf("[MQTT] telemetry insert error: %v", err)
	}

	// Agar qurilma trenajorga biriktirilgan va o'sha trenajorda aktiv QR-sessiya bo'lsa —
	// o'lchovni mavjud SportUDS oqimiga (measurements) uzatamiz.
	if err := s.feedActiveSession(t); err != nil {
		log.Printf("[MQTT] session measurement error: %v", err)
	}

	// WebSocket klientlarga jonli uzatish (web-trener / mobil).
	broadcast := model.WSBroadcast{Type: "machine_telemetry", Data: t}
	data, _ := json.Marshal(broadcast)
	s.hub.Broadcast(data)
}

// saveTelemetry xom telemetriyani machine_telemetry jadvaliga yozadi. To'liq payload jsonb sifatida
// saqlanadi (audit/kelajakdagi maydonlar uchun).
func (s *MQTTService) saveTelemetry(t model.MachineTelemetry, raw []byte) error {
	var deviceTime time.Time
	if t.Tim > 0 {
		deviceTime = time.Unix(int64(t.Tim), 0).UTC()
	} else {
		deviceTime = time.Now().UTC()
	}

	var verArg interface{}
	if t.Ver != "" {
		verArg = t.Ver
	}

	_, err := s.db.Exec(
		`INSERT INTO machine_telemetry
		   (device_uid, bar_cm, weight_kg, reps, speed, heart_rate, ver, payload, device_time)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
		t.ID, t.BarCm, t.WeightKg, t.Reps, t.Speed, t.HeartRate, verArg, string(raw), deviceTime,
	)
	return err
}

// feedActiveSession qurilma biriktirilgan trenajorning AKTIV machine_session'ini topib, o'lchovni
// measurements jadvaliga qo'shadi — shu tariqa IoT telemetriya mavjud QR-orqali seans oqimini
// jonli oziqlantiradi. bar_cm/weight_kg bo'lmasa yoki aktiv seans yo'q bo'lsa — no-op.
func (s *MQTTService) feedActiveSession(t model.MachineTelemetry) error {
	if t.BarCm == nil && t.WeightKg == nil {
		return nil
	}
	var sessionID string
	err := s.db.QueryRow(
		`SELECT ms.id FROM machine_sessions ms
		   JOIN devices d ON d.machine_id = ms.machine_id
		 WHERE d.device_uid = $1 AND ms.status = 'active'
		 ORDER BY ms.started_at DESC NULLS LAST
		 LIMIT 1`, t.ID,
	).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return nil // aktiv seans yo'q — telemetriya baribir machine_telemetry'da saqlandi
	}
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO measurements (session_id, bar_cm, weight_kg) VALUES ($1, $2, $3)`,
		sessionID, t.BarCm, t.WeightKg,
	)
	return err
}
