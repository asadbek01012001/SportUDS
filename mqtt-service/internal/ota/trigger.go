package ota

import (
	"encoding/json"
	"fmt"
)

// trigger.go — MQTT-триггер запуска обновления (§7). Сервер публикует команду в топик устройства;
// устройство (за LTE-NAT) само открывает TCP к OTA-серверу и запускает сессию §3.4.

// Publisher — абстракция MQTT-публикации (реализуется service.MQTTService.Publish).
type Publisher interface {
	Publish(topic string, payload []byte) error
}

// commandTopic — топик команд OTA устройства (ТЗ v12 §10: devices/<client_id>/OTA/cmd).
func commandTopic(clientID string) string { return "devices/" + clientID + "/OTA/cmd" }

// otaCommand — payload MQTT-команды запуска обновления (ТЗ v12 §3, формат прошивки).
// ВАЖНО (KAN-43 коммент 10170, живой тест на реальном устройстве):
//   - version — СТРОКА "maj.min" (не отдельные ver_major/ver_minor; иначе устройство читает v0.0);
//   - ota_host + ota_port — ПУБЛИЧНЫЙ адрес OTA-сервера (host и порт ОТДЕЛЬНО), доступный
//     устройству из интернета по LTE (не внутренний 10.10.7.x). Без них QIOPEN падает (565) → failed.
//   - level — §5 (normal/priority/force).
// ota_host/ota_port — БЕЗ omitempty: они обязательны (§3), и пропажа поля при нулевом значении
// (omitempty) ломала бы устройство «молча» (QIOPEN 565). Лучше явный 0/"" в JSON + валидация ниже.
type otaCommand struct {
	Cmd     string `json:"cmd"` // "ota_update"
	Version string `json:"version"`
	OtaHost string `json:"ota_host"`        // публичный host OTA-сервера (без порта), обязателен
	OtaPort int    `json:"ota_port"`        // публичный порт OTA-сервера, обязателен
	Level   string `json:"level,omitempty"` // normal/priority/force (§5)
}

// TriggerUpdate публикует команду обновления в топик OTA/cmd устройства: версия строкой,
// публичный host+port OTA-сервера, уровень срочности. Валидирует обязательные поля до публикации,
// чтобы не слать заведомо нерабочую команду (устройство по LTE без адреса упадёт на QIOPEN).
func TriggerUpdate(pub Publisher, clientID, version, otaHost string, otaPort int, level string) error {
	if otaHost == "" || otaPort == 0 {
		return fmt.Errorf("ota: пустой ota_host/ota_port (нужен публичный адрес OTA-сервера, OTA_PUBLIC_HOST/PORT)")
	}
	if level == "" {
		level = "normal"
	}
	payload, err := json.Marshal(otaCommand{
		Cmd: "ota_update", Version: version, OtaHost: otaHost, OtaPort: otaPort, Level: level,
	})
	if err != nil {
		return fmt.Errorf("ota: marshal command for %s: %w", clientID, err)
	}
	if err := pub.Publish(commandTopic(clientID), payload); err != nil {
		return fmt.Errorf("ota: publish trigger to %s: %w", clientID, err)
	}
	return nil
}
