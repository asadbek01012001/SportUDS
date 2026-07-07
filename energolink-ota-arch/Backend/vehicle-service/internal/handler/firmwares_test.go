package handler

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"

	"github.com/energolink/vehicle-service/internal/repository"
)

var fwCols = []string{
	"id", "ver_major", "ver_minor", "ver_patch", "target", "fw_size", "fw_crc32",
	"release_notes", "status", "channel", "uploaded_by", "created_at",
	"fw_size_b", "fw_crc32_b", "pair_check", "pair_check_detail",
}

// multipartFirmware собирает multipart-тело: файл .bin + текстовые поля формы.
func multipartFirmware(t *testing.T, bin []byte, fields map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	var b bytes.Buffer
	w := multipart.NewWriter(&b)
	fw, err := w.CreateFormFile("file", "fw.bin")
	require.NoError(t, err)
	_, _ = fw.Write(bin)
	for k, v := range fields {
		require.NoError(t, w.WriteField(k, v))
	}
	require.NoError(t, w.Close())
	return &b, w.FormDataContentType()
}

func TestUploadFirmware_HTTP201_ComputesSizeAndCRC(t *testing.T) {
	r, mock, cleanup := setup(t)
	defer cleanup()
	bin := []byte("hello-firmware-image")
	now := time.Now()

	// Один файл (legacy `file`) → image_B и pair_check NULL.
	mock.ExpectQuery(`INSERT INTO firmwares`).
		WithArgs(1, 2, 3, "STM32F401", len(bin), int64(repository.FirmwareCRC32(bin)), bin, nil, nil, nil, nil, nil, "rn", "beta", "beta", "").
		WillReturnRows(sqlmock.NewRows(fwCols).AddRow(
			"fw-1", 1, 2, 3, "STM32F401", len(bin), int64(repository.FirmwareCRC32(bin)), "rn", "beta", "beta", "", now, nil, nil, "", ""))

	body, ct := multipartFirmware(t, bin, map[string]string{
		"ver_major": "1", "ver_minor": "2", "ver_patch": "3", "target": "STM32F401", "release_notes": "rn", "channel": "beta", "status": "beta",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/firmwares", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	require.NoError(t, mock.ExpectationsWereMet())
}

// multipartFirmwarePair собирает тело с двумя файлами file_a/file_b (пара A/B, §7.1).
func multipartFirmwarePair(t *testing.T, binA, binB []byte, fields map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	var b bytes.Buffer
	w := multipart.NewWriter(&b)
	fa, err := w.CreateFormFile("file_a", "fw_a.bin")
	require.NoError(t, err)
	_, _ = fa.Write(binA)
	fb, err := w.CreateFormFile("file_b", "fw_b.bin")
	require.NoError(t, err)
	_, _ = fb.Write(binB)
	for k, v := range fields {
		require.NoError(t, w.WriteField(k, v))
	}
	require.NoError(t, w.Close())
	return &b, w.FormDataContentType()
}

func TestUploadFirmware_Pair_HTTP201_VerifiesAB(t *testing.T) {
	r, mock, cleanup := setup(t)
	defer cleanup()
	now := time.Now()
	binA := bytes.Repeat([]byte{0x11, 0x22, 0x33, 0x44}, 4)
	binB := bytes.Repeat([]byte{0x55, 0x66, 0x77, 0x88}, 4) // другой образ → не идентичны
	crcA := int64(repository.FirmwareCRC32(binA))
	crcB := int64(repository.FirmwareCRC32(binB))
	want := repository.VerifyABPair(binA, binB)

	mock.ExpectQuery(`INSERT INTO firmwares`).
		WithArgs(2, 1, 0, "STM32F401", len(binA), crcA, binA, binB, len(binB), crcB, want.Status, want.Detail, "", "stable", "draft", "").
		WillReturnRows(sqlmock.NewRows(fwCols).AddRow(
			"fw-p", 2, 1, 0, "STM32F401", len(binA), crcA, "", "draft", "stable", "", now,
			len(binB), crcB, want.Status, want.Detail))

	body, ct := multipartFirmwarePair(t, binA, binB, map[string]string{
		"ver_major": "2", "ver_minor": "1", "target": "STM32F401",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/firmwares", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUploadFirmware_HTTP400_TooLarge(t *testing.T) {
	r, _, cleanup := setup(t)
	defer cleanup()
	// >64 КБ → 400, в БД не идём.
	body, ct := multipartFirmware(t, make([]byte, fwSlotSize+1), map[string]string{
		"ver_major": "1", "ver_minor": "0", "target": "STM32F401",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/firmwares", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
}

func TestUploadFirmware_HTTP400_MissingFields(t *testing.T) {
	r, _, cleanup := setup(t)
	defer cleanup()
	// Без target/ver → 400.
	body, ct := multipartFirmware(t, []byte{0x01}, map[string]string{"ver_major": "1"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/firmwares", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
}

// Дубликат версии → 409 Conflict (не 500, без утечки имени constraint).
func TestUploadFirmware_HTTP409_Duplicate(t *testing.T) {
	r, mock, cleanup := setup(t)
	defer cleanup()
	bin := []byte{0x01, 0x02, 0x03}
	mock.ExpectQuery(`INSERT INTO firmwares`).
		WillReturnError(errors.New(`pq: duplicate key value violates unique constraint "firmwares_ver_unique"`))

	body, ct := multipartFirmware(t, bin, map[string]string{
		"ver_major": "1", "ver_minor": "7", "ver_patch": "0", "target": "stm32f401rc", "status": "stable",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/firmwares", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusConflict, w.Code, w.Body.String())
}

// Невалидный status → 400 (allowlist).
func TestUploadFirmware_HTTP400_BadStatus(t *testing.T) {
	r, _, cleanup := setup(t)
	defer cleanup()
	body, ct := multipartFirmware(t, []byte{0x01}, map[string]string{
		"ver_major": "1", "ver_minor": "0", "target": "stm32f401rc", "status": "hacked",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/firmwares", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
}
