package ota

import (
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakePub struct {
	called  bool
	topic   string
	payload []byte
	err     error
}

func (f *fakePub) Publish(topic string, payload []byte) error {
	f.called = true
	f.topic = topic
	f.payload = payload
	return f.err
}

func TestManager_StartUpdate_Happy(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectQuery(`SELECT mqtt_client_id FROM devices`).WithArgs(183).
		WillReturnRows(sqlmock.NewRows([]string{"mqtt_client_id"}).AddRow("dev-183"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor FROM firmwares`).WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor"}).AddRow(1, 4))
	mock.ExpectQuery(`INSERT INTO ota_sessions`).WithArgs(183, "fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("sess-9"))

	pub := &fakePub{}
	mgr := NewManager(st, pub, "130.49.170.45", 9000)
	id, err := mgr.StartUpdate(183, "fw-1")
	require.NoError(t, err)
	assert.Equal(t, "sess-9", id)
	assert.True(t, pub.called)
	assert.Equal(t, "devices/dev-183/OTA/cmd", pub.topic) // §10 OTA/cmd
	assert.Contains(t, string(pub.payload), `"cmd":"ota_update"`)
	assert.Contains(t, string(pub.payload), `"version":"1.4"`)            // строкой (§3, коммент 10170)
	assert.Contains(t, string(pub.payload), `"ota_host":"130.49.170.45"`) // публичный host (без порта)
	assert.Contains(t, string(pub.payload), `"ota_port":9000`)            // публичный порт отдельно
	assert.Contains(t, string(pub.payload), `"level":"normal"`)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestManager_StartUpdate_PublishFails_MarksFailed(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectQuery(`SELECT mqtt_client_id FROM devices`).WithArgs(183).
		WillReturnRows(sqlmock.NewRows([]string{"mqtt_client_id"}).AddRow("dev-183"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor FROM firmwares`).WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor"}).AddRow(1, 4))
	mock.ExpectQuery(`INSERT INTO ota_sessions`).WithArgs(183, "fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("sess-9"))
	// publish упал → сессия помечается failed, чтобы её не подхватил случайный коннект.
	mock.ExpectExec(`UPDATE ota_sessions SET status=`).
		WithArgs("sess-9", "failed", 0, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	pub := &fakePub{err: errors.New("broker down")}
	mgr := NewManager(st, pub, "130.49.170.45", 9000)
	_, err := mgr.StartUpdate(183, "fw-1")
	require.Error(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Пустой ota_host (мисконфиг OTA_PUBLIC_HOST) → команда НЕ публикуется (упала бы на устройстве
// QIOPEN 565), сессия помечается failed.
func TestManager_StartUpdate_EmptyHost_MarksFailed(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectQuery(`SELECT mqtt_client_id FROM devices`).WithArgs(183).
		WillReturnRows(sqlmock.NewRows([]string{"mqtt_client_id"}).AddRow("dev-183"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor FROM firmwares`).WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor"}).AddRow(1, 4))
	mock.ExpectQuery(`INSERT INTO ota_sessions`).WithArgs(183, "fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("sess-9"))
	mock.ExpectExec(`UPDATE ota_sessions SET status=`).
		WithArgs("sess-9", "failed", 0, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	pub := &fakePub{}
	mgr := NewManager(st, pub, "", 9000) // публичный host не задан
	_, err := mgr.StartUpdate(183, "fw-1")
	require.Error(t, err)
	assert.False(t, pub.called) // команда не уходит
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestManager_StartUpdate_UnknownDevice(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	// client_id не найден → trigger не публикуется, сессия не создаётся.
	mock.ExpectQuery(`SELECT mqtt_client_id FROM devices`).WithArgs(999).
		WillReturnError(errors.New("sql: no rows in result set"))

	pub := &fakePub{}
	mgr := NewManager(st, pub, "130.49.170.45", 9000)
	_, err := mgr.StartUpdate(999, "fw-1")
	require.Error(t, err)
	assert.False(t, pub.called)
	require.NoError(t, mock.ExpectationsWereMet())
}
