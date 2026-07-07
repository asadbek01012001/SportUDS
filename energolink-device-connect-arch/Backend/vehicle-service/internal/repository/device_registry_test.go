package repository

import (
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetDeviceRegistry_CurrentVersionFromTelemetry(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	now := time.Now()

	cols := []string{"id", "device_uid", "mqtt_client_id", "name", "status",
		"organization_id", "plate", "last_seen", "ver"}
	mock.ExpectQuery(`FROM devices d`).
		WithArgs("org-1").
		WillReturnRows(sqlmock.NewRows(cols).
			AddRow("d-1", 183, "lte-861234567890183", "CNG-183", "active", "org-1", "01A183AC", now, "1.2").
			AddRow("d-2", 184, "lte-861234567890184", "CNG-184", "active", "org-1", "01B000", nil, nil))

	list, err := repo.GetDeviceRegistry("org-1")
	require.NoError(t, err)
	require.Len(t, list, 2)
	assert.Equal(t, 183, list[0].DeviceUID)
	assert.Equal(t, "1.2", list[0].CurrentVersion) // из телеметрии ver
	assert.Equal(t, "01A183AC", list[0].VehiclePlate)
	require.NotNil(t, list[0].LastSeen)
	assert.Equal(t, "", list[1].CurrentVersion) // нет ver в телеметрии → пусто
	assert.Nil(t, list[1].LastSeen)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestListOtaSessions_JoinsAndScope(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	now := time.Now()

	cols := []string{"id", "device_uid", "mqtt_client_id", "plate", "organization_id",
		"org_name", "version", "ver", "status", "current_seq", "frames_total", "error",
		"created_at", "updated_at"}
	mock.ExpectQuery(`FROM ota_sessions s`).
		WithArgs("org-1").
		WillReturnRows(sqlmock.NewRows(cols).
			AddRow("s-1", 183, "lte-183", "01A183AC", "org-1", "ОргА", "1.7", "1.7", "success", 75, 75, nil, now, now).
			AddRow("s-2", 184, "lte-184", "01B000", "org-1", "ОргА", "1.7", "1.6", "downloading", 30, 75, "", now, now))

	list, err := repo.ListOtaSessions("org-1")
	require.NoError(t, err)
	require.Len(t, list, 2)
	assert.Equal(t, "success", list[0].Status)
	assert.Equal(t, "1.7", list[0].Version)
	assert.Equal(t, "1.7", list[0].LaunchedVersion) // health-check подтвердил
	assert.Equal(t, 30, list[1].CurrentSeq)
	assert.Equal(t, "downloading", list[1].Status)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestFirmwareHistory_RecordAndList(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	now := time.Now()

	// result="" → "pending".
	mock.ExpectExec(`INSERT INTO device_firmware_history`).
		WithArgs(183, "1.2", "pending").
		WillReturnResult(sqlmock.NewResult(1, 1))
	require.NoError(t, repo.RecordFirmwareHistory(183, "1.2", ""))

	mock.ExpectQuery(`FROM device_firmware_history`).
		WithArgs(183).
		WillReturnRows(sqlmock.NewRows([]string{"id", "version", "result", "created_at"}).
			AddRow("h-1", "1.2", "success", now))
	hist, err := repo.GetDeviceFirmwareHistory(183)
	require.NoError(t, err)
	require.Len(t, hist, 1)
	assert.Equal(t, "1.2", hist[0].Version)
	assert.Equal(t, "success", hist[0].Result)
	require.NoError(t, mock.ExpectationsWereMet())
}
