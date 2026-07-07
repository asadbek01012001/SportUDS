package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/energolink/vehicle-service/internal/crypto"
	"github.com/energolink/vehicle-service/internal/mqttctl"
	"github.com/energolink/vehicle-service/internal/repository"
)

var devRegCols = []string{
	"id", "device_uid", "mqtt_client_id", "name", "status",
	"organization_id", "plate", "last_seen", "ver",
}

// setupOTA — роутер с включённой mqtt-интеграцией (ctl смотрит на stub mqtt-service).
func setupOTA(t *testing.T, mqttURL string) (*gin.Engine, sqlmock.Sqlmock, func()) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	r := gin.New()
	ctl := mqttctl.New(mqttURL, "tok")
	NewVehicleHandlerWithMQTT(repository.NewVehicleRepository(db), ctl, crypto.Key{}).RegisterRoutes(r)
	return r, mock, func() { _ = db.Close() }
}

func TestStartDeviceUpdate_DisabledWhenNoMQTT(t *testing.T) {
	r, _, cleanup := setup(t) // NewVehicleHandler без mqttCtl
	defer cleanup()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/device-registry/183/update",
		strings.NewReader(`{"firmware_id":"fw-1"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
}

func TestStartDeviceUpdate_MissingFirmwareID(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(202) }))
	defer stub.Close()
	r, _, cleanup := setupOTA(t, stub.URL)
	defer cleanup()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/device-registry/183/update",
		strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
}

func TestStartDeviceUpdate_NotFoundOutsideOrg(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(202) }))
	defer stub.Close()
	r, mock, cleanup := setupOTA(t, stub.URL)
	defer cleanup()
	// Реестр вызывающего НЕ содержит uid=183 → 404 (org-isolation).
	mock.ExpectQuery(`FROM devices d`).
		WillReturnRows(sqlmock.NewRows(devRegCols).
			AddRow("d-9", 999, "lte-999", "CNG-999", "active", "org-1", "01X", time.Now(), "1.0"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/device-registry/183/update",
		strings.NewReader(`{"firmware_id":"fw-1"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestStartDeviceUpdate_ConflictSurfaces409(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"another OTA update is already in progress"}`))
	}))
	defer stub.Close()
	r, mock, cleanup := setupOTA(t, stub.URL)
	defer cleanup()
	mock.ExpectQuery(`FROM devices d`).
		WillReturnRows(sqlmock.NewRows(devRegCols).
			AddRow("d-1", 183, "lte-183", "CNG-183", "active", "org-1", "01A183", time.Now(), "1.0"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/device-registry/183/update",
		strings.NewReader(`{"firmware_id":"fw-1"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusConflict, w.Code, w.Body.String())
	require.NotContains(t, w.Body.String(), "/internal/ota/start") // не светим внутренний путь
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestStartDeviceUpdate_Success202(t *testing.T) {
	var gotPath string
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, rq *http.Request) {
		gotPath = rq.URL.Path
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"session_id":"s-1"}`))
	}))
	defer stub.Close()
	r, mock, cleanup := setupOTA(t, stub.URL)
	defer cleanup()
	mock.ExpectQuery(`FROM devices d`).
		WillReturnRows(sqlmock.NewRows(devRegCols).
			AddRow("d-1", 183, "lte-183", "CNG-183", "active", "org-1", "01A183", time.Now(), "1.0"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/device-registry/183/update",
		strings.NewReader(`{"firmware_id":"fw-1"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusAccepted, w.Code, w.Body.String())
	require.Equal(t, "/internal/ota/start", gotPath)
	require.NoError(t, mock.ExpectationsWereMet())
}
