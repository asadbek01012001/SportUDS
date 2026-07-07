package repository

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var fwCols = []string{
	"id", "ver_major", "ver_minor", "ver_patch", "target", "fw_size", "fw_crc32",
	"release_notes", "status", "channel", "uploaded_by", "created_at",
	"fw_size_b", "fw_crc32_b", "pair_check", "pair_check_detail",
}

func TestCreateFirmware_ComputesSizeAndCRC(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	bin := []byte("firmware-image-bytes")
	wantCRC := int64(FirmwareCRC32(bin)) // CRC-32/ISO-HDLC
	now := time.Now()

	// Сервер сам кладёт fw_size=len(bin) и fw_crc32 в INSERT.
	// Legacy single: image_b и метаданные B + pair_check = NULL.
	mock.ExpectQuery(`INSERT INTO firmwares`).
		WithArgs(1, 3, 1, "STM32F401", len(bin), wantCRC, bin, nil, nil, nil, nil, nil, "first", "stable", "draft", "user-1").
		WillReturnRows(sqlmock.NewRows(fwCols).AddRow(
			"fw-1", 1, 3, 1, "STM32F401", len(bin), wantCRC, "first", "draft", "stable", "user-1", now, nil, nil, "", ""))

	fw, err := repo.CreateFirmware(1, 3, 1, "STM32F401", bin, "first", "stable", "", "user-1")
	require.NoError(t, err)
	assert.Equal(t, len(bin), fw.FWSize)
	assert.Equal(t, FirmwareCRC32(bin), fw.FWCRC32)
	assert.Equal(t, "1.3.1", fw.Version)
	assert.Equal(t, "draft", fw.Status)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateFirmware_DefaultChannelStable(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	bin := []byte{0x01, 0x02}
	now := time.Now()
	// channel="" → "stable".
	mock.ExpectQuery(`INSERT INTO firmwares`).
		WithArgs(2, 0, 0, "F411", 2, int64(FirmwareCRC32(bin)), bin, nil, nil, nil, nil, nil, "", "stable", "draft", "").
		WillReturnRows(sqlmock.NewRows(fwCols).AddRow(
			"fw-2", 2, 0, 0, "F411", 2, int64(FirmwareCRC32(bin)), "", "draft", "stable", "", now, nil, nil, "", ""))

	fw, err := repo.CreateFirmware(2, 0, 0, "F411", bin, "", "", "", "")
	require.NoError(t, err)
	assert.Equal(t, "stable", fw.Channel)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestGetFirmwares_ListsMetadata(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	now := time.Now()
	mock.ExpectQuery(`SELECT .* FROM firmwares ORDER BY`).
		WillReturnRows(sqlmock.NewRows(fwCols).AddRow(
			"fw-1", 1, 3, 2, "STM32F401", 13000, int64(0xCBF43926), "notes", "stable", "stable", "u", now,
			13000, int64(0xABCDEF01), "ok", "структурно консистентно"))

	list, err := repo.GetFirmwares()
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "1.3.2", list[0].Version)
	assert.Equal(t, uint32(0xCBF43926), list[0].FWCRC32)
	require.NotNil(t, list[0].FWSizeB)
	assert.Equal(t, 13000, *list[0].FWSizeB)
	assert.Equal(t, "ok", list[0].PairCheck)
	require.NoError(t, mock.ExpectationsWereMet())
}

// CreateFirmwarePair: при двух образах сервер считает размер/CRC B и сверяет пару (§7.2).
func TestCreateFirmwarePair_ComputesBAndVerifies(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	now := time.Now()
	binA := words(0x08009000, 0x12345678, 0x0800A000)
	binB := words(0x08009000+0x38000, 0x12345678, 0x0800A000+0x38000) // единая дельта → ok
	wantA := int64(FirmwareCRC32(binA))
	wantB := int64(FirmwareCRC32(binB))
	want := VerifyABPair(binA, binB)

	mock.ExpectQuery(`INSERT INTO firmwares`).
		WithArgs(1, 5, 0, "STM32F401", len(binA), wantA, binA, binB, len(binB), wantB, want.Status, want.Detail, "", "beta", "beta", "u").
		WillReturnRows(sqlmock.NewRows(fwCols).AddRow(
			"fw-3", 1, 5, 0, "STM32F401", len(binA), wantA, "", "beta", "beta", "u", now,
			len(binB), wantB, want.Status, want.Detail))

	fw, err := repo.CreateFirmwarePair(1, 5, 0, "STM32F401", binA, binB, "", "beta", "beta", "u")
	require.NoError(t, err)
	assert.Equal(t, "ok", fw.PairCheck)
	require.NotNil(t, fw.FWCRC32B)
	require.NoError(t, mock.ExpectationsWereMet())
}

// DeleteFirmware (KAN-43): блок при активной сессии/раскатке, happy (снос истории+прошивки), not-found.

func TestDeleteFirmware_ActiveSession_Blocked(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT 1 FROM ota_sessions WHERE firmware_id`).
		WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"?column?"}).AddRow(1)) // активная сессия
	mock.ExpectRollback()

	found, err := repo.DeleteFirmware("fw-1")
	assert.False(t, found)
	assert.ErrorIs(t, err, ErrFirmwareInUse)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestDeleteFirmware_ActiveRollout_Blocked(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT 1 FROM ota_sessions WHERE firmware_id`).
		WithArgs("fw-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT 1 FROM ota_rollouts WHERE firmware_id`).
		WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"?column?"}).AddRow(1)) // активная раскатка
	mock.ExpectRollback()

	found, err := repo.DeleteFirmware("fw-1")
	assert.False(t, found)
	assert.ErrorIs(t, err, ErrFirmwareInUse)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestDeleteFirmware_Happy(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT 1 FROM ota_sessions WHERE firmware_id`).
		WithArgs("fw-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT 1 FROM ota_rollouts WHERE firmware_id`).
		WithArgs("fw-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(`DELETE FROM ota_rollouts WHERE firmware_id`).
		WithArgs("fw-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM ota_sessions WHERE firmware_id`).
		WithArgs("fw-1").WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectExec(`DELETE FROM firmwares WHERE id`).
		WithArgs("fw-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	found, err := repo.DeleteFirmware("fw-1")
	require.NoError(t, err)
	assert.True(t, found)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestDeleteFirmware_NotFound(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT 1 FROM ota_sessions WHERE firmware_id`).
		WithArgs("missing").WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT 1 FROM ota_rollouts WHERE firmware_id`).
		WithArgs("missing").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(`DELETE FROM ota_rollouts WHERE firmware_id`).
		WithArgs("missing").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM ota_sessions WHERE firmware_id`).
		WithArgs("missing").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM firmwares WHERE id`).
		WithArgs("missing").WillReturnResult(sqlmock.NewResult(0, 0)) // 0 строк → not found
	mock.ExpectRollback()

	found, err := repo.DeleteFirmware("missing")
	require.NoError(t, err)
	assert.False(t, found)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Дубликат версии major.minor.patch+target → ErrDuplicateFirmware (handler → 409).
func TestCreateFirmwarePair_DuplicateVersion(t *testing.T) {
	repo, mock, cleanup := newRepo(t)
	defer cleanup()
	bin := []byte{0x01, 0x02}
	mock.ExpectQuery(`INSERT INTO firmwares`).
		WillReturnError(errors.New(`pq: duplicate key value violates unique constraint "firmwares_ver_unique"`))

	_, err := repo.CreateFirmwarePair(1, 7, 0, "stm32f401rc", bin, nil, "", "stable", "stable", "u")
	assert.ErrorIs(t, err, ErrDuplicateFirmware)
	require.NoError(t, mock.ExpectationsWereMet())
}
