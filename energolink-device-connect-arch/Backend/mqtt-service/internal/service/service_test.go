package service

import (
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/energolink/mqtt-service/internal/config"
	"github.com/energolink/mqtt-service/internal/model"
	"github.com/energolink/mqtt-service/internal/physics"
)

// fakeMessage implements mqtt.Message for tests.
type fakeMessage struct {
	topic   string
	payload []byte
}

func (m fakeMessage) Duplicate() bool   { return false }
func (m fakeMessage) Qos() byte         { return 1 }
func (m fakeMessage) Retained() bool    { return false }
func (m fakeMessage) Topic() string     { return m.topic }
func (m fakeMessage) MessageID() uint16 { return 0 }
func (m fakeMessage) Payload() []byte   { return m.payload }
func (m fakeMessage) Ack()              {}

var _ mqtt.Message = fakeMessage{}

func newSvc(t *testing.T) (*MQTTService, *Hub, sqlmock.Sqlmock, func()) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	hub := NewHub()
	go hub.Run()
	cfg := &config.Config{}
	return New(cfg, db, hub), hub, mock, func() { db.Close() }
}

// --- Hub ---

func TestHub_BroadcastDelivers(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	hub.Broadcast([]byte("hi"))

	select {
	case msg := <-c.Send:
		assert.Equal(t, "hi", string(msg))
	case <-time.After(time.Second):
		t.Fatal("client did not receive broadcast")
	}
}

func TestHub_UnregisterClosesSend(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	hub.Unregister(c)
	_, ok := <-c.Send
	assert.False(t, ok)
}

func TestHub_DropsSlowClient(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	c := &Client{Send: make(chan []byte)} // unbuffered → immediately drops
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	hub.Broadcast([]byte("drop-me"))
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 0
	}, time.Second, 5*time.Millisecond)
}

// --- handleMessage ---

// validPayload — JSON в формате актуальной model.DeviceTelemetry (см. internal/model).
// fix=1 → updateVehicle пойдёт в ветку UPDATE с lat/lng/speed/heading.
func validPayload() []byte {
	return []byte(`{"id":55,"flw":28.6,"prs":19.95,"tmp":42.8,"tim":1720448412,"fix":1,"lat":41.31,"lon":69.27,"spd":40,"crs":90}`)
}

// strictTopic — корректный topic для пре-регистрированного устройства id=55.
const strictTopic = "devices/lte-861234567890055/telemetry"
const strictClientID = "lte-861234567890055"

// expectStrictLookup — мокает SELECT device_uid, status WHERE mqtt_client_id.
func expectStrictLookup(mock sqlmock.Sqlmock, clientID string, devUID uint32, status string) {
	mock.ExpectQuery(`SELECT device_uid, status FROM devices WHERE mqtt_client_id`).
		WithArgs(clientID).
		WillReturnRows(sqlmock.NewRows([]string{"device_uid", "status"}).AddRow(devUID, status))
}

func TestHandleMessage_ValidPayload_PersistsAndBroadcasts(t *testing.T) {
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()

	// 1. Strict lookup → active device с device_uid=55
	expectStrictLookup(mock, strictClientID, 55, "active")
	// 2. UPDATE last_seen
	mock.ExpectExec(`UPDATE devices SET last_seen`).
		WithArgs(strictClientID).
		WillReturnResult(sqlmock.NewResult(0, 1))
	// 3a. saveTelemetry → lookup объёма баллона (KAN-10c) для расчёта массы газа
	mock.ExpectQuery(`SELECT v.cng_volume_l FROM vehicles`).
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"cng_volume_l"}).AddRow(90.0))
	// 3b. INSERT INTO device_telemetry (19 args: 10 base + 7 IMU/engine + ver + gas_mass_kg)
	mock.ExpectExec("INSERT INTO device_telemetry").
		WithArgs(uint32(55), 28.6, 19.95, 41.31, 69.27, 42.8, 40.0, 90.0, true, sqlmock.AnyArg(),
			nil, nil, nil, nil, nil, nil, nil, nil, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	// 4. updateVehicle: SELECT v.id FROM vehicles INNER JOIN devices
	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("v-1"))
	// 5. fix=1 → UPDATE с lat/lng/speed/heading
	mock.ExpectExec("UPDATE vehicles SET lat").
		WithArgs(41.31, 69.27, 40, 90, 10, "v-1"). // fuel=round(19.95/200*100)=10
		WillReturnResult(sqlmock.NewResult(0, 1))

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	svc.handleMessage(nil, fakeMessage{topic: strictTopic, payload: validPayload()})

	select {
	case msg := <-c.Send:
		assert.Contains(t, string(msg), "device_telemetry")
	case <-time.After(time.Second):
		t.Fatal("no broadcast received")
	}
}

func TestHandleMessage_WhitespaceTopic_TrimmedAndPersisted(t *testing.T) {
	// Реальная прошивка Cobalt817 шлёт топик с лидирующим пробелом перед
	// client_id. Trim должен срезать его → strict-lookup попадает в БД.
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()

	expectStrictLookup(mock, strictClientID, 55, "active")
	mock.ExpectExec(`UPDATE devices SET last_seen`).
		WithArgs(strictClientID).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT v.cng_volume_l FROM vehicles`).
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"cng_volume_l"}).AddRow(90.0))
	mock.ExpectExec("INSERT INTO device_telemetry").
		WithArgs(uint32(55), 28.6, 19.95, 41.31, 69.27, 42.8, 40.0, 90.0, true, sqlmock.AnyArg(),
			nil, nil, nil, nil, nil, nil, nil, nil, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("v-1"))
	mock.ExpectExec("UPDATE vehicles SET lat").
		WithArgs(41.31, 69.27, 40, 90, 10, "v-1"). // fuel=round(19.95/200*100)=10
		WillReturnResult(sqlmock.NewResult(0, 1))

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	dirtyTopic := "devices/ " + strictClientID + " /telemetry"
	svc.handleMessage(nil, fakeMessage{topic: dirtyTopic, payload: validPayload()})

	select {
	case msg := <-c.Send:
		assert.Contains(t, string(msg), "device_telemetry")
	case <-time.After(time.Second):
		t.Fatal("no broadcast received after whitespace trim")
	}
}

func TestHandleMessage_InvalidJSON_NoBroadcast(t *testing.T) {
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()
	// JSON parse падает ДО SQL — никаких mock'ов не должно быть.
	_ = mock

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	svc.handleMessage(nil, fakeMessage{topic: strictTopic, payload: []byte("not-json")})

	select {
	case <-c.Send:
		t.Fatal("invalid JSON must NOT trigger broadcast")
	case <-time.After(50 * time.Millisecond):
	}
}

// ── Strict-mode reject scenarios ────────────────────────────────────────────

func TestHandleMessage_InvalidTopic_RejectedWithoutSQL(t *testing.T) {
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	// devices/55 — legacy format без /telemetry → reject до JSON parse и SQL.
	svc.handleMessage(nil, fakeMessage{topic: "devices/55", payload: validPayload()})

	select {
	case <-c.Send:
		t.Fatal("invalid topic must NOT trigger broadcast")
	case <-time.After(50 * time.Millisecond):
	}
	require.NoError(t, mock.ExpectationsWereMet(), "no SQL должно быть выполнено")
}

func TestHandleMessage_EmptyClientIDInTopic_Rejected(t *testing.T) {
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()
	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	// devices//telemetry → пустой client_id, reject.
	svc.handleMessage(nil, fakeMessage{topic: "devices//telemetry", payload: validPayload()})

	select {
	case <-c.Send:
		t.Fatal("empty client_id must NOT trigger broadcast")
	case <-time.After(50 * time.Millisecond):
	}
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestHandleMessage_UnknownClientID_RejectedAfterLookup(t *testing.T) {
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()

	mock.ExpectQuery(`SELECT device_uid, status FROM devices WHERE mqtt_client_id`).
		WithArgs(strictClientID).
		WillReturnError(sql.ErrNoRows)

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	svc.handleMessage(nil, fakeMessage{topic: strictTopic, payload: validPayload()})

	select {
	case <-c.Send:
		t.Fatal("unknown client_id must NOT trigger broadcast")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestHandleMessage_InactiveDevice_Rejected(t *testing.T) {
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()

	expectStrictLookup(mock, strictClientID, 55, "suspended")

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	svc.handleMessage(nil, fakeMessage{topic: strictTopic, payload: validPayload()})

	select {
	case <-c.Send:
		t.Fatal("suspended device must NOT trigger broadcast")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestHandleMessage_IDMismatch_Rejected(t *testing.T) {
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()

	// device_uid=999 в БД, но payload.id=55 → mismatch.
	expectStrictLookup(mock, strictClientID, 999, "active")

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	svc.handleMessage(nil, fakeMessage{topic: strictTopic, payload: validPayload()})

	select {
	case <-c.Send:
		t.Fatal("id mismatch must NOT trigger broadcast (anti-spoofing)")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestHandleMessage_TelemetryInsertFail_BroadcastStillFires(t *testing.T) {
	// Если lookup прошёл и совпал, но INSERT в device_telemetry упал —
	// broadcast всё равно должен сработать (не блокируем frontend на DB-сбое).
	svc, hub, mock, cleanup := newSvc(t)
	defer cleanup()

	expectStrictLookup(mock, strictClientID, 55, "active")
	mock.ExpectExec(`UPDATE devices SET last_seen`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT v.cng_volume_l FROM vehicles`).WillReturnError(assert.AnError) // volume-lookup сбой не блокирует
	mock.ExpectExec("INSERT INTO device_telemetry").WillReturnError(assert.AnError)
	mock.ExpectQuery("SELECT v.id FROM vehicles").WillReturnError(assert.AnError)

	c := &Client{Send: make(chan []byte, 1)}
	hub.Register(c)
	require.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		return len(hub.clients) == 1
	}, time.Second, 5*time.Millisecond)

	svc.handleMessage(nil, fakeMessage{topic: strictTopic, payload: validPayload()})

	select {
	case msg := <-c.Send:
		assert.Contains(t, string(msg), "device_telemetry")
	case <-time.After(time.Second):
		t.Fatal("broadcast must fire even on telemetry/vehicle DB errors")
	}
}

func TestParseClientIDFromTopic(t *testing.T) {
	cases := []struct {
		topic string
		want  string
	}{
		{"devices/lte-861234567890123/telemetry", "lte-861234567890123"},
		{"devices/device-EL-001/telemetry", "device-EL-001"},
		{"devices//telemetry", ""},                       // пустой client_id
		{"devices/X/telemetry/extra", ""},                // лишний сегмент
		{"devices/X", ""},                                // нет /telemetry
		{"/devices/X/telemetry", ""},                     // ведущий слэш
		{"other/X/telemetry", ""},                        // не devices/
		{"devices/X/status", ""},                         // не /telemetry
		{"", ""},                                         // пустой topic
		// Whitespace tolerance — реальная прошивка Cobalt817 шлёт топик
		// с пробелом перед client_id; trim, иначе strict-lookup mismatch.
		{"devices/ lte-861234567890123/telemetry", "lte-861234567890123"},      // leading space
		{"devices/lte-861234567890123 /telemetry", "lte-861234567890123"},      // trailing space
		{"devices/  lte-861234567890123  /telemetry", "lte-861234567890123"},   // both
		{"devices/\tlte-861234567890123\t/telemetry", "lte-861234567890123"},   // tabs
		{"devices/   /telemetry", ""},                                          // только whitespace → пусто
	}
	for _, c := range cases {
		assert.Equal(t, c.want, parseClientIDFromTopic(c.topic), "topic=%q", c.topic)
	}
}

// --- updateVehicle ---

func TestUpdateVehicle_FixOn_UpdatesPositionAndHeading(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint8(7)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("v-1"))
	// Prs=0 → fuelArg=nil → fuel=COALESCE(NULL, fuel) сохраняет прежнее.
	mock.ExpectExec("UPDATE vehicles SET lat").
		WithArgs(41.0, 60.0, 50, 180, nil, "v-1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := svc.updateVehicle(model.DeviceTelemetry{
		ID: 7, Lat: 41.0, Lon: 60.0, Spd: 50, Crs: 180, Fix: 1,
	})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Невалидные координаты (вне bbox / 0,0) → позицию не трогаем, только fuel/updated_at.
func TestUpdateVehicle_InvalidCoord_UpdatesOnlyTimestamp(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint8(7)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("v-1"))
	mock.ExpectExec("UPDATE vehicles SET fuel=COALESCE\\(\\$1, fuel\\), updated_at=NOW\\(\\) WHERE id=").
		WithArgs(nil, "v-1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := svc.updateVehicle(model.DeviceTelemetry{
		ID: 7, Lat: 0, Lon: 0, Fix: 0, // (0,0) невалидно → позиция не обновляется
	})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// KAN-1: валидные координаты обновляют позицию ДАЖЕ при Fix=0 — флаг fix у устройств
// ненадёжен (разные прошивки шлют 2/3/"3D"/…), нельзя ронять валидную координату.
func TestUpdateVehicle_NoFixButValidCoord_UpdatesPosition(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint8(7)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("v-1"))
	mock.ExpectExec("UPDATE vehicles SET lat").
		WithArgs(41.0, 60.0, 50, 180, nil, "v-1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := svc.updateVehicle(model.DeviceTelemetry{
		ID: 7, Lat: 41.0, Lon: 60.0, Spd: 50, Crs: 180, Fix: 0,
	})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUpdateVehicle_NoVehicleAssigned_NoOp(t *testing.T) {
	// Device not linked to any vehicle → SELECT returns no rows → updateVehicle skips silently.
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint8(99)).
		WillReturnError(assert.AnError) // no rows / not found

	err := svc.updateVehicle(model.DeviceTelemetry{ID: 99, Fix: 1})
	require.NoError(t, err) // silent skip — not an error
}

// --- Connect ---

// TestConnect_DoesNotBlock — после фикса retry-loop'а Connect() запускает
// paho-retry в фоне и не блокирует startup даже если broker недоступен.
func TestConnect_DoesNotBlock(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	cfg := &config.Config{
		MQTTBroker:               "tcp://127.0.0.1:1", // unused port
		MQTTClientID:             "test",
		MQTTConnectRetryInterval: 5 * time.Second,
		MQTTWatchdogInterval:     30 * time.Second,
	}
	svc := New(cfg, db, NewHub())

	start := time.Now()
	err = svc.Connect()
	elapsed := time.Since(start)

	require.NoError(t, err, "Connect must not return error when paho is configured for retry")
	assert.Less(t, elapsed, 200*time.Millisecond, "Connect must not block on unreachable broker")
	// Note: paho IsConnected() возвращает true пока статус == "connecting"
	// при ConnectRetry=true (см. client.go:197-208). Реальный socket-state —
	// IsConnectionOpen(); он должен быть false для unused-порта.
	assert.False(t, svc.mqtt.IsConnectionOpen(), "socket must not actually be open")
	// cleanup — иначе paho retry goroutine утечёт
	svc.mqtt.Disconnect(0)
}

// TestConnect_OptionsSetConnectRetry — проверяем, что Connect() выставляет
// paho-опции SetConnectRetry(true) и SetConnectRetryInterval(cfg-значение),
// без которых initial-fail retry-loop не запускается.
func TestConnect_OptionsSetConnectRetry(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	cfg := &config.Config{
		MQTTBroker:               "tcp://127.0.0.1:1",
		MQTTClientID:             "test",
		MQTTConnectRetryInterval: 7 * time.Second,
		MQTTWatchdogInterval:     30 * time.Second,
	}
	svc := New(cfg, db, NewHub())
	require.NoError(t, svc.Connect())
	defer svc.mqtt.Disconnect(0)

	reader := svc.mqtt.OptionsReader()
	assert.True(t, reader.ConnectRetry(), "SetConnectRetry(true) must be applied")
	assert.Equal(t, 7*time.Second, reader.ConnectRetryInterval(), "ConnectRetryInterval must reflect cfg")
	assert.True(t, reader.AutoReconnect(), "AutoReconnect must stay enabled")
}

// --- CNG fuel from pressure (fix: «Топливо 100% всегда») ---

func TestClampFuelPct(t *testing.T) {
	cases := []struct {
		pct  float64
		want int
	}{
		{86.0 / 200 * 100, 43}, // 86 бар → 43%
		{19.95 / 200 * 100, 10},
		{0, 0},
		{250.0 / 200 * 100, 100}, // >полного → clamp 100
		{-5, 0},
		{99.6, 100}, // округление вверх
	}
	for _, c := range cases {
		if got := clampFuelPct(c.pct); got != c.want {
			t.Errorf("clampFuelPct(%.4f) = %d, want %d", c.pct, got, c.want)
		}
	}
}

// updateVehicle (fix=0): обновляет fuel из давления через COALESCE, без позиции.
func TestUpdateVehicle_NoFix_UpdatesFuelFromPressure(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("v-1"))
	// 86 бар → fuel=43; ветка else (fix=0) пишет fuel=COALESCE($1, fuel).
	mock.ExpectExec("UPDATE vehicles SET fuel=COALESCE").
		WithArgs(43, "v-1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, svc.updateVehicle(model.DeviceTelemetry{ID: 55, Prs: 86.0, Fix: 0}))
	require.NoError(t, mock.ExpectationsWereMet())
}

// updateVehicle при prs=0 НЕ затирает fuel: fuelArg=nil → COALESCE(NULL, fuel)=fuel.
func TestUpdateVehicle_ZeroPressure_KeepsFuel(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	mock.ExpectQuery("SELECT v.id FROM vehicles").
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("v-1"))
	mock.ExpectExec("UPDATE vehicles SET fuel=COALESCE").
		WithArgs(nil, "v-1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, svc.updateVehicle(model.DeviceTelemetry{ID: 55, Prs: 0, Fix: 0}))
	require.NoError(t, mock.ExpectationsWereMet())
}

// ── KAN-10c: масса газа из давления+температуры при приёме телеметрии ──────────

func TestSaveTelemetry_ComputesGasMassFromPressure(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	// Объём баллона 90 л → масса считается по физмодели реального газа.
	mock.ExpectQuery(`SELECT v.cng_volume_l FROM vehicles`).
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"cng_volume_l"}).AddRow(90.0))
	wantMass := physics.GasMassKg(200, 15, 90)
	mock.ExpectExec("INSERT INTO device_telemetry").
		WithArgs(uint32(55), 0.0, 200.0, nil, nil, 15.0, 0.0, 0.0, false, sqlmock.AnyArg(),
			nil, nil, nil, nil, nil, nil, nil, nil, wantMass).
		WillReturnResult(sqlmock.NewResult(1, 1))

	if err := svc.saveTelemetry(model.DeviceTelemetry{ID: 55, Prs: 200, Tmp: 15}); err != nil {
		t.Fatalf("saveTelemetry: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations: %v", err)
	}
}

func TestSaveTelemetry_NoPressure_GasMassNull(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	// Prs=0 → объём НЕ запрашиваем (нет ExpectQuery), gas_mass_kg = NULL.
	mock.ExpectExec("INSERT INTO device_telemetry").
		WithArgs(uint32(55), 0.0, 0.0, nil, nil, 0.0, 0.0, 0.0, false, sqlmock.AnyArg(),
			nil, nil, nil, nil, nil, nil, nil, nil, nil).
		WillReturnResult(sqlmock.NewResult(1, 1))

	if err := svc.saveTelemetry(model.DeviceTelemetry{ID: 55, Prs: 0}); err != nil {
		t.Fatalf("saveTelemetry: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations: %v", err)
	}
}

func TestSaveTelemetry_NoVolume_GasMassNull(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	// Давление есть, но cng_volume_l у ТС не задан (NULL) → gas_mass_kg = NULL.
	mock.ExpectQuery(`SELECT v.cng_volume_l FROM vehicles`).
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"cng_volume_l"}).AddRow(nil))
	mock.ExpectExec("INSERT INTO device_telemetry").
		WithArgs(uint32(55), 0.0, 180.0, nil, nil, 20.0, 0.0, 0.0, false, sqlmock.AnyArg(),
			nil, nil, nil, nil, nil, nil, nil, nil, nil).
		WillReturnResult(sqlmock.NewResult(1, 1))

	if err := svc.saveTelemetry(model.DeviceTelemetry{ID: 55, Prs: 180, Tmp: 20}); err != nil {
		t.Fatalf("saveTelemetry: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations: %v", err)
	}
}

func TestCngVolumeL_CachesWithinTTL(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()

	// Объём запрашивается РОВНО один раз; второй saveTelemetry берёт из кэша.
	mock.ExpectQuery(`SELECT v.cng_volume_l FROM vehicles`).
		WithArgs(uint32(55)).
		WillReturnRows(sqlmock.NewRows([]string{"cng_volume_l"}).AddRow(90.0))
	mock.ExpectExec("INSERT INTO device_telemetry").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO device_telemetry").WillReturnResult(sqlmock.NewResult(1, 1))

	for _, prs := range []float64{200, 210} {
		if err := svc.saveTelemetry(model.DeviceTelemetry{ID: 55, Prs: prs, Tmp: 15}); err != nil {
			t.Fatalf("saveTelemetry: %v", err)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectations (один volume-запрос на два сообщения): %v", err)
	}
}
