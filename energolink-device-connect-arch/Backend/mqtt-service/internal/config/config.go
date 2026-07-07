package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	Port       string
	// OTATCPPort — TCP-порт OTA-сервера (§6/§7): устройство коннектится сюда после MQTT-триггера.
	OTATCPPort string
	// OTAPublicHost / OTAPublicPort — ПУБЛИЧНЫЙ адрес OTA-сервера для команды OTA/cmd (ТЗ §3,
	// коммент 10170): устройство по LTE не достучится до внутреннего адреса. host и порт ОТДЕЛЬНО.
	// Напр. OTA_PUBLIC_HOST="130.49.170.45", OTA_PUBLIC_PORT="9000".
	OTAPublicHost string
	OTAPublicPort int
	// MQTT broker address, e.g. tcp://192.168.1.100:1883
	MQTTBroker               string
	MQTTTopic                string
	MQTTClientID             string
	MQTTUsername             string
	MQTTPassword             string
	MQTTConnectRetryInterval time.Duration
	MQTTWatchdogInterval     time.Duration

	// DynSec — отдельный admin-аккаунт для управления per-device
	// клиентами через $CONTROL/dynamic-security/v1.
	DynSecAdminUsername string
	DynSecAdminPassword string
	// InternalToken — bearer для HTTP /internal/* endpoints (user-service ↔ mqtt-service).
	InternalToken string
	// Dispatch алертов: notification-service URL + shared X-Internal-Token (тот же, что у TG/email/sms).
	NotificationURL   string
	NotifyInternalTok string
}

func Load() *Config {
	return &Config{
		DBHost:                   ge("DB_HOST", "localhost"),
		DBPort:                   ge("DB_PORT", "5432"),
		DBUser:                   ge("DB_USER", "gaslink"),
		DBPassword:               ge("DB_PASSWORD", "gaslink_secret_2024"),
		DBName:                   ge("DB_NAME", "gaslink_db"),
		DBSSLMode:                ge("DB_SSLMODE", "disable"),
		Port:                     ge("SERVICE_PORT", "8087"),
		OTATCPPort:               ge("OTA_TCP_PORT", "9000"),
		// Дефолт — публичный IP ingress-nginx LB прода (порт 9000 проброшен на OTA-сервер).
		// Переопределяется env (предпочтительно — внести в helm-values вместо хардкода).
		OTAPublicHost: ge("OTA_PUBLIC_HOST", "130.49.170.45"),
		OTAPublicPort: getInt("OTA_PUBLIC_PORT", 9000),
		MQTTBroker:               ge("MQTT_BROKER", "tcp://localhost:1883"),
		MQTTTopic:                ge("MQTT_TOPIC", "devices/+/telemetry"),
		MQTTClientID:             ge("MQTT_CLIENT_ID", "gaslink-mqtt-service"),
		MQTTUsername:             ge("MQTT_USERNAME", ""),
		MQTTPassword:             ge("MQTT_PASSWORD", ""),
		MQTTConnectRetryInterval: getDuration("MQTT_CONNECT_RETRY_INTERVAL", 5*time.Second),
		MQTTWatchdogInterval:     getDuration("MQTT_WATCHDOG_INTERVAL", 30*time.Second),
		DynSecAdminUsername:      ge("DYNSEC_ADMIN_USERNAME", "dynsec-admin"),
		DynSecAdminPassword:      ge("DYNSEC_ADMIN_PASSWORD", ""),
		InternalToken:            ge("INTERNAL_SERVICE_TOKEN", ""),
		NotificationURL:          ge("NOTIFICATION_SERVICE_URL", "http://notification-service:8085"),
		NotifyInternalTok:        ge("TELEGRAM_INTERNAL_TOKEN", ""),
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode,
	)
}

func ge(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func getInt(k string, fallback int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getDuration(k string, fallback time.Duration) time.Duration {
	v := os.Getenv(k)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
