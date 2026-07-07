package ota

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newStore(t *testing.T) (*Store, sqlmock.Sqlmock, func()) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	return NewStore(db), mock, func() { _ = db.Close() }
}

func TestCreateSession(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectQuery(`INSERT INTO ota_sessions`).
		WithArgs(183, "fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("sess-1"))
	id, err := st.CreateSession(183, "fw-1")
	require.NoError(t, err)
	assert.Equal(t, "sess-1", id)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateSession_ActiveConflict(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	// unique-violation на partial-индексе idx_ota_one_active → ErrActiveSession.
	mock.ExpectQuery(`INSERT INTO ota_sessions`).
		WithArgs(183, "fw-1").
		WillReturnError(&pq.Error{Code: "23505"})
	_, err := st.CreateSession(183, "fw-1")
	require.ErrorIs(t, err, ErrActiveSession)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestClaimOffered_LoadsFirmware(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	bin := []byte{0x01, 0x02, 0x03, 0x04}
	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_uid", "firmware_id"}).
			AddRow("sess-1", 183, "fw-1"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor, fw_crc32, bin`).
		WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor", "fw_crc32", "bin", "fw_crc32_b", "image_b"}).
			AddRow(1, 3, int64(CRC32(bin)), bin, nil, nil)) // legacy single-image
	mock.ExpectCommit()

	sess, err := st.ClaimOffered()
	require.NoError(t, err)
	require.NotNil(t, sess)
	assert.Equal(t, "sess-1", sess.ID)
	assert.Equal(t, 183, sess.DeviceUID)
	assert.Equal(t, "1.3", sess.Version)
	assert.Equal(t, uint16(1), sess.VerMajor)
	assert.Equal(t, uint16(3), sess.VerMinor)
	assert.Equal(t, CRC32(bin), sess.FWCRC32)
	assert.Equal(t, bin, sess.Bin)
	assert.False(t, sess.HasB) // нет image_b → legacy
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestClaimOffered_NoneReturnsNil(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()
	sess, err := st.ClaimOffered()
	require.NoError(t, err)
	assert.Nil(t, sess)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestClaimOffered_FirmwareDeleted_MarksFailed(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_uid", "firmware_id"}).
			AddRow("sess-1", 183, "fw-gone"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor, fw_crc32, bin`).
		WithArgs("fw-gone").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(`UPDATE ota_sessions SET status='failed'`).
		WithArgs("sess-1", "firmware not found").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	sess, err := st.ClaimOffered()
	require.Error(t, err)
	assert.Nil(t, sess)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestClaimOffered_TransientLoadError_Rollback(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_uid", "firmware_id"}).
			AddRow("sess-1", 183, "fw-1"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor, fw_crc32, bin`).
		WithArgs("fw-1").WillReturnError(errors.New("connection reset"))
	mock.ExpectRollback() // сессия остаётся offered

	sess, err := st.ClaimOffered()
	require.Error(t, err)
	assert.Nil(t, sess)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUpdateStatus_NilErrorWhenEmpty(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	// errMsg="" → error column NULL.
	mock.ExpectExec(`UPDATE ota_sessions SET status=`).
		WithArgs("sess-1", "applying", 5, nil).
		WillReturnResult(sqlmock.NewResult(0, 1))
	require.NoError(t, st.UpdateStatus("sess-1", "applying", 5, ""))

	// errMsg!="" → пишется текст.
	mock.ExpectExec(`UPDATE ota_sessions SET status=`).
		WithArgs("sess-1", "failed", 2, "boom").
		WillReturnResult(sqlmock.NewResult(0, 1))
	require.NoError(t, st.UpdateStatus("sess-1", "failed", 2, "boom"))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestFirmwareVersion(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectQuery(`SELECT ver_major, ver_minor FROM firmwares`).
		WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor"}).AddRow(2, 7))
	major, minor, err := st.FirmwareVersion("fw-1")
	require.NoError(t, err)
	assert.Equal(t, uint16(2), major)
	assert.Equal(t, uint16(7), minor)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestClientIDByUID(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectQuery(`SELECT mqtt_client_id FROM devices`).
		WithArgs(183).
		WillReturnRows(sqlmock.NewRows([]string{"mqtt_client_id"}).AddRow("lte-861234567890183"))
	id, err := st.ClientIDByUID(183)
	require.NoError(t, err)
	assert.Equal(t, "lte-861234567890183", id)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestReapStaleSessions(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectExec(`UPDATE ota_sessions SET status='failed'`).
		WithArgs(600.0, 1800.0).
		WillReturnResult(sqlmock.NewResult(0, 2))
	n, err := st.ReapStaleSessions(10*time.Minute, 30*time.Minute)
	require.NoError(t, err)
	assert.Equal(t, int64(2), n)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRecordHistory_DefaultsPending(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectExec(`INSERT INTO device_firmware_history`).
		WithArgs(183, "1.3", "pending").
		WillReturnResult(sqlmock.NewResult(1, 1))
	require.NoError(t, st.RecordHistory(183, "1.3", "")) // "" → pending
	require.NoError(t, mock.ExpectationsWereMet())
}
