package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestLoad_Defaults(t *testing.T) {
	for _, k := range []string{
		"DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD",
		"DB_NAME", "DB_SSLMODE", "SERVICE_PORT",
		"MQTT_BROKER", "MQTT_TOPIC", "MQTT_CLIENT_ID",
		"MQTT_USERNAME", "MQTT_PASSWORD",
	} {
		t.Setenv(k, "")
	}
	cfg := Load()
	assert.Equal(t, "8087", cfg.Port)
	assert.Equal(t, "tcp://localhost:1883", cfg.MQTTBroker)
	assert.Equal(t, "devices/+/telemetry", cfg.MQTTTopic)
	assert.Empty(t, cfg.MQTTUsername)
}

func TestLoad_FromEnv(t *testing.T) {
	t.Setenv("MQTT_BROKER", "tcp://broker.example:1883")
	t.Setenv("MQTT_USERNAME", "u")
	cfg := Load()
	assert.Equal(t, "tcp://broker.example:1883", cfg.MQTTBroker)
	assert.Equal(t, "u", cfg.MQTTUsername)
}

func TestLoad_MQTTConnectRetryInterval_Default(t *testing.T) {
	t.Setenv("MQTT_CONNECT_RETRY_INTERVAL", "")
	cfg := Load()
	assert.Equal(t, 5*time.Second, cfg.MQTTConnectRetryInterval)
}

func TestLoad_MQTTConnectRetryInterval_FromEnv(t *testing.T) {
	t.Setenv("MQTT_CONNECT_RETRY_INTERVAL", "10s")
	cfg := Load()
	assert.Equal(t, 10*time.Second, cfg.MQTTConnectRetryInterval)
}

func TestLoad_MQTTConnectRetryInterval_InvalidFallsBackToDefault(t *testing.T) {
	t.Setenv("MQTT_CONNECT_RETRY_INTERVAL", "not-a-duration")
	cfg := Load()
	assert.Equal(t, 5*time.Second, cfg.MQTTConnectRetryInterval)
}

func TestLoad_MQTTWatchdogInterval_Default(t *testing.T) {
	t.Setenv("MQTT_WATCHDOG_INTERVAL", "")
	cfg := Load()
	assert.Equal(t, 30*time.Second, cfg.MQTTWatchdogInterval)
}

func TestLoad_MQTTWatchdogInterval_FromEnv(t *testing.T) {
	t.Setenv("MQTT_WATCHDOG_INTERVAL", "1m")
	cfg := Load()
	assert.Equal(t, time.Minute, cfg.MQTTWatchdogInterval)
}

func TestDSN(t *testing.T) {
	cfg := &Config{
		DBHost: "h", DBPort: "1", DBUser: "u", DBPassword: "p",
		DBName: "d", DBSSLMode: "disable",
	}
	assert.Equal(t,
		"host=h port=1 user=u password=p dbname=d sslmode=disable",
		cfg.DSN(),
	)
}
