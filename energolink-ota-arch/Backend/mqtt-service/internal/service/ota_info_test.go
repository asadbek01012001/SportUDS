package service

import (
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseOtaInfoClientID(t *testing.T) {
	assert.Equal(t, "lte-123", parseOtaInfoClientID("devices/lte-123/OTA/info"))
	assert.Equal(t, "lte-123", parseOtaInfoClientID("devices/ lte-123 /OTA/info")) // TrimSpace
	assert.Equal(t, "", parseOtaInfoClientID("devices/lte-123/OTA/status"))        // не info
	assert.Equal(t, "", parseOtaInfoClientID("devices/lte-123/telemetry"))         // не OTA/info
	assert.Equal(t, "", parseOtaInfoClientID("devices/lte-123/OTA"))               // мало частей
}

func TestOtaInfoVersion(t *testing.T) {
	assert.Equal(t, "3.3", otaInfoVersion([]byte(`{"version":"3.3","target":"cng-lte"}`)))
	assert.Equal(t, "3.3.0", otaInfoVersion([]byte(`{"firmware_version":"3.3.0"}`))) // альт. имя
	assert.Equal(t, "1.7", otaInfoVersion([]byte(`{"ver":"1.7"}`)))
	assert.Equal(t, "", otaInfoVersion([]byte(`{"target":"cng-lte"}`)))             // нет версии
	assert.Equal(t, "", otaInfoVersion([]byte(`не json`)))                          // битый payload
	assert.Equal(t, "", otaInfoVersion([]byte(`{"version":""}`)))                   // пустая версия
}

func TestHandleOtaInfo_StoresVersion(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()
	mock.ExpectExec(`UPDATE devices SET ota_version=`).
		WithArgs("lte-860851086347064", "3.3").
		WillReturnResult(sqlmock.NewResult(0, 1))

	svc.handleOtaInfo(nil, fakeMessage{
		topic:   "devices/lte-860851086347064/OTA/info",
		payload: []byte(`{"version":"3.3","target":"cng-lte","active_slot":"B"}`),
	})
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestHandleOtaInfo_NoVersion_NoUpdate(t *testing.T) {
	svc, _, mock, cleanup := newSvc(t)
	defer cleanup()
	// Версии в payload нет → UPDATE не выполняется (нет ожиданий мока).
	svc.handleOtaInfo(nil, fakeMessage{
		topic:   "devices/lte-123/OTA/info",
		payload: []byte(`{"target":"cng-lte"}`),
	})
	require.NoError(t, mock.ExpectationsWereMet())
}
