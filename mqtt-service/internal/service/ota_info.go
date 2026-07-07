package service

import (
	"encoding/json"
	"log"
	"strings"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// ota_info.go — OTA/info qabul qilish (§10/§11). Qurilma passportini
// devices/<client_id>/OTA/info (retained) ga publish qiladi va har ulanishda (jumladan OTA/reset
// dan keyin) qayta chiqaradi. Proshivka versiyasi AYNAN shu yerda yashaydi — server uni ajratib
// devices.ota_version'da health-check (§11) uchun haqiqat manbai sifatida saqlaydi.

// parseOtaInfoClientID — devices/<client_id>/OTA/info topicidan <client_id>.
func parseOtaInfoClientID(topic string) string {
	parts := strings.Split(topic, "/")
	if len(parts) != 4 || parts[0] != "devices" || parts[2] != "OTA" || parts[3] != "info" {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// otaInfoVersion — OTA/info payloadidan proshivka versiyasi. Passport sxemasi proshivkaga bog'liq;
// keng tarqalgan maydon nomlarini sinaymiz. Topilmasa "" (xom payload logda — faktga qarab aniqlaymiz).
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

// handleOtaInfo qurilmaning joriy proshivka versiyasini OTA/info'dan devices'ga saqlaydi.
func (s *MQTTService) handleOtaInfo(_ mqtt.Client, msg mqtt.Message) {
	log.Printf("[OTA/info] Topic=%s Payload=%s", msg.Topic(), string(msg.Payload()))
	clientID := parseOtaInfoClientID(msg.Topic())
	if clientID == "" {
		return
	}
	ver := otaInfoVersion(msg.Payload())
	if ver == "" {
		log.Printf("[OTA/info] %s: versiya payloadda topilmadi (passport sxemasini tekshiring)", clientID)
		return
	}
	if _, err := s.db.Exec(
		`UPDATE devices SET ota_version=$2, ota_info_at=NOW() WHERE mqtt_client_id=$1`,
		clientID, ver); err != nil {
		log.Printf("[OTA/info] %s: update ota_version error: %v", clientID, err)
		return
	}
	log.Printf("[OTA/info] %s: joriy proshivka versiyasi %s", clientID, ver)
	// Event-driven OTA tasdiqi (§11): qurilma proshivkadan keyin darhol qayta ulanib OTA/info'ni
	// qayta chiqaradi — applying-sessiyani darhol tasdiqlaymiz (periodik health-check tikini kutmasdan).
	if s.onOtaInfo != nil {
		s.onOtaInfo(clientID)
	}
}
