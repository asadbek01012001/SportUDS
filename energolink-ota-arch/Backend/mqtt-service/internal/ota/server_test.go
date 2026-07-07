package ota

import (
	"bytes"
	"database/sql"
	"net"
	"sync"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

// TestServerHandle_HappyPath: коннект → claim offered → передача .bin (mockDevice ACK'ает) →
// статус applying + history pending.
func TestServerHandle_HappyPath(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	fw := bytes.Repeat([]byte{0xAB}, 600) // 3 DATA-чанка

	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_uid", "firmware_id"}).
			AddRow("sess-1", 183, "fw-1"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor, fw_crc32, bin`).
		WithArgs("fw-1").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor", "fw_crc32", "bin", "fw_crc32_b", "image_b"}).
			AddRow(1, 2, int64(CRC32(fw)), fw, nil, nil)) // legacy single-image (без B)
	mock.ExpectCommit()
	mock.ExpectExec(`UPDATE ota_sessions SET status=`).
		WithArgs("sess-1", "applying", 2, nil).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_firmware_history`).
		WithArgs(183, "1.2", "pending").
		WillReturnResult(sqlmock.NewResult(1, 1))

	srv := NewServer(st, ":0")
	conn, dev := net.Pipe()
	var got []byte
	var ok bool
	var wg sync.WaitGroup
	wg.Add(1)
	// Устройство шлёт HELLO (§9.4) первым; slot=B → свободен A → сервер шлёт image_A (=fw).
	go func() { defer wg.Done(); _, _ = dev.Write([]byte(FormatHello("B", 1, 2))); got, ok = mockDevice(t, dev, true, -1) }()

	srv.handle(conn) // блокирует до завершения передачи и закрытия conn
	wg.Wait()

	require.True(t, ok)
	require.Equal(t, fw, got)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestServerHandle_ActiveA_PicksImageB: устройство в HELLO сообщает активный слот A →
// сервер шлёт образ свободного слота B (§7.3), с его fw_crc32_b в HEADER.
func TestServerHandle_ActiveA_PicksImageB(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	fwA := bytes.Repeat([]byte{0xA1}, 300)
	fwB := bytes.Repeat([]byte{0xB2}, 400) // отличается от A → проверяем, что выбран именно B

	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_uid", "firmware_id"}).
			AddRow("sess-3", 185, "fw-3"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor, fw_crc32, bin`).
		WithArgs("fw-3").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor", "fw_crc32", "bin", "fw_crc32_b", "image_b"}).
			AddRow(2, 1, int64(CRC32(fwA)), fwA, int64(CRC32(fwB)), fwB))
	mock.ExpectCommit()
	mock.ExpectExec(`UPDATE ota_sessions SET status=`).
		WithArgs("sess-3", "applying", sqlmock.AnyArg(), nil).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_firmware_history`).
		WithArgs(185, "2.1", "pending").
		WillReturnResult(sqlmock.NewResult(1, 1))

	srv := NewServer(st, ":0")
	conn, dev := net.Pipe()
	var got []byte
	var ok bool
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); _, _ = dev.Write([]byte(FormatHello("A", 2, 1))); got, ok = mockDevice(t, dev, true, -1) }()

	srv.handle(conn)
	wg.Wait()
	require.True(t, ok)
	require.Equal(t, fwB, got) // получен образ свободного слота B, не A
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestServerDispatch_DropsAtCapacity: при заполненном семафоре (anti-DDoS) коннект закрывается
// немедленно — без goroutine и без обращения к store.
func TestServerDispatch_DropsAtCapacity(t *testing.T) {
	st, _, cleanup := newStore(t)
	defer cleanup()
	srv := NewServer(st, ":0")
	for i := 0; i < cap(srv.sem); i++ { // забиваем лимит
		srv.sem <- struct{}{}
	}
	conn, dev := net.Pipe()
	srv.dispatch(conn) // должен закрыть conn сразу (store не дёргается → нет mock-ожиданий)
	buf := make([]byte, 1)
	if _, err := dev.Read(buf); err == nil {
		t.Fatal("ожидалось закрытие соединения при перегрузке")
	}
}

// TestServerHandle_NoSession: коннект без offered-сессии → сервер просто закрывает соединение,
// SendFirmware не вызывается, статусы не пишутся.
func TestServerHandle_NoSession(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()

	srv := NewServer(st, ":0")
	conn, dev := net.Pipe()
	devDone := make(chan struct{})
	go func() {
		_, _ = dev.Write([]byte(FormatHello("A", 1, 0))) // HELLO, чтобы сервер не ждал таймаут
		buf := make([]byte, 1)
		_, _ = dev.Read(buf) // сервер закроет conn → Read вернёт ошибку
		close(devDone)
	}()

	srv.handle(conn)
	<-devDone
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestServerHandle_DeviceDrops: устройство роняет коннект на середине → SendFirmware падает →
// сессия failed + history failed.
func TestServerHandle_DeviceDrops(t *testing.T) {
	st, mock, cleanup := newStore(t)
	defer cleanup()
	fw := bytes.Repeat([]byte{0xCD}, 600)

	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE ota_sessions SET status='downloading'`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_uid", "firmware_id"}).
			AddRow("sess-2", 184, "fw-2"))
	mock.ExpectQuery(`SELECT ver_major, ver_minor, fw_crc32, bin`).
		WithArgs("fw-2").
		WillReturnRows(sqlmock.NewRows([]string{"ver_major", "ver_minor", "fw_crc32", "bin", "fw_crc32_b", "image_b"}).
			AddRow(1, 0, int64(CRC32(fw)), fw, nil, nil))
	mock.ExpectCommit()
	mock.ExpectExec(`UPDATE ota_sessions SET status=`).
		WithArgs("sess-2", "failed", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_firmware_history`).
		WithArgs(184, "1.0", "failed").
		WillReturnResult(sqlmock.NewResult(1, 1))

	srv := NewServer(st, ":0")
	conn, dev := net.Pipe()
	go func() {
		// HELLO, затем читаем триггер и сразу рвём коннект — сервер не получит ACK на HEADER.
		_, _ = dev.Write([]byte(FormatHello("A", 1, 0)))
		buf := make([]byte, len("OTAUPDATE"))
		_, _ = dev.Read(buf)
		dev.Close()
	}()

	srv.handle(conn)
	require.NoError(t, mock.ExpectationsWereMet())
}
