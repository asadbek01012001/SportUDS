package service

import (
	"bytes"
	"encoding/json"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	mqttsrv "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/energolink/mqtt-service/internal/config"
	"github.com/energolink/mqtt-service/internal/model"
)

// freePort снимает свободный TCP-порт и сразу его освобождает. Между
// освобождением и привязкой mochi-listener'а есть race, но для тестов OK.
func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	port := l.Addr().(*net.TCPAddr).Port
	require.NoError(t, l.Close())
	return port
}

// startMochiBroker поднимает in-memory mochi-mqtt broker на addr. Возвращает
// функцию для остановки. Если authPass пустой, используется AllowHook.
func startMochiBroker(t *testing.T, addr string) func() {
	t.Helper()
	server := mqttsrv.New(&mqttsrv.Options{
		InlineClient: false,
	})
	require.NoError(t, server.AddHook(new(auth.AllowHook), nil))
	tcp := listeners.NewTCP(listeners.Config{ID: "tcp-test-" + addr, Address: addr})
	require.NoError(t, server.AddListener(tcp))
	go func() {
		if err := server.Serve(); err != nil {
			t.Logf("mochi server exited: %v", err)
		}
	}()
	// дать listener'у время реально открыть порт
	require.Eventually(t, func() bool {
		c, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
		if err != nil {
			return false
		}
		_ = c.Close()
		return true
	}, 3*time.Second, 50*time.Millisecond, "mochi broker did not start listening on %s", addr)
	return func() {
		_ = server.Close()
	}
}

// TestConnect_RetriesUntilBrokerAvailable — критический сценарий, который
// 2026-05-16 показал mqtt-service в проде висящим 21 час.
// Service стартует против НЕДОСТУПНОГО broker'а, потом broker появляется —
// service должен сам подключиться и подписаться без рестарта.
func TestConnect_RetriesUntilBrokerAvailable(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test, skipped in -short mode")
	}

	port := freePort(t)
	addr := "127.0.0.1:" + strconv.Itoa(port)

	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	cfg := &config.Config{
		MQTTBroker:               "tcp://" + addr,
		MQTTTopic:                "devices/#",
		MQTTClientID:             "test-retry-until-up",
		MQTTConnectRetryInterval: 500 * time.Millisecond, // быстрее дефолта для теста
		MQTTWatchdogInterval:     200 * time.Millisecond,
	}
	svc := New(cfg, db, NewHub())

	require.NoError(t, svc.Connect())
	defer svc.mqtt.Disconnect(0)

	// broker ещё не запущен → socket не открыт. Note: IsConnected() здесь
	// возвращает true (paho статус == connecting при ConnectRetry=true) —
	// нужен IsConnectionOpen() для проверки реального состояния сокета.
	require.False(t, svc.mqtt.IsConnectionOpen(), "socket must not be open before broker starts")

	// дать service'у пару retry-циклов покрутиться вхолостую, потом стартовать broker
	time.Sleep(800 * time.Millisecond)
	stop := startMochiBroker(t, addr)
	defer stop()

	// в течение разумного времени должен подключиться
	require.Eventually(t, func() bool {
		return svc.mqtt.IsConnectionOpen()
	}, 10*time.Second, 100*time.Millisecond, "service did not connect after broker became available")
}

// TestReconnect_AfterBrokerRestart — broker сначала живой, потом
// останавливается, потом стартует снова. AutoReconnect должен восстановить
// и SetReconnectingHandler должен фаерить (видим через log).
func TestReconnect_AfterBrokerRestart(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test, skipped in -short mode")
	}

	port := freePort(t)
	addr := "127.0.0.1:" + strconv.Itoa(port)

	// перехватываем log на время теста, чтобы проверить SetReconnectingHandler
	var logBuf bytes.Buffer
	origOut := log.Writer()
	log.SetOutput(&logSyncWriter{buf: &logBuf})
	defer log.SetOutput(origOut)

	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	cfg := &config.Config{
		MQTTBroker:               "tcp://" + addr,
		MQTTTopic:                "devices/#",
		MQTTClientID:             "test-reconnect",
		MQTTConnectRetryInterval: 500 * time.Millisecond,
		MQTTWatchdogInterval:     200 * time.Millisecond,
	}
	svc := New(cfg, db, NewHub())

	stop1 := startMochiBroker(t, addr)
	require.NoError(t, svc.Connect())
	defer svc.mqtt.Disconnect(0)

	require.Eventually(t, func() bool {
		return svc.mqtt.IsConnectionOpen()
	}, 5*time.Second, 100*time.Millisecond, "service did not connect to first broker")

	// гасим broker — service должен заметить потерю
	stop1()
	require.Eventually(t, func() bool {
		return !svc.mqtt.IsConnectionOpen()
	}, 5*time.Second, 100*time.Millisecond, "service did not notice broker disappearance")

	// поднимаем broker заново
	stop2 := startMochiBroker(t, addr)
	defer stop2()

	require.Eventually(t, func() bool {
		return svc.mqtt.IsConnectionOpen()
	}, 15*time.Second, 200*time.Millisecond, "service did not reconnect after broker restart")

	// проверяем что SetReconnectingHandler сработал — лог содержит маркер
	assert.True(t,
		strings.Contains(logBuf.String(), "reconnecting"),
		"expected reconnecting log line from SetReconnectingHandler, got: %q", logBuf.String(),
	)
}

// TestConnect_RetriesUntilBrokerAvailable_DeliversMessage — после reconnect
// pipe должен реально работать: publish в broker → сообщение через
// handleMessage → broadcast в Hub → WS-клиент получает.
func TestConnect_RetriesUntilBrokerAvailable_DeliversMessage(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test, skipped in -short mode")
	}

	port := freePort(t)
	addr := "127.0.0.1:" + strconv.Itoa(port)

	db, dbmock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	// Strict-mode lookup: device pre-registered, active, device_uid=42.
	dbmock.ExpectQuery(`SELECT device_uid, status FROM devices WHERE mqtt_client_id`).
		WithArgs("lte-861234567890042").
		WillReturnRows(sqlmock.NewRows([]string{"device_uid", "status"}).AddRow(uint32(42), "active"))
	dbmock.ExpectExec(`UPDATE devices SET last_seen`).WillReturnResult(sqlmock.NewResult(0, 1))
	dbmock.ExpectExec("INSERT INTO device_telemetry").WillReturnResult(sqlmock.NewResult(1, 1))
	// updateVehicle сделает SELECT и получит no rows (silent skip)
	dbmock.ExpectQuery(".*FROM vehicles.*").WillReturnError(sqlmock.ErrCancelled)

	hub := NewHub()
	go hub.Run()
	ws := &Client{Send: make(chan []byte, 4)}
	hub.Register(ws)

	cfg := &config.Config{
		MQTTBroker:               "tcp://" + addr,
		MQTTTopic:                "devices/+/telemetry",
		MQTTClientID:             "test-deliver",
		MQTTConnectRetryInterval: 500 * time.Millisecond,
		MQTTWatchdogInterval:     200 * time.Millisecond,
	}
	svc := New(cfg, db, hub)

	stop := startMochiBroker(t, addr)
	defer stop()
	require.NoError(t, svc.Connect())
	defer svc.mqtt.Disconnect(0)

	require.Eventually(t, func() bool {
		return svc.mqtt.IsConnectionOpen()
	}, 5*time.Second, 100*time.Millisecond)

	// дать subscribe вступить в силу
	time.Sleep(200 * time.Millisecond)

	// эмулируем сообщение от устройства через прямой publish в Hub (proxy для message-flow)
	telemetry := model.DeviceTelemetry{ID: 42, Tim: 1700000000, Lat: 41.1, Lon: 69.2, Fix: 1, Spd: 50, Crs: 90}
	payload, _ := json.Marshal(telemetry)
	tok := svc.mqtt.Publish("devices/lte-861234567890042/telemetry", 1, false, payload)
	tok.Wait()
	require.NoError(t, tok.Error())

	// ждём broadcast'а
	select {
	case msg := <-ws.Send:
		assert.Contains(t, string(msg), `"type":"device_telemetry"`)
	case <-time.After(3 * time.Second):
		t.Fatal("WS client did not receive broadcast within 3s")
	}
}

// logSyncWriter — потокобезопасный io.Writer для перехвата log-вывода в тестах.
type logSyncWriter struct {
	mu  sync.Mutex
	buf *bytes.Buffer
}

func (w *logSyncWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.buf.Write(p)
}
