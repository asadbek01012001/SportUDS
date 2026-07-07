package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config — mqtt-service konfiguratsiyasi (env orqali). SportUDS uchun moslashtirilgan:
// energolink'ning gaz/vehicle sozlamalari olib tashlangan, DB defaultlari SportUDS bazasiga
// (sportuds/postgres) qaratilgan.
type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	Port       string

	// OTATCPPort — OTA-serverning TCP porti (§6/§7): qurilma MQTT-triggerdan keyin shu yerga ulanadi.
	OTATCPPort string
	// OTAPublicHost / OTAPublicPort — OTA/cmd buyrug'idagi OMMAVIY manzil (ТЗ §3): qurilma
	// ichki manzilga (masalan 10.x) ulana olmaydi, unga tashqi (LTE/internet) manzil kerak.
	// host va port ALOHIDA. Masalan OTA_PUBLIC_HOST="170.168.6.84", OTA_PUBLIC_PORT="9000".
	OTAPublicHost string
	OTAPublicPort int

	// MQTT broker manzili, masalan tcp://mosquitto:1883
	MQTTBroker               string
	MQTTTopic                string
	MQTTClientID             string
	MQTTUsername             string
	MQTTPassword             string
	MQTTConnectRetryInterval time.Duration
	MQTTWatchdogInterval     time.Duration

	// DynSec — Mosquitto Dynamic Security orqali per-device MQTT akkauntlarni boshqarish uchun
	// alohida admin akkaunt ($CONTROL/dynamic-security/v1).
	DynSecAdminUsername string
	DynSecAdminPassword string

	// InternalToken — /internal/* endpointlar uchun Bearer (backend ↔ mqtt-service).
	InternalToken string
}

func Load() *Config {
	return &Config{
		DBHost:                   ge("DB_HOST", "localhost"),
		DBPort:                   ge("DB_PORT", "5432"),
		DBUser:                   ge("DB_USER", "postgres"),
		DBPassword:               ge("DB_PASSWORD", "sportuds_pass"),
		DBName:                   ge("DB_NAME", "sportuds"),
		DBSSLMode:                ge("DB_SSLMODE", "disable"),
		Port:                     ge("SERVICE_PORT", "8087"),
		OTATCPPort:               ge("OTA_TCP_PORT", "9000"),
		OTAPublicHost:            ge("OTA_PUBLIC_HOST", "170.168.6.84"),
		OTAPublicPort:            getInt("OTA_PUBLIC_PORT", 9000),
		MQTTBroker:               ge("MQTT_BROKER", "tcp://localhost:1883"),
		MQTTTopic:                ge("MQTT_TOPIC", "devices/+/telemetry"),
		MQTTClientID:             ge("MQTT_CLIENT_ID", "sportuds-mqtt-service"),
		MQTTUsername:             ge("MQTT_USERNAME", ""),
		MQTTPassword:             ge("MQTT_PASSWORD", ""),
		MQTTConnectRetryInterval: getDuration("MQTT_CONNECT_RETRY_INTERVAL", 5*time.Second),
		MQTTWatchdogInterval:     getDuration("MQTT_WATCHDOG_INTERVAL", 30*time.Second),
		DynSecAdminUsername:      ge("DYNSEC_ADMIN_USERNAME", "dynsec-admin"),
		DynSecAdminPassword:      ge("DYNSEC_ADMIN_PASSWORD", ""),
		InternalToken:            ge("INTERNAL_SERVICE_TOKEN", ""),
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
