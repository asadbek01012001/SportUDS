package ota

import (
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRunHealthCheck_PromotesAndSyncs(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectExec(`UPDATE ota_sessions s SET status='success'`).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`UPDATE ota_sessions SET status='rolled-back'`).
		WithArgs(1800.0).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE device_firmware_history h SET result`).
		WillReturnResult(sqlmock.NewResult(0, 3))

	r, err := st.RunHealthCheck(30 * time.Minute)
	require.NoError(t, err)
	assert.Equal(t, int64(2), r.Confirmed)
	assert.Equal(t, int64(1), r.RolledBack)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRunHealthCheck_NoChangesSkipsHistorySync(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectExec(`UPDATE ota_sessions s SET status='success'`).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE ota_sessions SET status='rolled-back'`).
		WithArgs(1800.0).
		WillReturnResult(sqlmock.NewResult(0, 0))
	// history-sync НЕ вызывается (нет изменений).

	r, err := st.RunHealthCheck(30 * time.Minute)
	require.NoError(t, err)
	assert.Equal(t, int64(0), r.Confirmed)
	assert.Equal(t, int64(0), r.RolledBack)
	require.NoError(t, mock.ExpectationsWereMet())
}

// ConfirmApplyingByClientID — event-driven подтверждение (коммент Elbek 29.06): при приёме
// OTA/info applying-сессия этого устройства подтверждается СРАЗУ, без ожидания тика health-check.
func TestConfirmApplyingByClientID_PromotesAndSyncs(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	// success scoped по mqtt_client_id одного устройства.
	mock.ExpectExec(`UPDATE ota_sessions s SET status='success'`).
		WithArgs("lte-861234567890007").
		WillReturnResult(sqlmock.NewResult(0, 1))
	// при подтверждении — синхронизируем историю прошивок.
	mock.ExpectExec(`UPDATE device_firmware_history h SET result`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	r, err := st.ConfirmApplyingByClientID("lte-861234567890007")
	require.NoError(t, err)
	assert.Equal(t, int64(1), r.Confirmed)
	assert.Equal(t, int64(0), r.RolledBack)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Версия не изменилась (retained OTA/info при рестарте сервиса = pre_ota_version) — не подтверждаем,
// history-sync не вызывается.
func TestConfirmApplyingByClientID_NoChangeSkipsSync(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectExec(`UPDATE ota_sessions s SET status='success'`).
		WithArgs("lte-861234567890007").
		WillReturnResult(sqlmock.NewResult(0, 0))
	// history-sync НЕ вызывается (0 подтверждений).

	r, err := st.ConfirmApplyingByClientID("lte-861234567890007")
	require.NoError(t, err)
	assert.Equal(t, int64(0), r.Confirmed)
	require.NoError(t, mock.ExpectationsWereMet())
}
