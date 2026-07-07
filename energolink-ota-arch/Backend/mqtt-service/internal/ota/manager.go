package ota

import "fmt"

// manager.go — назначение OTA-обновления (admin-сторона): создать offered-сессию + MQTT-триггер.

// Manager связывает репозиторий сессий и MQTT-публикацию.
type Manager struct {
	store   *Store
	pub     Publisher
	otaHost string // публичный host OTA-сервера для команды (§3, коммент 10170)
	otaPort int    // публичный порт OTA-сервера
}

func NewManager(store *Store, pub Publisher, otaHost string, otaPort int) *Manager {
	return &Manager{store: store, pub: pub, otaHost: otaHost, otaPort: otaPort}
}

// StartUpdate назначает прошивку firmwareID устройству deviceUID: создаёт offered-сессию и
// публикует MQTT-команду (§7). Устройство откроет TCP, где TCP-сервер заберёт сессию
// (ClaimOffered) и передаст .bin по §3.4. Возвращает id сессии.
//
// Порядок: сперва резолвим client_id и версию (валидация устройства и прошивки), затем создаём
// сессию, затем публикуем. Если публикация не удалась — сессию помечаем failed, чтобы её не
// подхватил случайный коннект.
func (m *Manager) StartUpdate(deviceUID int, firmwareID string) (string, error) {
	clientID, err := m.store.ClientIDByUID(deviceUID)
	if err != nil {
		return "", err
	}
	major, minor, err := m.store.FirmwareVersion(firmwareID)
	if err != nil {
		return "", err
	}
	sessionID, err := m.store.CreateSession(deviceUID, firmwareID)
	if err != nil {
		return "", err
	}
	version := fmt.Sprintf("%d.%d", major, minor)
	if err := TriggerUpdate(m.pub, clientID, version, m.otaHost, m.otaPort, "normal"); err != nil {
		_ = m.store.UpdateStatus(sessionID, "failed", 0, err.Error())
		return "", err
	}
	return sessionID, nil
}
