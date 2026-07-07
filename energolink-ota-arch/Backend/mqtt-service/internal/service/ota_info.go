package service

import (
	"encoding/json"
	"log"
	"strings"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// ota_info.go — приём OTA/info (§10/§11, KAN-43 v12). Устройство публикует паспорт в
// devices/<client_id>/OTA/info (retained), переиздаёт при каждом подключении (в т.ч. после
// reset/OTA). Версия прошивки живёт ИМЕННО здесь (не в телеметрии, коммент 10137 п.2) — сервер
// извлекает её и хранит в devices.ota_version как источник истины для health-check §11.

// parseOtaInfoClientID — <client_id> из topic devices/<client_id>/OTA/info.
func parseOtaInfoClientID(topic string) string {
	parts := strings.Split(topic, "/")
	if len(parts) != 4 || parts[0] != "devices" || parts[2] != "OTA" || parts[3] != "info" {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// otaInfoVersion — версия прошивки из payload OTA/info. Схема паспорта — за прошивкой; пробуем
// распространённые имена полей. "" если не нашли (тогда сырой payload в логе — уточним по факту).
func otaInfoVersion(payload []byte) string {
	var m map[string]interface{}
	if json.Unmarshal(payload, &m) != nil {
		return ""
	}
	for _, k := range []string{"version", "firmware_version", "fw_version", "ver", "fw_ver"} {
		if v, ok := m[k]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}

// handleOtaInfo сохраняет текущую версию прошивки устройства из OTA/info в devices.
func (s *MQTTService) handleOtaInfo(_ mqtt.Client, msg mqtt.Message) {
	log.Printf("[OTA/info] Topic=%s Payload=%s", msg.Topic(), string(msg.Payload()))
	clientID := parseOtaInfoClientID(msg.Topic())
	if clientID == "" {
		return
	}
	ver := otaInfoVersion(msg.Payload())
	if ver == "" {
		log.Printf("[OTA/info] %s: версия не найдена в payload (проверить схему паспорта)", clientID)
		return
	}
	if _, err := s.db.Exec(
		`UPDATE devices SET ota_version=$2, ota_info_at=NOW() WHERE mqtt_client_id=$1`,
		clientID, ver); err != nil {
		log.Printf("[OTA/info] %s: update ota_version error: %v", clientID, err)
		return
	}
	log.Printf("[OTA/info] %s: текущая версия прошивки %s", clientID, ver)
	// Event-driven подтверждение OTA (§11, коммент Elbek): устройство после прошивки сразу
	// переподключается и переиздаёт OTA/info — подтверждаем applying-сессию немедленно, не дожидаясь
	// тика периодического health-check (иначе сайт узнаёт об успехе с задержкой до 5 мин).
	if s.onOtaInfo != nil {
		s.onOtaInfo(clientID)
	}
}
